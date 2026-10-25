import assert from "node:assert/strict";
import { test } from "node:test";
import { CledaraError } from "../src/client.ts";
import { applications, transactions } from "./fixtures.ts";
import { FAKE_KEY, fakeClient, json } from "./helpers.ts";

test("sends the bearer key and hits the v0 applications endpoint", async () => {
  const { client, calls } = fakeClient(() => json(applications));
  const apps = await client.listApplications();
  assert.equal(apps.length, 3);
  assert.equal(calls[0]!.url.href, "https://api.cledara.com/v0/applications");
  assert.equal(calls[0]!.headers.get("authorization"), `Bearer ${FAKE_KEY}`);
});

test("caches applications until the TTL expires", async () => {
  let t = 0;
  const { client, calls } = fakeClient(() => json(applications), { now: () => t, applicationsCacheMs: 1000 });
  await client.listApplications();
  await client.listApplications();
  assert.equal(calls.length, 1);
  t = 1001;
  await client.listApplications();
  assert.equal(calls.length, 2);
});

test("serialises transaction filters as repeated query params", async () => {
  const { client, calls } = fakeClient(() =>
    json({ transactions: [], nextOffset: null, hasMore: false, totalCount: 0 }),
  );
  await client.listTransactionsPage({ from: "2026-01-01T00:00:00Z", applicationIds: ["a", "b"], offset: 40 });
  const q = calls[0]!.url.searchParams;
  assert.equal(q.get("from"), "2026-01-01T00:00:00Z");
  assert.deepEqual(q.getAll("applicationIds"), ["a", "b"]);
  assert.equal(q.get("offset"), "40");
  assert.equal(q.has("to"), false);
});

test("follows nextOffset across pages and reports truncation", async () => {
  const pages = [
    { transactions: transactions.slice(0, 2), nextOffset: 2, hasMore: true, totalCount: 5 },
    { transactions: transactions.slice(2, 4), nextOffset: 4, hasMore: true, totalCount: 5 },
    { transactions: transactions.slice(4), nextOffset: null, hasMore: false, totalCount: 5 },
  ];
  const { client } = fakeClient((url) => json(pages[Number(url.searchParams.get("offset") ?? 0) / 2]));

  const all = await client.listTransactions({});
  assert.equal(all.transactions.length, 5);
  assert.equal(all.truncated, false);
  assert.equal(all.nextOffset, null);

  const partial = await client.listTransactions({}, 2);
  assert.equal(partial.transactions.length, 4);
  assert.equal(partial.truncated, true);
  assert.equal(partial.nextOffset, 4);
});

test("retries 429 using Retry-After, then succeeds", async () => {
  let n = 0;
  const { client, sleeps } = fakeClient(() =>
    n++ === 0 ? json({}, 429, { "retry-after": "2" }) : json(applications),
  );
  await client.listApplications();
  assert.deepEqual(sleeps, [2000]);
});

test("gives up after max 429 retries", async () => {
  const { client, calls } = fakeClient(() => json({}, 429), { max429Retries: 2 });
  await assert.rejects(client.listApplications(), (e: CledaraError) => e.status === 429);
  assert.equal(calls.length, 3);
});

test("maps 401 to a helpful error that never contains the key", async () => {
  const { client } = fakeClient(() => json({ message: "nope" }, 401));
  await assert.rejects(client.listApplications(), (e: CledaraError) => {
    assert.equal(e.status, 401);
    assert.match(e.message, /CLEDARA_API_KEY/);
    assert.ok(!e.message.includes(FAKE_KEY));
    return true;
  });
});

test("throttles to the per-minute budget", async () => {
  let t = 0;
  const { client, sleeps } = fakeClient(() => json({ invoiceUrl: "https://x.test/i" }), {
    maxRequestsPerMinute: 2,
    now: () => t,
  });
  await client.getInvoiceUrl("a");
  t = 10_000;
  await client.getInvoiceUrl("b");
  t = 20_000;
  await client.getInvoiceUrl("c");
  assert.deepEqual(sleeps, [40_000]);
});

test("rejects construction without a key", () => {
  assert.throws(() => fakeClient(() => json({}), { apiKey: "" }), /CLEDARA_API_KEY/);
});
