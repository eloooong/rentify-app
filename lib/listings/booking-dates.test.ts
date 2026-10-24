import { describe, expect, it } from "vitest";
import type { BookingAvailability } from "@/lib/bookings/validation";
import {
  addDays,
  canPickUp,
  canReturn,
  firstPickup,
  interpretBookingError,
  latestReturn,
  manilaToday,
  monthGrid,
  quotePreview,
  rentalDays,
  selectDay,
} from "./booking-dates";

const availability: BookingAvailability = {
  listing_id: "dc1d3ad6-e910-47b7-810f-603f878bdcd2",
  from: "2026-11-18",
  to: "2027-03-17",
  timezone: "Asia/Manila",
  earliest_pickup_date: "2026-11-20",
  latest_pickup_date: "2027-02-16",
  max_rental_days: 30,
  device_available: true,
  blocked_ranges: [{ from: "2026-11-25", to: "2026-11-27" }],
};

describe("manilaToday", () => {
  it("uses the Manila calendar date, not UTC", () => {
    // 17:00 UTC on 18 Nov is 01:00 on 19 Nov in Manila (UTC+8).
    expect(manilaToday(new Date("2026-11-18T17:00:00Z"))).toBe("2026-11-19");
    expect(manilaToday(new Date("2026-11-18T15:59:00Z"))).toBe("2026-11-18");
  });
});

describe("rentalDays", () => {
  it("counts both pickup and return (DECISIONS.md example)", () => {
    expect(rentalDays("2026-11-20", "2026-11-22")).toBe(3);
    expect(rentalDays("2026-11-20", "2026-11-20")).toBe(1);
    expect(rentalDays("2026-12-31", "2027-01-01")).toBe(2);
  });
});

describe("pickup and return rules", () => {
  it("only allows pickups inside the window and outside blocked ranges", () => {
    expect(canPickUp("2026-11-19", availability)).toBe(false); // too soon
    expect(canPickUp("2026-11-20", availability)).toBe(true);
    expect(canPickUp("2026-11-26", availability)).toBe(false); // blocked
    expect(canPickUp("2027-02-17", availability)).toBe(false); // too far
    expect(
      canPickUp("2026-11-20", { ...availability, device_available: false }),
    ).toBe(false);
  });

  it("finds the first bookable day after a blocked start", () => {
    expect(firstPickup(availability)).toBe("2026-11-20");
    expect(
      firstPickup({
        ...availability,
        blocked_ranges: [{ from: "2026-11-18", to: "2026-11-22" }],
      }),
    ).toBe("2026-11-23");
  });

  it("stops the return before the next blocked date", () => {
    expect(latestReturn("2026-11-20", availability)).toBe("2026-11-24");
    expect(canReturn("2026-11-24", "2026-11-20", availability)).toBe(true);
    expect(canReturn("2026-11-28", "2026-11-20", availability)).toBe(false);
  });

  it("caps a rental at 30 days", () => {
    expect(latestReturn("2026-11-28", availability)).toBe(
      addDays("2026-11-28", 29),
    );
    expect(
      rentalDays("2026-11-28", latestReturn("2026-11-28", availability)),
    ).toBe(30);
  });
});

describe("selectDay", () => {
  const empty = { pickup: null, returnDate: null };

  it("picks up, then sets the return", () => {
    const first = selectDay(empty, "2026-11-20", availability);
    expect(first).toEqual({ pickup: "2026-11-20", returnDate: null });
    expect(selectDay(first, "2026-11-22", availability)).toEqual({
      pickup: "2026-11-20",
      returnDate: "2026-11-22",
    });
  });

  it("restarts when clicking before the pickup or after a full range", () => {
    const first = { pickup: "2026-11-22", returnDate: null };
    expect(selectDay(first, "2026-11-20", availability).pickup).toBe(
      "2026-11-20",
    );
    const full = { pickup: "2026-11-20", returnDate: "2026-11-22" };
    expect(selectDay(full, "2026-12-01", availability)).toEqual({
      pickup: "2026-12-01",
      returnDate: null,
    });
  });

  it("ignores days that can't be picked", () => {
    expect(selectDay(empty, "2026-11-26", availability)).toEqual(empty);
  });
});

describe("quotePreview", () => {
  it("multiplies the daily price by inclusive days and adds the deposit", () => {
    expect(quotePreview("2026-11-20", "2026-11-22", 95000, 190000)).toEqual({
      days: 3,
      rental: 285000,
      deposit: 190000,
      total: 475000,
    });
  });
});

describe("monthGrid", () => {
  it("lays out a month in Sunday-first weeks", () => {
    const weeks = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
});

describe("interpretBookingError", () => {
  it("sends signed-out visitors to sign in and back", () => {
    expect(
      interpretBookingError(401, { error: { code: "sign_in" } }, "/listings/x"),
    ).toMatchObject({
      action: { href: "/login?next=%2Flistings%2Fx" },
    });
  });

  it("asks for fresh availability on conflicts", () => {
    expect(
      interpretBookingError(409, { error: { code: "booking_conflict" } }, "/"),
    ).toMatchObject({ refresh: true });
  });

  it("explains duplicates, self-booking and profile problems", () => {
    expect(
      interpretBookingError(409, { error: { code: "duplicate_request" } }, "/")
        .message,
    ).toMatch(/already have an open request/);
    expect(
      interpretBookingError(400, { error: { code: "self_booking" } }, "/")
        .message,
    ).toMatch(/your own listing/);
    expect(
      interpretBookingError(403, { error: { code: "profile_required" } }, "/"),
    ).toMatchObject({ action: { href: "/account" } });
  });

  it("falls back safely", () => {
    expect(interpretBookingError(503, null, "/").message).toMatch(
      /couldn't send/,
    );
  });
});
