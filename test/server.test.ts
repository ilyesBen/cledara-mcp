import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.ts";
import { applications, transactions } from "./fixtures.ts";
import { fakeClient, json } from "./helpers.ts";

async function connect(respond = (url: URL) =>
  url.pathname === "/v0/applications"
    ? json(applications)
    : url.pathname.endsWith("/invoice-url")
      ? json({ invoiceUrl: "https://files.test/invoice.pdf" })
      : json({ transactions, nextOffset: null, hasMore: false, totalCount: transactions.length })) {
  const { client: api, calls } = fakeClient(respond);
  const server = createServer(api, () => new Date("2026-10-25T09:00:00Z"));
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as { text: string }[])[0]!.text;

test("exposes the seven read-only tools", async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "get_invoice_url",
    "list_applications",
    "list_people",
    "list_transactions",
    "missing_invoices",
    "spend_summary",
    "upcoming_renewals",
  ]);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
});

test("spend_summary defaults to the last 30 days", async () => {
  const { client, calls } = await connect();
  const res = await client.callTool({ name: "spend_summary", arguments: { groupBy: "team" } });
  const body = JSON.parse(text(res));
  assert.equal(body.range.from, "2026-09-25T09:00:00Z");
  assert.equal(body.range.to, "2026-10-25T09:00:00Z");
  assert.equal(body.totalsByCurrency.GBP.spend, 412.5);
  const txCall = calls.find((c) => c.url.pathname === "/v0/transactions")!;
  assert.equal(txCall.url.searchParams.get("from"), "2026-09-25T09:00:00Z");
});

test("list_transactions passes date-only ranges and filters types", async () => {
  const { client, calls } = await connect();
  const res = await client.callTool({
    name: "list_transactions",
    arguments: { from: "2026-10-01", to: "2026-10-31", types: ["cardReceive"] },
  });
  const body = JSON.parse(text(res));
  assert.equal(body.returned, 1);
  assert.equal(calls[0]!.url.searchParams.get("to"), "2026-10-31T23:59:59Z");
});

test("upcoming_renewals and get_invoice_url return JSON", async () => {
  const { client } = await connect();
  const renewals = JSON.parse(text(await client.callTool({ name: "upcoming_renewals", arguments: {} })));
  assert.equal(renewals.count, 1);
  const invoice = JSON.parse(
    text(
      await client.callTool({
        name: "get_invoice_url",
        arguments: { transactionId: transactions[0]!.id },
      }),
    ),
  );
  assert.equal(invoice.invoiceUrl, "https://files.test/invoice.pdf");
});

test("API errors come back as tool errors, not crashes", async () => {
  const { client } = await connect(() => json({}, 403));
  const res = await client.callTool({ name: "list_applications", arguments: {} });
  assert.equal(res.isError, true);
  assert.match(text(res), /403/);
});
