import type { Booking } from "@/lib/bookings/validation";
import type { RefundStatus } from "@/lib/payments/refund-validation";
import type { BookingProblem } from "./booking-dates";
import {
  formatManilaTime,
  interpretActionError,
  type BookingRole,
} from "./booking-status";
import { formatMoney } from "./format";

/*
 * Pure helpers for paid cancellation and refund status on the booking page,
 * following Person B's B2.4 contract (lib/payments/REFUNDS.md). The server's
 * `can_cancel_paid` decides whether the button shows, and the database
 * rechecks it on submission; the Manila cutoff here only explains the rule.
 */

/** 00:00 Manila time on the pickup date. Manila has no daylight saving. */
export function paidCancelCutoff(pickupDate: string): Date {
  return new Date(`${pickupDate}T00:00:00+08:00`);
}

export type PaidCancellation =
  | { kind: "open"; cutoff: Date }
  | { kind: "closed"; reason: "pickup_started" | "not_eligible"; cutoff: Date };

/**
 * Whether this participant can cancel a paid booking now, or why not. Null
 * for unpaid bookings (their own actions apply) or when the refund status
 * couldn't be read.
 */
export function paidCancellation(
  booking: Pick<Booking, "status" | "pickup_date">,
  refunds: Pick<RefundStatus, "can_cancel_paid"> | null,
  now: Date,
): PaidCancellation | null {
  if (booking.status !== "paid" || !refunds) return null;
  const cutoff = paidCancelCutoff(booking.pickup_date);
  if (refunds.can_cancel_paid) return { kind: "open", cutoff };
  return {
    kind: "closed",
    reason: now >= cutoff ? "pickup_started" : "not_eligible",
    cutoff,
  };
}

/** The line shown under the cancel control, or instead of it. */
export function paidCancellationNote(state: PaidCancellation): string {
  const cutoff = formatManilaTime(state.cutoff.toISOString());
  if (state.kind === "open")
    return `Either of you can cancel for a full refund of rent and deposit until pickup day starts (${cutoff}, Manila time).`;
  if (state.reason === "pickup_started")
    return `Pickup day has started (${cutoff}, Manila time), so this booking can no longer be cancelled here. Problems from now on need a manual review.`;
  return "This booking can't be cancelled from your account. Cancelling needs an active account with a verified email, and older bookings need a manual review.";
}

/** Dialog text for the paid cancellation, for the renter or the owner. */
export function paidCancelCopy(role: BookingRole, total: number) {
  const amount = formatMoney(total, "PHP");
  return {
    label: "Cancel and refund",
    title: "Cancel and refund this booking?",
    description:
      role === "renter"
        ? `The full ${amount} for rent and deposit is refunded to your original GCash account. The refund is recorded straight away but may take time to arrive. The owner sees your reason. Cancelling can't be undone.`
        : `The renter gets the full ${amount} for rent and deposit back to their original GCash account. The refund is recorded straight away but may take time to arrive. The renter sees your reason. Cancelling can't be undone.`,
    confirm: "Cancel and refund",
  };
}

export type RefundAttemptState = RefundStatus["attempts"][number]["state"];

export const REFUND_STATE_LABEL: Record<RefundAttemptState, string> = {
  queued: "Waiting to send",
  submitting: "Sending",
  pending: "Pending",
  processing: "Processing",
  succeeded: "Refunded",
  failed: "Failed",
  review: "Needs review",
};

export type RefundView = {
  headline: "Refund pending" | "Refund needs review" | "Refunded";
  summary: string;
  /** Total refund owed: what is still pending plus what has arrived. */
  totalAmount: number;
  /** Recorded but not confirmed by the payment provider. */
  pendingAmount: number;
  refundedAmount: number;
  attempts: {
    id: string;
    amount: number;
    label: string;
    updatedAt: string;
  }[];
};

/**
 * What the refund panel shows, or null when this booking owes no refund.
 * `refund_due_amount` already includes reserved pending work, so it is the
 * amount still pending; only confirmed success counts as refunded.
 */
export function refundView(
  status: RefundStatus,
  role: BookingRole,
): RefundView | null {
  const pending = status.refund_due_amount;
  const refunded = status.refunded_amount;
  if (pending === 0 && refunded === 0 && status.attempts.length === 0)
    return null;
  const money = (amount: number) => formatMoney(amount, status.currency);
  const where =
    role === "renter"
      ? "your original GCash account"
      : "the renter's original GCash account";

  let headline: RefundView["headline"];
  let summary: string;
  if (pending === 0) {
    headline = "Refunded";
    summary = `${money(refunded)} went back to ${where}.`;
  } else if (status.review_required) {
    headline = "Refund needs review";
    summary = `${money(pending)} is still owed and stays recorded until the refund is confirmed. Rentify is checking it with the payment provider.`;
  } else {
    headline = "Refund pending";
    summary = `${money(pending)} is recorded as owed to ${where}. It may take time to arrive.`;
  }

  return {
    headline,
    summary,
    totalAmount: pending + refunded,
    pendingAmount: pending,
    refundedAmount: refunded,
    attempts: status.attempts.map((attempt) => ({
      id: attempt.id,
      amount: attempt.amount,
      label: REFUND_STATE_LABEL[attempt.state],
      updatedAt: attempt.updated_at,
    })),
  };
}

type ErrorBody = { error?: { code?: unknown } };

/** Turns a paid cancellation error into what the booking page shows. */
export function interpretRefundError(
  status: number,
  body: unknown,
  returnTo: string,
): BookingProblem {
  const code = (body as ErrorBody | null)?.error?.code;
  switch (code) {
    case "paid_cancellation_closed":
      return {
        message:
          "This booking can no longer be cancelled here, so nothing changed. Paid bookings can be cancelled only before pickup day starts.",
        refresh: true,
      };
    case "idempotency_conflict":
      return {
        message:
          "This booking was already cancelled with a different reason, so your cancellation wasn't applied.",
        refresh: true,
      };
    case "validation":
      return { message: "Enter a reason of 3 to 500 characters, on one line." };
    case "not_found":
      return { message: "We couldn't find this booking.", refresh: true };
    case "forbidden":
      return { message: "This account can't cancel this booking." };
    case "unavailable":
      return {
        message:
          "We couldn't confirm the cancellation. Check the booking below, then try again if it's still paid.",
        refresh: true,
      };
  }
  return interpretActionError(status, body, returnTo);
}
