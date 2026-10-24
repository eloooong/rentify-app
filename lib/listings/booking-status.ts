import type { Booking } from "@/lib/bookings/validation";
import type { BookingProblem } from "./booking-dates";

/*
 * Pure helpers for the renting/hosting dashboards (A2.2), following Person
 * B's booking contract (lib/bookings/README.md). The server decides what is
 * allowed; `allowed_actions` is only a hint and every action is rechecked.
 */

export type BookingStatus = Booking["status"];
export type BookingRole = "renter" | "owner";

export const BOOKINGS_PAGE_SIZE = 20;

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  paid: "Paid",
  handed_over: "Picked up",
  returned: "Returned",
  completed: "Completed",
  disputed: "In dispute",
};

/** Filter order on the dashboard: open work first, then history. */
export const STATUS_FILTERS: BookingStatus[] = [
  "requested",
  "accepted",
  "paid",
  "handed_over",
  "returned",
  "completed",
  "disputed",
  "declined",
  "cancelled",
  "expired",
];

export type StatusTone = "action" | "active" | "closed" | "problem";

export const STATUS_TONE: Record<BookingStatus, StatusTone> = {
  requested: "action",
  accepted: "action",
  paid: "active",
  handed_over: "active",
  returned: "active",
  completed: "closed",
  declined: "closed",
  cancelled: "closed",
  expired: "closed",
  disputed: "problem",
};

/**
 * The status to show. A booking past its deadline reports `is_expired` before
 * the scheduled job stores `expired`, so show it as expired straight away.
 */
export function displayStatus(
  booking: Pick<Booking, "status" | "is_expired">,
): BookingStatus {
  if (
    booking.is_expired &&
    (booking.status === "requested" || booking.status === "accepted")
  )
    return "expired";
  return booking.status;
}

/** "25 Oct 2026, 9:28 PM" in Manila time. */
export function formatManilaTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

/** One line telling this participant where the booking stands. */
export function statusHint(booking: Booking, role: BookingRole): string {
  const status = displayStatus(booking);
  const due = (timestamp: string | null) =>
    timestamp ? ` by ${formatManilaTime(timestamp)} (Manila time)` : "";
  const owner = role === "owner";
  switch (status) {
    case "requested":
      return owner
        ? `Accept or decline${due(booking.request_expires_at)}. Accepting reserves the dates.`
        : `Waiting for the owner to respond${due(booking.request_expires_at)}. Nothing is reserved yet.`;
    case "accepted":
      return owner
        ? `Dates reserved. Waiting for the renter to pay${due(booking.payment_expires_at)}.`
        : `Accepted. Pay${due(booking.payment_expires_at)} to confirm, or the dates are released.`;
    case "paid":
      return "Paid and confirmed. Meet at the pickup area on the pickup date.";
    case "handed_over":
      return owner
        ? "The renter has the device."
        : "You have the device. Return it on the return date.";
    case "returned":
      return "The device is back. The deposit is settled after the return check.";
    case "completed":
      return "This rental is complete.";
    case "disputed":
      return "This booking is under review.";
    case "declined":
      return owner
        ? "You declined this request."
        : "The owner declined this request.";
    case "cancelled":
      return "This booking was cancelled.";
    case "expired":
      return "The deadline passed, so this booking expired.";
  }
}

export type BookingsQuery = {
  role: BookingRole;
  status: BookingStatus | null;
  page: number;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Reads the dashboard URL. Unknown values fall back instead of failing. */
export function parseBookingsParams(
  params: Record<string, string | string[] | undefined>,
): BookingsQuery {
  const role = first(params.role) === "owner" ? "owner" : "renter";
  const rawStatus = first(params.status);
  const status = STATUS_FILTERS.includes(rawStatus as BookingStatus)
    ? (rawStatus as BookingStatus)
    : null;
  const page = Number(first(params.page) ?? "1");
  return {
    role,
    status,
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

/** The dashboard URL for a query; defaults are left out. */
export function bookingsHref(
  query: BookingsQuery,
  changes: Partial<BookingsQuery> = {},
): string {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.role === "owner") params.set("role", "owner");
  if (next.status) params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `/bookings?${search}` : "/bookings";
}

export type BookingAction = Booking["allowed_actions"][number];

export const ACTION_COPY: Record<
  BookingAction,
  { label: string; title: string; description: string; confirm: string }
> = {
  accept: {
    label: "Accept",
    title: "Accept this request?",
    description:
      "The dates are reserved for this renter, who then has 30 minutes to pay. Other requests for overlapping dates can no longer be accepted.",
    confirm: "Accept request",
  },
  decline: {
    label: "Decline",
    title: "Decline this request?",
    description: "The renter sees your reason. Declining can't be undone.",
    confirm: "Decline request",
  },
  cancel: {
    label: "Cancel booking",
    title: "Cancel this booking?",
    description:
      "The other person sees your reason. Cancelling can't be undone.",
    confirm: "Cancel booking",
  },
};

/** Reasons are trimmed and 3–500 characters, without control characters. */
export function reasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return "Enter a reason of at least 3 characters.";
  if (trimmed.length > 500) return "Keep the reason to 500 characters.";
  if (/[\u0000-\u001f\u007f]/.test(trimmed))
    return "Remove special characters from the reason.";
  return null;
}

type ErrorBody = { error?: { code?: unknown; message?: unknown } };

/** Turns a booking action error into what the dashboard shows. */
export function interpretActionError(
  status: number,
  body: unknown,
  returnTo: string,
): BookingProblem {
  const error = (body as ErrorBody | null)?.error;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  switch (code) {
    case "sign_in":
      return {
        message: "Your session ended. Sign in again to continue.",
        action: {
          href: `/login?next=${encodeURIComponent(returnTo)}`,
          label: "Sign in",
        },
      };
    case "profile_required":
      return {
        message: "Complete your profile before changing bookings.",
        action: { href: "/account", label: "Complete your profile" },
      };
    case "booking_expired":
      return {
        message: "The deadline has passed, so this booking can't be changed.",
        refresh: true,
      };
    case "invalid_transition":
      return {
        message: "This booking has changed. Refresh to see its current state.",
        refresh: true,
      };
    case "booking_conflict":
      return {
        message:
          "Another booking already holds some of these dates, so this request can't be accepted.",
        refresh: true,
      };
    case "device_unavailable":
    case "unavailable_listing":
      return {
        message:
          "The listing or account can't take a reservation right now. Check the listing status.",
        refresh: true,
      };
    case "idempotency_conflict":
      return {
        message:
          "This booking was already updated with a different reason. Refresh to see it.",
        refresh: true,
      };
    case "retry":
      return { message: "Rentify was busy. Please try again." };
  }
  if (message && status < 500) return { message };
  return {
    message: "We couldn't update the booking. Please try again shortly.",
  };
}
