import { describe, expect, it } from "vitest";
import {
  historyQuery,
  transactionSchema,
  type Transaction,
} from "@/lib/payments/history-validation";
import {
  hasFilters,
  historyHref,
  interpretHistoryError,
  isCalendarDate,
  parseHistoryParams,
  rangeError,
  transactionView,
  type HistoryQuery,
} from "./history";

const none: HistoryQuery = {
  type: null,
  role: "all",
  from: null,
  to: null,
  page: 1,
};

const payment: Transaction = {
  id: "payment:6f1d9b7e-2a44-4c0b-9a51-0c9f3f6d1a20",
  booking_id: "d4228164-b86f-4e41-8b14-51393f80af0a",
  listing_id: "0c8e6a52-6d0f-4f7e-8f3b-0c1f8f7d9e11",
  role: "renter",
  type: "payment",
  state: "captured",
  amount: 340000,
  currency: "PHP",
  provider: "xendit",
  test_mode: true,
  occurred_at: "2026-10-25T06:10:00+00:00",
  updated_at: "2026-10-25T06:10:02+00:00",
  rental_amount: 240000,
  deposit_amount: 100000,
};

const refund: Transaction = {
  ...payment,
  id: "refund:df2ea51b-a23d-4067-b916-2eba7d52a4bd",
  type: "refund",
  state: "queued",
  rental_amount: null,
  deposit_amount: null,
};

describe("isCalendarDate", () => {
  it("accepts real dates, including leap days", () => {
    expect(isCalendarDate("2026-10-25")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible or badly formatted dates", () => {
    for (const value of [
      undefined,
      "",
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-1-5",
      "25/10/2026",
      "2026-10-25T00:00",
    ])
      expect(isCalendarDate(value)).toBe(false);
  });
});

describe("parseHistoryParams", () => {
  it("defaults to everything on page 1", () => {
    expect(parseHistoryParams({})).toEqual(none);
  });

  it("reads valid filters", () => {
    expect(
      parseHistoryParams({
        type: "refund",
        role: "owner",
        from: "2026-10-01",
        to: "2026-10-31",
        page: "3",
      }),
    ).toEqual({
      type: "refund",
      role: "owner",
      from: "2026-10-01",
      to: "2026-10-31",
      page: 3,
    });
  });

  it("falls back for unknown, empty or out-of-range values", () => {
    expect(
      parseHistoryParams({
        type: "payout",
        role: "admin",
        from: "",
        to: "2026-02-30",
        page: "0",
      }),
    ).toEqual(none);
    expect(parseHistoryParams({ page: "10001" }).page).toBe(1);
    expect(parseHistoryParams({ page: "2.5" }).page).toBe(1);
    expect(parseHistoryParams({ page: "abc" }).page).toBe(1);
  });

  it("uses the first of repeated values", () => {
    expect(
      parseHistoryParams({ type: ["payment", "refund"], role: ["renter"] }),
    ).toMatchObject({ type: "payment", role: "renter" });
  });

  it("only produces filters B's history query accepts", () => {
    const query = parseHistoryParams({
      type: "payment",
      role: "renter",
      from: "2028-02-29",
      to: "2028-03-01",
      page: "10000",
    });
    expect(
      historyQuery.safeParse({
        type: query.type ?? undefined,
        role: query.role,
        from: query.from ?? undefined,
        to: query.to ?? undefined,
        page: query.page,
      }).success,
    ).toBe(true);
  });
});

describe("historyHref", () => {
  it("leaves defaults out", () => {
    expect(historyHref(none)).toBe("/bookings/history");
  });

  it("writes every set filter and round-trips through the parser", () => {
    const query: HistoryQuery = {
      type: "payment",
      role: "renter",
      from: "2026-10-01",
      to: "2026-10-31",
      page: 2,
    };
    const href = historyHref(query);
    expect(href).toBe(
      "/bookings/history?type=payment&role=renter&from=2026-10-01&to=2026-10-31&page=2",
    );
    const params = Object.fromEntries(
      new URL(href, "http://localhost").searchParams,
    );
    expect(parseHistoryParams(params)).toEqual(query);
  });

  it("applies changes on top of the query", () => {
    expect(historyHref({ ...none, type: "refund", page: 4 }, { page: 1 })).toBe(
      "/bookings/history?type=refund",
    );
  });
});

describe("hasFilters and rangeError", () => {
  it("knows when any filter is set", () => {
    expect(hasFilters(none)).toBe(false);
    expect(hasFilters({ ...none, page: 3 })).toBe(false);
    expect(hasFilters({ ...none, role: "owner" })).toBe(true);
    expect(hasFilters({ ...none, to: "2026-10-01" })).toBe(true);
  });

  it("flags only a reversed range", () => {
    expect(rangeError(none)).toBeNull();
    expect(rangeError({ ...none, from: "2026-10-01" })).toBeNull();
    expect(
      rangeError({ ...none, from: "2026-10-01", to: "2026-10-01" }),
    ).toBeNull();
    expect(rangeError({ ...none, from: "2026-10-02", to: "2026-10-01" })).toBe(
      "The end date must be on or after the start date.",
    );
  });
});

describe("transactionView", () => {
  it("fixtures match B's transaction schema", () => {
    expect(transactionSchema.safeParse(payment).success).toBe(true);
    expect(transactionSchema.safeParse(refund).success).toBe(true);
  });

  it("shows a captured payment with its rent and deposit breakdown", () => {
    expect(transactionView(payment)).toEqual({
      typeLabel: "Payment",
      stateLabel: "Paid",
      tone: "active",
      detail: null,
      note: "You paid for this booking.",
      roleLabel: "Renting",
      breakdown: { rent: 240000, deposit: 100000 },
    });
  });

  it("never calls an owner's payment row a payout to them", () => {
    const view = transactionView({ ...payment, role: "owner" });
    expect(view.roleLabel).toBe("Hosting");
    expect(view.note).toBe(
      "The renter paid for this booking. This isn't a payout to you.",
    );
  });

  it("does not treat a payment under review as confirmed", () => {
    const view = transactionView({
      ...payment,
      state: "review",
      rental_amount: null,
      deposit_amount: null,
    });
    expect(view).toMatchObject({ stateLabel: "Needs review", tone: "problem" });
    expect(view.note).toContain("doesn't confirm the booking");
    expect(view.breakdown).toBeNull();
  });

  it("drops the breakdown when either part is missing", () => {
    expect(
      transactionView({ ...payment, deposit_amount: null }).breakdown,
    ).toBeNull();
  });

  it("labels every unconfirmed refund state as pending with its step", () => {
    const steps = {
      queued: "Waiting to send",
      submitting: "Sending to the payment provider",
      pending: "Waiting for the payment provider",
      processing: "Processing",
    } as const;
    for (const [state, detail] of Object.entries(steps)) {
      const view = transactionView({
        ...refund,
        state: state as Transaction["state"],
      });
      expect(view).toMatchObject({
        typeLabel: "Refund",
        stateLabel: "Refund pending",
        tone: "pending",
        detail,
        breakdown: null,
      });
      expect(view.note).toContain("not confirmed yet");
    }
  });

  it("calls only a succeeded refund refunded", () => {
    expect(transactionView({ ...refund, state: "succeeded" })).toMatchObject({
      stateLabel: "Refunded",
      detail: null,
      note: "The payment provider confirmed this refund to you.",
    });
    expect(
      transactionView({ ...refund, state: "succeeded", role: "owner" }).note,
    ).toBe("The payment provider confirmed this refund to the renter.");
  });

  it("explains failed and review refunds without claiming money moved", () => {
    expect(transactionView({ ...refund, state: "failed" })).toMatchObject({
      stateLabel: "Refund failed",
      tone: "problem",
      note: "This refund attempt didn't return any money.",
    });
    expect(transactionView({ ...refund, state: "review" })).toMatchObject({
      stateLabel: "Needs review",
      tone: "problem",
    });
  });
});

describe("interpretHistoryError", () => {
  const returnTo = "/bookings/history?type=refund";

  it("asks to sign in again when the session is gone", () => {
    for (const code of ["forbidden", "sign_in"])
      expect(interpretHistoryError(code, returnTo)).toEqual({
        message: "Your session ended. Sign in again to see your history.",
        action: {
          href: "/login?next=%2Fbookings%2Fhistory%3Ftype%3Drefund",
          label: "Sign in",
        },
      });
  });

  it("offers to clear rejected filters", () => {
    for (const code of ["invalid_query", "validation"])
      expect(interpretHistoryError(code, returnTo).action).toEqual({
        href: "/bookings/history",
        label: "Clear filters",
      });
  });

  it("falls back to a retry message", () => {
    expect(interpretHistoryError("unavailable", returnTo)).toEqual({
      message:
        "We couldn't load your transaction history. Please refresh the page in a moment.",
    });
    expect(interpretHistoryError("", returnTo).action).toBeUndefined();
  });
});
