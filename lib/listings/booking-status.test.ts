import { describe, expect, it } from "vitest";
import type { Booking } from "@/lib/bookings/validation";
import {
  bookingsHref,
  displayStatus,
  formatManilaTime,
  interpretActionError,
  parseBookingsParams,
  reasonError,
  statusHint,
} from "./booking-status";

const booking: Booking = {
  id: "aad4bd8a-7ca3-4317-a7c8-2e1b266eb4c3",
  listing_id: "dc1d3ad6-e910-47b7-810f-603f878bdcd2",
  owner_id: "649df197-56e6-4132-a1b5-3f241d265287",
  renter_id: "89ccc9d9-35e0-4b6c-99f1-60503bf077c7",
  pickup_date: "2026-10-26",
  return_date: "2026-11-04",
  rental_days: 10,
  daily_price_amount: 95000,
  rental_amount: 950000,
  deposit_amount: 190000,
  total_amount: 1140000,
  currency: "PHP",
  status: "requested",
  policy_version: "demo-booking-v1",
  request_expires_at: "2026-10-25T13:28:58.571958+00:00",
  payment_expires_at: null,
  accepted_at: null,
  closed_by: null,
  status_reason: null,
  is_expired: false,
  allowed_actions: ["accept", "decline"],
  created_at: "2026-10-24T13:28:58.567475+00:00",
  updated_at: "2026-10-24T13:28:58.567475+00:00",
};

describe("displayStatus", () => {
  it("shows overdue open bookings as expired before the job runs", () => {
    expect(displayStatus({ status: "requested", is_expired: true })).toBe(
      "expired",
    );
    expect(displayStatus({ status: "accepted", is_expired: true })).toBe(
      "expired",
    );
    expect(displayStatus({ status: "paid", is_expired: true })).toBe("paid");
    expect(displayStatus(booking)).toBe("requested");
  });
});

describe("statusHint", () => {
  it("gives each side its own next step with the Manila deadline", () => {
    expect(formatManilaTime(booking.request_expires_at!)).toMatch(
      /Oct 25, 2026.*9:28/,
    );
    expect(statusHint(booking, "owner")).toMatch(
      /^Accept or decline by Oct 25/,
    );
    expect(statusHint(booking, "renter")).toMatch(/Waiting for the owner/);
    const accepted = {
      ...booking,
      status: "accepted" as const,
      payment_expires_at: "2026-10-24T14:00:00+00:00",
    };
    expect(statusHint(accepted, "renter")).toMatch(/Pay by .*10:00/);
    expect(statusHint(accepted, "owner")).toMatch(/Waiting for the renter/);
  });
});

describe("dashboard URL state", () => {
  it("parses role, status and page with safe fallbacks", () => {
    expect(parseBookingsParams({})).toEqual({
      role: "renter",
      status: null,
      page: 1,
    });
    expect(
      parseBookingsParams({ role: "owner", status: "accepted", page: "3" }),
    ).toEqual({ role: "owner", status: "accepted", page: 3 });
    expect(
      parseBookingsParams({ role: "admin", status: "bogus", page: "-2" }),
    ).toEqual({ role: "renter", status: null, page: 1 });
  });

  it("builds links that leave out defaults and reset the page", () => {
    const query = parseBookingsParams({ role: "owner", page: "2" });
    expect(bookingsHref(query)).toBe("/bookings?role=owner&page=2");
    expect(bookingsHref(query, { status: "requested", page: 1 })).toBe(
      "/bookings?role=owner&status=requested",
    );
    expect(bookingsHref(query, { role: "renter", page: 1 })).toBe("/bookings");
  });
});

describe("reasonError", () => {
  it("matches the API's reason rules", () => {
    expect(reasonError("  no ")).toMatch(/at least 3/);
    expect(reasonError("x".repeat(501))).toMatch(/500/);
    expect(reasonError("line\nbreak")).toMatch(/special characters/);
    expect(reasonError("  Device is being repaired  ")).toBeNull();
  });
});

describe("interpretActionError", () => {
  it("asks for a refresh when the booking changed underneath", () => {
    expect(
      interpretActionError(409, { error: { code: "booking_expired" } }, "/"),
    ).toMatchObject({ refresh: true });
    expect(
      interpretActionError(409, { error: { code: "booking_conflict" } }, "/"),
    ).toMatchObject({ refresh: true });
  });

  it("sends an expired session back to sign in", () => {
    expect(
      interpretActionError(401, { error: { code: "sign_in" } }, "/bookings/x"),
    ).toMatchObject({ action: { href: "/login?next=%2Fbookings%2Fx" } });
  });

  it("falls back to the server message, then a generic one", () => {
    expect(
      interpretActionError(
        403,
        { error: { code: "forbidden", message: "Not allowed." } },
        "/",
      ).message,
    ).toBe("Not allowed.");
    expect(interpretActionError(500, null, "/").message).toMatch(
      /couldn't update/,
    );
  });
});
