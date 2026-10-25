import { CledaraClient, type ClientOptions } from "../src/client.ts";

export type Call = { url: URL; method: string | undefined; headers: Headers };
export type Responder = (url: URL) => Response | Promise<Response>;

export const FAKE_KEY = "test-key-not-real";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function fakeClient(respond: Responder, options: Partial<ClientOptions> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const client = new CledaraClient({
    apiKey: FAKE_KEY,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, method: init?.method, headers: new Headers(init?.headers) });
      return respond(url);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return { client, calls, sleeps };
}
