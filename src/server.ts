import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  defaultRange,
  filterApplications,
  listPeople,
  missingInvoices,
  spendSummary,
  toRfc3339,
  upcomingRenewals,
} from "./analytics.ts";
import type { CledaraClient } from "./client.ts";
import { TRANSACTION_TYPES } from "./types.ts";

// Upper bound on pages fetched by tools that aggregate over a whole date range.
const AGGREGATE_MAX_PAGES = 50;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const dateArg = (what: string) =>
  z.string().optional().describe(`${what}: YYYY-MM-DD (UTC) or an RFC 3339 timestamp.`);
const applicationIdsArg = z
  .array(z.string().uuid())
  .optional()
  .describe("Only include transactions for these application IDs (from list_applications).");
const typesArg = z.array(z.enum(TRANSACTION_TYPES as [string, ...string[]]));

export function createServer(client: CledaraClient, now: () => Date = () => new Date()): McpServer {
  const server = new McpServer({ name: "cledara", version: "0.1.0" });

  const range = (from?: string, to?: string) => {
    const fallback = defaultRange(now());
    return {
      from: toRfc3339(from, "start") ?? fallback.from,
      to: toRfc3339(to, "end") ?? fallback.to,
    };
  };

  const fetchAll = async (q: { from: string; to: string; applicationIds?: string[] }) => {
    const res = await client.listTransactions(q, AGGREGATE_MAX_PAGES);
    const warning = res.truncated
      ? `Only the first ${res.transactions.length} of ${res.totalCount} transactions were included; narrow the date range for complete results.`
      : undefined;
    return { ...res, warning };
  };

  server.registerTool(
    "list_applications",
    {
      title: "List Cledara applications",
      description:
        "List SaaS applications in the Cledara workspace with status, owner, teams, budget, balance, next renewal date and expected next payment. Filters are optional.",
      inputSchema: {
        status: z
          .array(z.enum(["pending", "requested", "active", "disabled", "inactive"]))
          .optional()
          .describe("Only these statuses."),
        search: z.string().optional().describe("Case-insensitive substring match on the application name."),
        owner: z.string().optional().describe("Owner name (substring) or owner ID."),
        team: z.string().optional().describe("Team name (substring) or team ID."),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const apps = filterApplications(await client.listApplications(), args);
        return { count: apps.length, applications: apps };
      }),
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List Cledara transactions",
      description:
        "List raw Cledara transactions (SaaS and Spend cards, transfers, top-ups) in a date range. Amounts are negative for debits. Defaults to the last 30 days. If `nextOffset` is returned, call again with that offset for more.",
      inputSchema: {
        from: dateArg("Start of range (inclusive)"),
        to: dateArg("End of range (inclusive)"),
        applicationIds: applicationIdsArg,
        types: typesArg.optional().describe("Only return these transaction types (filtered after fetching)."),
        offset: z.number().int().min(0).optional().describe("Pagination offset from a previous call's nextOffset."),
        maxPages: z.number().int().min(1).max(20).default(5).describe("API pages to fetch in this call."),
      },
      annotations: READ_ONLY,
    },
    ({ from, to, applicationIds, types, offset, maxPages }) =>
      run(async () => {
        const res = await client.listTransactions({ ...range(from, to), applicationIds, offset }, maxPages);
        const transactions = types ? res.transactions.filter((t) => types.includes(t.type)) : res.transactions;
        return {
          totalCount: res.totalCount,
          returned: transactions.length,
          nextOffset: res.nextOffset,
          transactions,
        };
      }),
  );

  server.registerTool(
    "get_invoice_url",
    {
      title: "Get invoice download URL",
      description:
        "Get a download URL for the invoice attached to a transaction (only when hasInvoice is true). The URL expires after 5 minutes.",
      inputSchema: { transactionId: z.string().uuid().describe("Transaction ID.") },
      annotations: READ_ONLY,
    },
    ({ transactionId }) =>
      run(async () => ({ transactionId, invoiceUrl: await client.getInvoiceUrl(transactionId), expiresInMinutes: 5 })),
  );

  server.registerTool(
    "spend_summary",
    {
      title: "Summarise spend",
      description:
        "Total spend over a date range grouped by application, team, owner, card, month or account type, with separate totals per currency (no FX conversion). Spend counts card payments net of refunds plus reimbursements by default, reported as positive numbers. Defaults to the last 30 days.",
      inputSchema: {
        from: dateArg("Start of range (inclusive)"),
        to: dateArg("End of range (inclusive)"),
        groupBy: z.enum(["application", "team", "owner", "card", "month", "accountType"]).default("application"),
        applicationIds: applicationIdsArg,
        transactionTypes: typesArg
          .optional()
          .describe("Override which transaction types count as spend. Default: cardSend, cardReceive, reimbursement."),
      },
      annotations: READ_ONLY,
    },
    ({ from, to, groupBy, applicationIds, transactionTypes }) =>
      run(async () => {
        const r = range(from, to);
        const [txs, apps] = await Promise.all([fetchAll({ ...r, applicationIds }), client.listApplications()]);
        return {
          range: r,
          ...(txs.warning ? { warning: txs.warning } : {}),
          ...spendSummary(txs.transactions, apps, groupBy, transactionTypes as typeof TRANSACTION_TYPES | undefined),
        };
      }),
  );

  server.registerTool(
    "upcoming_renewals",
    {
      title: "Upcoming renewals",
      description:
        "Applications renewing or due a payment within the next N days, soonest first, with the expected payment amount and budget. Uses nextRenewalDate when Cledara sets it, otherwise the expected next payment date (see dateSource). Inactive and disabled apps are excluded unless includeInactive is true.",
      inputSchema: {
        withinDays: z.number().int().min(0).max(366).default(30),
        includeInactive: z.boolean().default(false),
      },
      annotations: READ_ONLY,
    },
    ({ withinDays, includeInactive }) =>
      run(async () => upcomingRenewals(await client.listApplications(), now(), withinDays, includeInactive)),
  );

  server.registerTool(
    "missing_invoices",
    {
      title: "Card payments missing invoices",
      description:
        "Card payments (cardSend) in a date range that have no invoice uploaded, newest first, with totals per currency. Useful for month-end close. Defaults to the last 30 days.",
      inputSchema: {
        from: dateArg("Start of range (inclusive)"),
        to: dateArg("End of range (inclusive)"),
        applicationIds: applicationIdsArg,
      },
      annotations: READ_ONLY,
    },
    ({ from, to, applicationIds }) =>
      run(async () => {
        const r = range(from, to);
        const txs = await fetchAll({ ...r, applicationIds });
        return { range: r, ...(txs.warning ? { warning: txs.warning } : {}), ...missingInvoices(txs.transactions) };
      }),
  );

  server.registerTool(
    "list_people",
    {
      title: "List people and teams",
      description:
        "People and teams in the workspace, inferred from application owners, application teams and cardholders seen in recent transactions (Cledara has no users endpoint).",
      inputSchema: {
        cardholderLookbackDays: z
          .number()
          .int()
          .min(0)
          .max(730)
          .default(90)
          .describe("How many days of transactions to scan for cardholders. 0 skips cardholders."),
      },
      annotations: READ_ONLY,
    },
    ({ cardholderLookbackDays }) =>
      run(async () => {
        const apps = await client.listApplications();
        if (cardholderLookbackDays === 0) return listPeople(apps, []);
        const txs = await fetchAll(defaultRange(now(), cardholderLookbackDays));
        return { ...(txs.warning ? { warning: txs.warning } : {}), ...listPeople(apps, txs.transactions) };
      }),
  );

  return server;
}

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 1) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
  }
}
