// Synthetic data shaped like the Cledara OpenAPI spec. No real workspace data.
import type { Application, Transaction } from "../src/types.ts";

export const ALICE = { id: "00000000-0000-4000-8000-0000000000a1", name: "Alice Admin" };
export const BOB = { id: "00000000-0000-4000-8000-0000000000b0", name: "Bob Builder" };
export const ENG = { id: "00000000-0000-4000-8000-00000000e000", name: "Engineering" };
export const SALES = { id: "00000000-0000-4000-8000-000000005000", name: "Sales" };

export const SLACK_ID = "00000000-0000-4000-8000-000000000001";
export const FIGMA_ID = "00000000-0000-4000-8000-000000000002";
export const OLD_ID = "00000000-0000-4000-8000-000000000003";

export const applications: Application[] = [
  {
    id: SLACK_ID,
    name: "Slack",
    status: "active",
    budget: { type: "fixed", limit: 500, currency: "GBP", periodicity: "month" },
    createdAt: "2025-01-01T00:00:00Z",
    owner: ALICE,
    nextRenewalDate: "2026-11-01",
    balance: 120,
    nextPayment: { date: "2026-11-01", amount: 450 },
    teams: [ENG, SALES],
  },
  {
    id: FIGMA_ID,
    name: "Figma",
    status: "active",
    budget: { type: "soft", limit: null, currency: "USD", periodicity: "year" },
    createdAt: "2025-03-01T00:00:00Z",
    owner: BOB,
    nextRenewalDate: "2027-03-01",
    balance: null,
    nextPayment: null,
    teams: [ENG],
  },
  {
    id: OLD_ID,
    name: "Old Tool",
    status: "inactive",
    budget: { type: "noBudget", limit: null, currency: "GBP", periodicity: null },
    createdAt: "2024-01-01T00:00:00Z",
    owner: BOB,
    nextRenewalDate: "2026-10-28",
    balance: 0,
    nextPayment: null,
    teams: [],
  },
];

const card = {
  id: "00000000-0000-4000-8000-00000000c001",
  name: null,
  type: "saasMain" as const,
  number: "4242",
  owner: ALICE,
  status: "active",
  tags: [],
};
const spendCard = { ...card, id: "00000000-0000-4000-8000-00000000c002", name: "Coffee Card", type: "spend" as const, number: "1111", owner: BOB };

function tx(id: number, partial: Partial<Transaction>): Transaction {
  return {
    id: `00000000-0000-4000-9000-${String(id).padStart(12, "0")}`,
    amount: -10,
    currency: "GBP",
    runningBalance: null,
    accountType: "saasMain",
    description: "payment",
    authorizedAt: "2026-10-01T10:00:00Z",
    type: "cardSend",
    card,
    hasInvoice: true,
    invoiceDetails: null,
    accounting: [],
    ...partial,
  };
}

export const transactions: Transaction[] = [
  tx(1, { amount: -450, application: { id: SLACK_ID, name: "Slack" }, accountType: "application" }),
  tx(2, { amount: -100, currency: "USD", application: { id: FIGMA_ID, name: "Figma" }, hasInvoice: false, authorizedAt: "2026-09-15T10:00:00Z" }),
  tx(3, { amount: 50, type: "cardReceive", application: { id: SLACK_ID, name: "Slack" } }),
  tx(4, { amount: -1000, type: "applicationTopUp", card: null, application: { id: SLACK_ID, name: "Slack" } }),
  tx(5, { amount: -12.5, card: spendCard, accountType: "spend", hasInvoice: false, description: "Coffee" }),
];
