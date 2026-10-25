import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterApplications,
  listPeople,
  missingInvoices,
  spendSummary,
  toRfc3339,
  upcomingRenewals,
} from "../src/analytics.ts";
import { ALICE, BOB, ENG, SLACK_ID, applications, transactions } from "./fixtures.ts";

test("filterApplications matches status, name, owner and team", () => {
  assert.deepEqual(filterApplications(applications, { status: ["inactive"] }).map((a) => a.name), ["Old Tool"]);
  assert.deepEqual(filterApplications(applications, { search: "fig" }).map((a) => a.name), ["Figma"]);
  assert.equal(filterApplications(applications, { owner: "bob" }).length, 2);
  assert.equal(filterApplications(applications, { owner: ALICE.id }).length, 1);
  assert.equal(filterApplications(applications, { team: "sales" }).length, 1);
});

test("toRfc3339 expands date-only bounds and rejects junk", () => {
  assert.equal(toRfc3339("2026-01-31", "end"), "2026-01-31T23:59:59Z");
  assert.equal(toRfc3339("2026-01-01", "start"), "2026-01-01T00:00:00Z");
  assert.equal(toRfc3339("2026-01-01T12:00:00+01:00", "start"), "2026-01-01T12:00:00+01:00");
  assert.equal(toRfc3339(undefined, "start"), undefined);
  assert.throws(() => toRfc3339("last tuesday", "start"), /Invalid date/);
});

test("spendSummary nets refunds, ignores top-ups and splits currencies", () => {
  const s = spendSummary(transactions, applications, "application");
  assert.deepEqual(s.totalsByCurrency, {
    GBP: { spend: 412.5, transactionCount: 3 },
    USD: { spend: 100, transactionCount: 1 },
  });
  const slack = s.groups.find((g) => g.key === SLACK_ID)!;
  assert.equal(slack.spend, 400);
  assert.equal(slack.transactionCount, 2);
  assert.ok(s.groups.some((g) => g.label === "(no application)" && g.spend === 12.5));
});

test("spendSummary by team counts multi-team apps under each team", () => {
  const s = spendSummary(transactions, applications, "team");
  const eng = s.groups.find((g) => g.key === ENG.id && g.currency === "GBP")!;
  assert.equal(eng.spend, 400);
  assert.ok(s.note);
});

test("spendSummary by owner falls back to the cardholder", () => {
  const s = spendSummary(transactions, applications, "owner");
  assert.equal(s.groups.find((g) => g.key === BOB.id && g.currency === "GBP")!.spend, 12.5);
});

test("spendSummary by month sorts chronologically", () => {
  const s = spendSummary(transactions, applications, "month");
  assert.deepEqual(s.groups.map((g) => g.key), ["2026-09", "2026-10"]);
});

test("upcomingRenewals windows by date and skips inactive apps", () => {
  const today = new Date("2026-10-25T09:00:00Z");
  const r = upcomingRenewals(applications, today, 30);
  assert.deepEqual(r.renewals.map((x) => x.name), ["Slack"]);
  assert.equal(r.renewals[0]!.daysUntil, 7);
  assert.equal(r.renewals[0]!.dateSource, "nextRenewalDate");
  assert.deepEqual(r.expectedByCurrency, { GBP: 450 });

  const withInactive = upcomingRenewals(applications, today, 30, true);
  assert.deepEqual(withInactive.renewals.map((x) => x.name), ["Old Tool", "Slack"]);
});

test("upcomingRenewals falls back to nextPayment when nextRenewalDate is null", () => {
  const app = { ...applications[0]!, nextRenewalDate: null, nextPayment: { date: "2026-11-05", amount: 99 } };
  const stale = { ...app, id: "stale", nextPayment: { date: "2025-03-15", amount: 10 } };
  const r = upcomingRenewals([app, stale], new Date("2026-10-25T09:00:00Z"), 30);
  assert.equal(r.count, 1);
  assert.equal(r.renewals[0]!.date, "2026-11-05");
  assert.equal(r.renewals[0]!.dateSource, "nextPayment");
  assert.deepEqual(r.expectedByCurrency, { GBP: 99 });
});

test("missingInvoices lists only card payments without invoices", () => {
  const m = missingInvoices(transactions);
  assert.equal(m.count, 2);
  assert.deepEqual(m.totalByCurrency, { USD: 100, GBP: 12.5 });
  assert.equal(m.transactions[0]!.description, "Coffee");
});

test("listPeople merges owners and cardholders", () => {
  const p = listPeople(applications, transactions);
  const alice = p.people.find((x) => x.id === ALICE.id)!;
  const bob = p.people.find((x) => x.id === BOB.id)!;
  assert.deepEqual(alice.ownsApplications, ["Slack"]);
  assert.equal(alice.cards.length, 1);
  assert.deepEqual(bob.cards.map((c) => c.label), ["Coffee Card ••1111"]);
  assert.deepEqual(p.teams.map((t) => t.name), ["Engineering", "Sales"]);
});
