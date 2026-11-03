import type { Transaction } from "@/lib/payments/history-validation";
import type { BookingProblem } from "./booking-dates";

/*
 * Pure helpers for transaction history (A2.4), following Person B's history
 * contract (lib/payments/HISTORY.md). Each row is one captured payment or one
 * refund attempt. Rows are never totalled: pending and failed refunds haven't
 * returned money, and an owner seeing a payment is not a payout.
 */

export type HistoryType = Transaction["type"];
export type HistoryRole = "all" | Transaction["role"];

export const HISTORY_PAGE_SIZE = 20;

export const TYPE_OPTIONS: { value: HistoryType | null; label: string }[] = [
  { value: null, label: "Payments and refunds" },
  { value: "payment", label: "Payments" },
  { value: "refund", label: "Refunds" },
];

export const ROLE_OPTIONS: { value: HistoryRole; label: string }[] = [
  { value: "all", label: "Renting and hosting" },
  { value: "renter", label: "Renting" },
  { value: "owner", label: "Hosting" },
];

export type HistoryQuery = {
  type: HistoryType | null;
  role: HistoryRole;
  /** Inclusive Manila calendar dates (YYYY-MM-DD) on when it happened. */
  from: string | null;
  to: string | null;
  page: number;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** A real YYYY-MM-DD calendar date, e.g. not 2026-02-30. */
export function isCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Reads the history URL. Unknown or empty values fall back to no filter. */
export function parseHistoryParams(
  params: Record<string, string | string[] | undefined>,
): HistoryQuery {
  const rawType = first(params.type);
  const rawRole = first(params.role);
  const from = first(params.from);
  const to = first(params.to);
  const page = Number(first(params.page) ?? "1");
  return {
    type: rawType === "payment" || rawType === "refund" ? rawType : null,
    role: rawRole === "renter" || rawRole === "owner" ? rawRole : "all",
    from: isCalendarDate(from) ? from : null,
    to: isCalendarDate(to) ? to : null,
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

/** The history URL for a query; defaults are left out. */
export function historyHref(
  query: HistoryQuery,
  changes: Partial<HistoryQuery> = {},
): string {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.type) params.set("type", next.type);
  if (next.role !== "all") params.set("role", next.role);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `/bookings/history?${search}` : "/bookings/history";
}

export function hasFilters(query: HistoryQuery): boolean {
  return Boolean(query.type || query.role !== "all" || query.from || query.to);
}

/** The date range problem to show, or null. The query isn't sent then. */
export function rangeError(query: HistoryQuery): string | null {
  return query.from && query.to && query.from > query.to
    ? "The end date must be on or after the start date."
    : null;
}

export type TransactionTone = "active" | "pending" | "problem" | "closed";

export type TransactionView = {
  typeLabel: "Payment" | "Refund";
  stateLabel: string;
  tone: TransactionTone;
  /** Where a pending refund is up to, e.g. "Waiting to send". */
  detail: string | null;
  /** What this row means for the reader. */
  note: string;
  roleLabel: "Renting" | "Hosting";
  breakdown: { rent: number; deposit: number } | null;
};

const PENDING_DETAIL: Partial<Record<Transaction["state"], string>> = {
  queued: "Waiting to send",
  submitting: "Sending to the payment provider",
  pending: "Waiting for the payment provider",
  processing: "Processing",
};

function paymentState(
  tx: Transaction,
): Pick<TransactionView, "stateLabel" | "tone" | "note"> {
  const owner = tx.role === "owner";
  if (tx.state === "review")
    return {
      stateLabel: "Needs review",
      tone: "problem",
      note: "This payment was received but needs a manual check. It doesn't confirm the booking.",
    };
  return {
    stateLabel: "Paid",
    tone: "active",
    note: owner
      ? "The renter paid for this booking. This isn't a payout to you."
      : "You paid for this booking.",
  };
}

function refundState(
  tx: Transaction,
): Pick<TransactionView, "stateLabel" | "tone" | "note"> {
  const to = tx.role === "owner" ? "the renter" : "you";
  switch (tx.state) {
    case "succeeded":
      return {
        stateLabel: "Refunded",
        tone: "closed",
        note: `The payment provider confirmed this refund to ${to}.`,
      };
    case "failed":
      return {
        stateLabel: "Refund failed",
        tone: "problem",
        note: "This refund attempt didn't return any money.",
      };
    case "review":
      return {
        stateLabel: "Needs review",
        tone: "problem",
        note: "Rentify is checking this refund with the payment provider. It isn't confirmed yet.",
      };
    default:
      return {
        stateLabel: "Refund pending",
        tone: "pending",
        note: `Recorded but not confirmed yet, so no money has reached ${to} from it.`,
      };
  }
}

/** What one history row shows. */
export function transactionView(tx: Transaction): TransactionView {
  const payment = tx.type === "payment";
  return {
    typeLabel: payment ? "Payment" : "Refund",
    ...(payment ? paymentState(tx) : refundState(tx)),
    detail: payment ? null : (PENDING_DETAIL[tx.state] ?? null),
    roleLabel: tx.role === "owner" ? "Hosting" : "Renting",
    breakdown:
      payment && tx.rental_amount !== null && tx.deposit_amount !== null
        ? { rent: tx.rental_amount, deposit: tx.deposit_amount }
        : null,
  };
}

/** Turns a history read failure into what the page shows. */
export function interpretHistoryError(
  code: string,
  returnTo: string,
): BookingProblem {
  switch (code) {
    case "forbidden":
    case "sign_in":
      return {
        message: "Your session ended. Sign in again to see your history.",
        action: {
          href: `/login?next=${encodeURIComponent(returnTo)}`,
          label: "Sign in",
        },
      };
    case "invalid_query":
    case "validation":
      return {
        message: "These filters couldn't be used. Clear them and try again.",
        action: { href: "/bookings/history", label: "Clear filters" },
      };
  }
  return {
    message:
      "We couldn't load your transaction history. Please refresh the page in a moment.",
  };
}
