import { describe, expect, it } from "vitest";
import { policyVersion } from "@/lib/payments/validation";
import type { CheckoutStatus } from "@/lib/payments/validation";
import {
  PAYMENT_POLICY_VERSION,
  checkoutView,
  interpretCheckoutError,
  safeCheckoutUrl,
} from "./checkout";

const attempt: CheckoutStatus = {
  id: "0b5a3f2e-8c1d-4c55-9a6e-2f1f2d9c7a10",
  booking_id: "ec5cde22-7966-4d2e-8803-d7847f68943b",
  state: "open",
  rental_amount: 255000,
  deposit_amount: 170000,
  total_amount: 425000,
  currency: "PHP",
  method: "gcash",
  test_mode: true,
  policy_version: "demo-payments-v1",
  expires_at: "2026-10-24T15:02:00+00:00",
  consented_at: "2026-10-24T14:40:00+00:00",
  checkout_url: "https://dev.xen.to/test_123",
  refund_due_amount: 0,
};
const accepted = { status: "accepted" as const, is_expired: false };

describe("policy version", () => {
  it("matches B's payment contract", () => {
    expect(PAYMENT_POLICY_VERSION).toBe(policyVersion);
  });
});

describe("checkoutView", () => {
  it("asks for consent on an accepted booking with no attempt", () => {
    expect(checkoutView(accepted, null)).toEqual({ kind: "start" });
  });

  it("follows the attempt state once it exists", () => {
    expect(checkoutView(accepted, { ...attempt, state: "creating" })).toEqual({
      kind: "creating",
    });
    expect(checkoutView(accepted, attempt)).toEqual({
      kind: "open",
      url: attempt.checkout_url,
    });
    expect(
      checkoutView(
        { status: "paid", is_expired: false },
        {
          ...attempt,
          state: "paid",
        },
      ),
    ).toEqual({ kind: "paid" });
    expect(
      checkoutView(accepted, {
        ...attempt,
        state: "refund_due",
        refund_due_amount: 425000,
      }),
    ).toEqual({ kind: "refund_due", amount: 425000 });
    expect(checkoutView(accepted, { ...attempt, state: "review" })).toEqual({
      kind: "review",
    });
  });

  it("never offers payment once the booking has closed", () => {
    expect(
      checkoutView({ status: "accepted", is_expired: true }, attempt),
    ).toEqual({ kind: "closed", reason: "booking_closed" });
    expect(
      checkoutView({ status: "accepted", is_expired: true }, null),
    ).toEqual({ kind: "closed", reason: "booking_closed" });
    expect(
      checkoutView({ status: "requested", is_expired: false }, null),
    ).toEqual({ kind: "closed", reason: "not_accepted" });
  });
});

describe("safeCheckoutUrl", () => {
  it("only allows https links", () => {
    expect(safeCheckoutUrl(attempt.checkout_url)).toBe(attempt.checkout_url);
    expect(safeCheckoutUrl("javascript:alert(1)")).toBeNull();
    expect(safeCheckoutUrl("http://example.test/pay")).toBeNull();
    expect(safeCheckoutUrl("/relative")).toBeNull();
    expect(safeCheckoutUrl(null)).toBeNull();
  });
});

describe("interpretCheckoutError", () => {
  it("explains that test payments are switched off", () => {
    expect(
      interpretCheckoutError(
        503,
        { error: { code: "payments_unavailable" } },
        "/",
      ).message,
    ).toMatch(/aren't switched on/);
  });

  it("refreshes when the window closed or the rules changed", () => {
    expect(
      interpretCheckoutError(409, { error: { code: "payment_closed" } }, "/"),
    ).toMatchObject({ refresh: true });
    expect(
      interpretCheckoutError(400, { error: { code: "payment_consent" } }, "/"),
    ).toMatchObject({ refresh: true });
  });

  it("says nothing was charged on unknown failures", () => {
    expect(interpretCheckoutError(503, null, "/").message).toMatch(
      /Nothing was charged/,
    );
  });
});
