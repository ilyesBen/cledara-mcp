import type {
  Application,
  Transaction,
  TransactionPage,
  TransactionQuery,
} from "./types.ts";

export const DEFAULT_BASE_URL = "https://api.cledara.com";

export class CledaraError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "CledaraError";
    this.status = status;
  }
}

export type ClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  // Cledara allows 120/min per key; stay under it so other users of the key keep headroom.
  maxRequestsPerMinute?: number;
  max429Retries?: number;
  applicationsCacheMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const STATUS_MESSAGES: Record<number, string> = {
  401: "Cledara rejected the API key (401). Check CLEDARA_API_KEY is set, enabled and not expired.",
  403: "The API key's user lacks permission for this data (403).",
  404: "Not found (404).",
  429: "Cledara rate limit hit (429) and retries were exhausted. Try again in a minute.",
};

export class CledaraClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #maxPerMinute: number;
  readonly #max429Retries: number;
  readonly #appsCacheMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  #requestTimes: number[] = [];
  #appsCache: { at: number; value: Application[] } | undefined;

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new CledaraError("CLEDARA_API_KEY is not set.");
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#fetch = options.fetch ?? fetch;
    this.#maxPerMinute = options.maxRequestsPerMinute ?? 100;
    this.#max429Retries = options.max429Retries ?? 3;
    this.#appsCacheMs = options.applicationsCacheMs ?? 5 * 60_000;
    this.#sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#now = options.now ?? Date.now;
  }

  async listApplications(): Promise<Application[]> {
    const cached = this.#appsCache;
    if (cached && this.#now() - cached.at < this.#appsCacheMs) return cached.value;
    const value = await this.#get<Application[]>("/v0/applications");
    this.#appsCache = { at: this.#now(), value };
    return value;
  }

  listTransactionsPage(query: TransactionQuery = {}): Promise<TransactionPage> {
    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    for (const id of query.applicationIds ?? []) params.append("applicationIds", id);
    if (query.offset) params.set("offset", String(query.offset));
    return this.#get<TransactionPage>("/v0/transactions", params);
  }

  // Follows nextOffset until exhausted or maxPages is reached.
  async listTransactions(
    query: Omit<TransactionQuery, "offset"> & { offset?: number },
    maxPages = 20,
  ): Promise<{
    transactions: Transaction[];
    totalCount: number;
    nextOffset: number | null;
    truncated: boolean;
  }> {
    const transactions: Transaction[] = [];
    let offset = query.offset;
    let page: TransactionPage;
    let pages = 0;
    do {
      page = await this.listTransactionsPage({ ...query, offset });
      transactions.push(...page.transactions);
      offset = page.nextOffset ?? undefined;
      pages++;
    } while (page.hasMore && page.nextOffset !== null && pages < maxPages);
    const truncated = page.hasMore && page.nextOffset !== null;
    return {
      transactions,
      totalCount: page.totalCount,
      nextOffset: truncated ? page.nextOffset : null,
      truncated,
    };
  }

  async getInvoiceUrl(transactionId: string): Promise<string> {
    const res = await this.#get<{ invoiceUrl: string }>(
      `/v0/transactions/${encodeURIComponent(transactionId)}/invoice-url`,
    );
    return res.invoiceUrl;
  }

  async #get<T>(path: string, params?: URLSearchParams): Promise<T> {
    const qs = params && params.size > 0 ? `?${params}` : "";
    const url = `${this.#baseUrl}${path}${qs}`;
    for (let attempt = 0; ; attempt++) {
      await this.#throttle();
      let res: Response;
      try {
        res = await this.#fetch(url, {
          headers: { Authorization: `Bearer ${this.#apiKey}`, Accept: "application/json" },
        });
      } catch (err) {
        throw new CledaraError(`Network error calling Cledara ${path}: ${(err as Error).message}`);
      }
      if (res.status === 429 && attempt < this.#max429Retries) {
        await this.#sleep(retryAfterMs(res.headers.get("retry-after")));
        continue;
      }
      if (!res.ok) {
        const base = STATUS_MESSAGES[res.status] ?? `Cledara returned HTTP ${res.status}.`;
        throw new CledaraError(`${base} (GET ${path})`, res.status);
      }
      return (await res.json()) as T;
    }
  }

  async #throttle(): Promise<void> {
    const windowMs = 60_000;
    let now = this.#now();
    this.#requestTimes = this.#requestTimes.filter((t) => now - t < windowMs);
    if (this.#requestTimes.length >= this.#maxPerMinute) {
      await this.#sleep(this.#requestTimes[0]! + windowMs - now);
      now = this.#now();
      this.#requestTimes = this.#requestTimes.filter((t) => now - t < windowMs);
    }
    this.#requestTimes.push(now);
  }
}

function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds < 0) return 5_000;
  return Math.min(seconds, 60) * 1000;
}
