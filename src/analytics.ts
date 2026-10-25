// Pure functions that derive spend, renewal, invoice and people views from raw API data.
import type { Application, Transaction, TransactionType } from "./types.ts";

const DAY_MS = 86_400_000;

// Card payments net of refunds, plus reimbursements. Top-ups, flushes and
// transfers only move money between Cledara accounts, so they are not spend.
export const DEFAULT_SPEND_TYPES: TransactionType[] = ["cardSend", "cardReceive", "reimbursement"];

export type ApplicationFilter = {
  status?: Application["status"][];
  search?: string;
  owner?: string;
  team?: string;
};

export function filterApplications(apps: Application[], f: ApplicationFilter): Application[] {
  const search = f.search?.toLowerCase();
  const owner = f.owner?.toLowerCase();
  const team = f.team?.toLowerCase();
  return apps.filter(
    (a) =>
      (!f.status?.length || f.status.includes(a.status)) &&
      (!search || a.name.toLowerCase().includes(search)) &&
      (!owner || a.owner.name.toLowerCase().includes(owner) || a.owner.id === f.owner) &&
      (!team || a.teams.some((t) => t.name.toLowerCase().includes(team) || t.id === f.team)),
  );
}

// Accepts YYYY-MM-DD or RFC 3339; date-only bounds cover the whole day in UTC.
export function toRfc3339(value: string | undefined, bound: "start" | "end"): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${bound === "start" ? "00:00:00" : "23:59:59"}Z`;
  }
  if (Number.isNaN(Date.parse(value))) throw new Error(`Invalid date: ${value}`);
  return value;
}

export function defaultRange(now: Date, days = 30): { from: string; to: string } {
  return {
    from: new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 19) + "Z",
    to: now.toISOString().slice(0, 19) + "Z",
  };
}

export type SpendGroupBy = "application" | "team" | "owner" | "card" | "month" | "accountType";

type SpendRow = { key: string; label: string; currency: string; spend: number; transactionCount: number };

export function spendSummary(
  txs: Transaction[],
  apps: Application[],
  groupBy: SpendGroupBy,
  types: TransactionType[] = DEFAULT_SPEND_TYPES,
) {
  const appsById = new Map(apps.map((a) => [a.id, a]));
  const rows = new Map<string, SpendRow>();
  const totals = new Map<string, { spend: number; transactionCount: number }>();

  for (const tx of txs) {
    if (!types.includes(tx.type)) continue;
    // Debits are negative in the API; report spend as a positive number.
    const spend = -tx.amount;
    const total = totals.get(tx.currency) ?? { spend: 0, transactionCount: 0 };
    total.spend += spend;
    total.transactionCount++;
    totals.set(tx.currency, total);

    for (const { key, label } of groupKeys(tx, appsById, groupBy)) {
      const id = `${key}\u0000${tx.currency}`;
      const row = rows.get(id) ?? { key, label, currency: tx.currency, spend: 0, transactionCount: 0 };
      row.spend += spend;
      row.transactionCount++;
      rows.set(id, row);
    }
  }

  return {
    groupBy,
    transactionTypes: types,
    totalsByCurrency: Object.fromEntries(
      [...totals].map(([c, t]) => [c, { spend: round2(t.spend), transactionCount: t.transactionCount }]),
    ),
    groups: [...rows.values()]
      .map((r) => ({ ...r, spend: round2(r.spend) }))
      .sort((a, b) => (groupBy === "month" ? a.key.localeCompare(b.key) : b.spend - a.spend)),
    ...(groupBy === "team"
      ? { note: "Apps assigned to several teams count in full under each team, so team rows can sum to more than the total." }
      : {}),
  };
}

function groupKeys(
  tx: Transaction,
  appsById: Map<string, Application>,
  groupBy: SpendGroupBy,
): { key: string; label: string }[] {
  const app = tx.application ? appsById.get(tx.application.id) : undefined;
  switch (groupBy) {
    case "application":
      return tx.application
        ? [{ key: tx.application.id, label: tx.application.name }]
        : [{ key: "none", label: "(no application)" }];
    case "team": {
      const teams = app?.teams ?? [];
      return teams.length
        ? teams.map((t) => ({ key: t.id, label: t.name }))
        : [{ key: "none", label: "(no team)" }];
    }
    case "owner": {
      // Application owner when the payment is for an app, otherwise the card holder.
      const owner = app?.owner ?? tx.card?.owner;
      return owner ? [{ key: owner.id, label: owner.name }] : [{ key: "none", label: "(no owner)" }];
    }
    case "card":
      return tx.card
        ? [{ key: tx.card.id, label: `${tx.card.name ?? tx.card.type} ••${tx.card.number} (${tx.card.owner.name})` }]
        : [{ key: "none", label: "(no card)" }];
    case "month": {
      const month = tx.authorizedAt.slice(0, 7);
      return [{ key: month, label: month }];
    }
    case "accountType":
      return [{ key: tx.accountType, label: tx.accountType }];
  }
}

export function upcomingRenewals(
  apps: Application[],
  today: Date,
  withinDays: number,
  includeInactive = false,
) {
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + withinDays * DAY_MS).toISOString().slice(0, 10);
  // Cledara often leaves nextRenewalDate null (e.g. monthly soft-budget apps), so
  // fall back to the expected next payment date.
  const renewals = apps
    .filter((a) => includeInactive || (a.status !== "inactive" && a.status !== "disabled"))
    .flatMap((a) => {
      const date = a.nextRenewalDate ?? a.nextPayment?.date;
      if (!date || date < start || date > end) return [];
      return [{
        applicationId: a.id,
        name: a.name,
        status: a.status,
        date,
        dateSource: a.nextRenewalDate ? ("nextRenewalDate" as const) : ("nextPayment" as const),
        daysUntil: Math.round((Date.parse(date) - Date.parse(start)) / DAY_MS),
        nextPayment: a.nextPayment,
        currency: a.budget.currency,
        budget: a.budget,
        owner: a.owner.name,
        teams: a.teams.map((t) => t.name),
      }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const expectedByCurrency: Record<string, number> = {};
  for (const r of renewals) {
    if (r.nextPayment) {
      expectedByCurrency[r.currency] = round2((expectedByCurrency[r.currency] ?? 0) + r.nextPayment.amount);
    }
  }
  return { window: { from: start, to: end }, count: renewals.length, expectedByCurrency, renewals };
}

export function missingInvoices(txs: Transaction[]) {
  const missing = txs
    .filter((tx) => tx.type === "cardSend" && !tx.hasInvoice)
    .map((tx) => ({
      transactionId: tx.id,
      authorizedAt: tx.authorizedAt,
      amount: tx.amount,
      currency: tx.currency,
      localAmount: tx.localAmount,
      localCurrency: tx.localCurrency,
      description: tx.description,
      application: tx.application?.name ?? null,
      cardholder: tx.card?.owner.name ?? null,
      card: tx.card ? `${tx.card.name ?? tx.card.type} ••${tx.card.number}` : null,
    }))
    .sort((a, b) => b.authorizedAt.localeCompare(a.authorizedAt));

  const totalByCurrency: Record<string, number> = {};
  for (const m of missing) totalByCurrency[m.currency] = round2((totalByCurrency[m.currency] ?? 0) - m.amount);
  return { count: missing.length, totalByCurrency, transactions: missing };
}

type Person = {
  id: string;
  name: string;
  ownsApplications: string[];
  cards: { id: string; label: string; type: string; status: string }[];
};

// Cledara has no users endpoint; people are inferred from app owners and cardholders.
export function listPeople(apps: Application[], txs: Transaction[]) {
  const people = new Map<string, Person>();
  const person = (ref: { id: string; name: string }) => {
    let p = people.get(ref.id);
    if (!p) people.set(ref.id, (p = { id: ref.id, name: ref.name, ownsApplications: [], cards: [] }));
    return p;
  };
  const teams = new Map<string, { id: string; name: string; applications: string[] }>();

  for (const a of apps) {
    person(a.owner).ownsApplications.push(a.name);
    for (const t of a.teams) {
      const team = teams.get(t.id) ?? { id: t.id, name: t.name, applications: [] };
      team.applications.push(a.name);
      teams.set(t.id, team);
    }
  }
  for (const tx of txs) {
    if (!tx.card) continue;
    const p = person(tx.card.owner);
    if (!p.cards.some((c) => c.id === tx.card!.id)) {
      p.cards.push({
        id: tx.card.id,
        label: `${tx.card.name ?? tx.card.type} ••${tx.card.number}`,
        type: tx.card.type,
        status: tx.card.status,
      });
    }
  }

  return {
    note: "Derived from application owners and cardholders seen in transactions; people with neither are not listed.",
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
