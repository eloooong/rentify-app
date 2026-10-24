import type { Booking } from "@/lib/bookings/validation";
import type { CheckoutStatus } from "@/lib/payments/validation";
import type { BookingProblem } from "./booking-dates";
import { displayStatus } from "./booking-status";

/*
 * Pure helpers for the checkout screen (A2.3), following Person B's payment
 * contract (lib/payments/README.md) and DECISIONS.md section 7. The page reads
 * the API; it never trusts a redirect or URL flag to decide payment happened.
 */

/** Must match B's `policyVersion` in lib/payments/validation.ts. */
export const PAYMENT_POLICY_VERSION = "demo-payments-v1";

/** How often and how long to poll while the provider session is created. */
export const POLL_INTERVAL_MS = 2_000;
export const POLL_ATTEMPTS = 15;

/** The rules shown before consent (DECISIONS.md section 7, demo defaults). */
export const PAYMENT_RULES: string[] = [
  "This is a test payment with GCash on PayMongo's page. No real money moves, and Rentify never sees your GCash details.",
  "You pay the rent and the refundable deposit together, as two separate lines. Rentify adds no fees.",
  "Pay within 30 minutes of the owner accepting. If the window closes first, the dates are released and you'll need to send a new request.",
  "If either of you cancels before 00:00 (Manila time) on the pickup date, you get back 100% of the rent and deposit.",
  "Once the pickup date starts or the device is handed over, self-service cancellation stops and any issue goes to manual review.",
  "The deposit is returned after the device is back and both of you approve its condition. Refunds go to the original GCash account and may take time to arrive.",
  "If a payment arrives after the booking has closed, the booking isn't revived. The payment is refunded instead.",
];

export type CheckoutView =
  | { kind: "start" }
  | { kind: "creating" }
  | { kind: "open"; url: string | null }
  | { kind: "paid" }
  | { kind: "expired" }
  | { kind: "refund_due"; amount: number }
  | { kind: "review" }
  | { kind: "closed"; reason: "not_accepted" | "booking_closed" };

/**
 * What the renter should see, from the booking and the latest checkout
 * attempt (one per booking). The attempt wins once it exists.
 */
export function checkoutView(
  booking: Pick<Booking, "status" | "is_expired">,
  checkout: CheckoutStatus | null,
): CheckoutView {
  if (checkout) {
    switch (checkout.state) {
      case "creating":
        return { kind: "creating" };
      case "open":
        // A booking that closed while the session was open can't be paid.
        if (displayStatus(booking) !== "accepted")
          return { kind: "closed", reason: "booking_closed" };
        return { kind: "open", url: checkout.checkout_url };
      case "paid":
        return { kind: "paid" };
      case "expired":
        return { kind: "expired" };
      case "refund_due":
        return { kind: "refund_due", amount: checkout.refund_due_amount };
      case "review":
        return { kind: "review" };
    }
  }
  const status = displayStatus(booking);
  if (status === "accepted") return { kind: "start" };
  if (status === "paid") return { kind: "paid" };
  return {
    kind: "closed",
    reason: status === "requested" ? "not_accepted" : "booking_closed",
  };
}

/**
 * Accepts only https URLs for the hosted checkout page, so a malformed
 * value can never become a javascript: or relative link.
 */
export function safeCheckoutUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

type ErrorBody = { error?: { code?: unknown; message?: unknown } };

/** Turns a checkout API error into what the checkout screen shows. */
export function interpretCheckoutError(
  status: number,
  body: unknown,
  returnTo: string,
): BookingProblem {
  const error = (body as ErrorBody | null)?.error;
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  switch (code) {
    case "payments_unavailable":
      return {
        message:
          "Test payments aren't switched on in this environment yet, so checkout can't start. Nothing was charged.",
      };
    case "payment_closed":
    case "booking_expired":
      return {
        message:
          "The payment window for this booking has closed. Nothing was charged.",
        refresh: true,
      };
    case "payment_consent":
      return {
        message:
          "The payment rules changed. Refresh the page, read them again and confirm.",
        refresh: true,
      };
    case "payment_amount":
      return {
        message:
          "This quote is outside the test payment limits, so it can't be paid online. Contact the owner about other dates.",
      };
    case "invalid_transition":
    case "device_unavailable":
    case "unavailable_listing":
      return {
        message:
          "This booking can't be paid right now. Refresh to see its current state.",
        refresh: true,
      };
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
        message: "Complete your profile before paying.",
        action: { href: "/account", label: "Complete your profile" },
      };
    case "retry":
      return { message: "Rentify was busy. Please try again." };
  }
  if (message && status < 500) return { message };
  return {
    message:
      "We couldn't start checkout. Nothing was charged. Please try again shortly.",
  };
}
