// Shapes from the Cledara OpenAPI spec (https://api-docs.cledara.com, API v0).

export type Ref = { id: string; name: string };

export type Budget = {
  type: "soft" | "fixed" | "noBudget";
  limit: number | null;
  currency: string;
  periodicity: "week" | "month" | "quarter" | "year" | null;
};

export type Application = {
  id: string;
  name: string;
  status: "pending" | "requested" | "active" | "disabled" | "inactive";
  budget: Budget;
  createdAt: string;
  owner: Ref;
  nextRenewalDate: string | null;
  balance: number | null;
  nextPayment: { date: string; amount: number } | null;
  teams: Ref[];
};

export type TransactionType =
  | "cardSend"
  | "cardReceive"
  | "transferSend"
  | "transferReceive"
  | "applicationTopUp"
  | "applicationFlush"
  | "reimbursement"
  | "other";

export const TRANSACTION_TYPES: TransactionType[] = [
  "cardSend",
  "cardReceive",
  "transferSend",
  "transferReceive",
  "applicationTopUp",
  "applicationFlush",
  "reimbursement",
  "other",
];

export type Card = {
  id: string;
  name: string | null;
  type: "saasMain" | "saasSupplementary" | "spend" | "simpleCard";
  number: string;
  owner: Ref;
  status: string;
  tags: string[];
};

export type Transaction = {
  id: string;
  // Account currency; negative for debits, positive for credits.
  amount: number;
  currency: "GBP" | "EUR" | "USD";
  localAmount?: number;
  localCurrency?: string;
  runningBalance: number | null;
  accountType: "application" | "saasMain" | "spend" | "others";
  description: string;
  comment?: string;
  application?: Ref;
  authorizedAt: string;
  settledAt?: string;
  type: TransactionType;
  card: Card | null;
  hasInvoice: boolean;
  invoiceDetails: {
    number: string | null;
    date: string | null;
    vat: { name: string; rate: number; amount: number } | null;
  } | null;
  accounting: {
    field: Ref;
    value: string | number | boolean;
    name?: string;
    rate?: number;
  }[];
};

export type TransactionPage = {
  transactions: Transaction[];
  nextOffset: number | null;
  hasMore: boolean;
  totalCount: number;
};

export type TransactionQuery = {
  from?: string;
  to?: string;
  applicationIds?: string[];
  offset?: number;
};
