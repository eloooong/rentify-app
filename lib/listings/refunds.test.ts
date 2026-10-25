import { describe, expect, it } from "vitest";
import {
  paidCancellationInput,
  refundStatus,
  type RefundStatus,
} from "@/lib/payments/refund-validation";
import { reasonError } from "./booking-status";
import {
  interpretRefundError,
  paidCancelCopy,
  paidCancelCutoff,
  paidCancellation,
  paidCancellationNote,
  refundView,
} from "./refunds";

const paid = { status: "paid" as const, pickup_date: "2026-11-20" };

const noRefund: RefundStatus = {
  booking_id: "d4228164-b86f-4e41-8b14-51393f80af0a",
  currency: "PHP",
  test_mode: true,
  can_cancel_paid: true,
  refund_due_amount: 0,
  refund_pending_amount: 0,
  refunded_amount: 0,
  review_required: false,
  attempts: [],
};

const attempt = {
  id: "df2ea51b-a23d-4067-b916-2eba7d52a4bd",
  amount: 340000,
  state: "queued" as const,
  created_at: "2026-10-25T14:27:05.959997+00:00",
  updated_at: "2026-10-25T14:27:05.959997+00:00",
};

describe("paidCancelCutoff", () => {
  it("is 00:00 Manila time on the pickup date (16:00 UTC the day before)", () => {
    expect(paidCancelCutoff("2026-11-20").toISOString()).toBe(
      "2026-11-19T16:00:00.000Z",
    );
  });
});

describe("paidCancellation", () => {
  const before = new Date("2026-11-19T15:59:59.999Z"); // 23:59:59 Manila
  const at = new Date("2026-11-19T16:00:00Z"); // 00:00 Manila on pickup day

  it("offers cancellation only when the server allows it", () => {
    expect(paidCancellation(paid, noRefund, before)).toMatchObject({
      kind: "open",
    });
    expect(
      paidCancellation(paid, { can_cancel_paid: false }, before),
    ).toMatchObject({ kind: "closed", reason: "not_eligible" });
  });

  it("explains the pickup-day cutoff from the exact Manila midnight", () => {
    expect(
      paidCancellation(paid, { can_cancel_paid: false }, at),
    ).toMatchObject({ kind: "closed", reason: "pickup_started" });
  });

  it("does nothing for unpaid bookings or a missing refund status", () => {
    expect(
      paidCancellation({ ...paid, status: "accepted" }, noRefund, before),
    ).toBeNull();
    expect(
      paidCancellation({ ...paid, status: "cancelled" }, noRefund, before),
    ).toBeNull();
    expect(paidCancellation(paid, null, before)).toBeNull();
  });

  it("states the cutoff in Manila time", () => {
    const open = paidCancellation(paid, noRefund, before)!;
    expect(paidCancellationNote(open)).toMatch(
      /until pickup day starts \(Nov 20, 2026, 12:00.AM, Manila time\)/,
    );
    const closed = paidCancellation(paid, { can_cancel_paid: false }, at)!;
    expect(paidCancellationNote(closed)).toMatch(/Pickup day has started/);
  });
});

describe("paidCancelCopy", () => {
  it("promises a recorded full refund, not an instant one", () => {
    const renter = paidCancelCopy("renter", 340000);
    expect(renter.description).toMatch(/full ₱3,400.*your original GCash/);
    expect(renter.description).toMatch(/may take time to arrive/);
    expect(renter.description).toMatch(/The owner sees your reason/);
    expect(paidCancelCopy("owner", 340000).description).toMatch(
      /The renter gets the full ₱3,400.*The renter sees your reason/,
    );
  });

  it("validates reasons the same way as B's schema", () => {
    for (const reason of ["ok", "  Plans changed  ", "a\tb c", "x".repeat(501)])
      expect(reasonError(reason) === null).toBe(
        paidCancellationInput.safeParse({ reason }).success,
      );
  });
});

describe("refundView", () => {
  it("shows nothing when no refund is owed", () => {
    expect(refundView(noRefund, "renter")).toBeNull();
  });

  it("treats queued, pending and processing work as pending, not refunded", () => {
    const status = refundStatus.parse({
      ...noRefund,
      can_cancel_paid: false,
      refund_due_amount: 340000,
      refund_pending_amount: 340000,
      attempts: [attempt],
    });
    expect(refundView(status, "renter")).toEqual({
      headline: "Refund pending",
      summary:
        "₱3,400 is recorded as owed to your original GCash account. It may take time to arrive.",
      totalAmount: 340000,
      pendingAmount: 340000,
      refundedAmount: 0,
      attempts: [
        {
          id: attempt.id,
          amount: 340000,
          label: "Waiting to send",
          updatedAt: attempt.updated_at,
        },
      ],
    });
    for (const state of ["submitting", "pending", "processing"] as const)
      expect(
        refundView({ ...status, attempts: [{ ...attempt, state }] }, "owner")!
          .headline,
      ).toBe("Refund pending");
  });

  it("does not add the pending reservation to the amount due twice", () => {
    const view = refundView(
      {
        ...noRefund,
        refund_due_amount: 7500,
        refund_pending_amount: 7500,
        refunded_amount: 2500,
        attempts: [
          { ...attempt, amount: 2500, state: "succeeded" },
          { ...attempt, amount: 7500, state: "processing" },
        ],
      },
      "owner",
    )!;
    expect(view.totalAmount).toBe(10000);
    expect(view.pendingAmount).toBe(7500);
    expect(view.summary).toMatch(/the renter's original GCash account/);
    expect(view.attempts.map((a) => a.label)).toEqual([
      "Refunded",
      "Processing",
    ]);
  });

  it("flags review and only calls confirmed success refunded", () => {
    const review = refundView(
      {
        ...noRefund,
        refund_due_amount: 340000,
        refund_pending_amount: 340000,
        review_required: true,
        attempts: [{ ...attempt, state: "review" }],
      },
      "renter",
    )!;
    expect(review.headline).toBe("Refund needs review");
    expect(review.attempts[0].label).toBe("Needs review");

    const failed = refundView(
      {
        ...noRefund,
        refund_due_amount: 340000,
        review_required: true,
        attempts: [{ ...attempt, state: "failed" }],
      },
      "renter",
    )!;
    expect(failed.headline).toBe("Refund needs review");
    expect(failed.refundedAmount).toBe(0);

    const done = refundView(
      {
        ...noRefund,
        refunded_amount: 340000,
        attempts: [{ ...attempt, state: "succeeded" }],
      },
      "renter",
    )!;
    expect(done.headline).toBe("Refunded");
    expect(done.summary).toBe(
      "₱3,400 went back to your original GCash account.",
    );
  });
});

describe("interpretRefundError", () => {
  const err = (code: string) => ({ error: { code, message: "Server text." } });
  const back = "/bookings/d4228164-b86f-4e41-8b14-51393f80af0a";

  it("explains the cutoff and refreshes", () => {
    expect(
      interpretRefundError(409, err("paid_cancellation_closed"), back),
    ).toMatchObject({
      message: /only before pickup day starts/,
      refresh: true,
    });
  });

  it("maps retries with a different reason", () => {
    expect(
      interpretRefundError(409, err("idempotency_conflict"), back),
    ).toMatchObject({ message: /different reason/, refresh: true });
  });

  it("maps validation, missing, forbidden and unavailable", () => {
    expect(interpretRefundError(400, err("validation"), back).message).toMatch(
      /3 to 500 characters/,
    );
    expect(interpretRefundError(404, err("not_found"), back).message).toMatch(
      /couldn't find/,
    );
    expect(interpretRefundError(403, err("forbidden"), back).message).toMatch(
      /can't cancel/,
    );
    expect(interpretRefundError(503, err("unavailable"), back)).toMatchObject({
      message: /couldn't confirm/,
      refresh: true,
    });
  });

  it("reuses the booking action mapping for sessions and profiles", () => {
    expect(interpretRefundError(401, err("sign_in"), back).action?.href).toBe(
      `/login?next=${encodeURIComponent(back)}`,
    );
    expect(
      interpretRefundError(403, err("profile_required"), back).action?.href,
    ).toBe("/account");
    expect(interpretRefundError(403, err("origin"), back).message).toBe(
      "Server text.",
    );
    expect(interpretRefundError(0, null, back).message).toMatch(
      /try again shortly/,
    );
  });
});
