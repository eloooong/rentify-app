import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/route", () => ({ createRouteClient: vi.fn() }));
import { bookingError } from "./errors";

it.each([
  ["P0001", "booking_conflict", 409, "booking_conflict"],
  ["P0001", "booking_expired", 409, "booking_expired"],
  ["P0001", "not_found", 404, "not_found"],
  ["P0001", "invalid_dates", 400, "invalid_dates"],
  ["42501", "profile_required", 403, "profile_required"],
  ["42501", "permission denied", 403, "forbidden"],
  ["23P01", "private conflicting row", 409, "booking_conflict"],
  ["40P01", "deadlock details", 409, "retry"],
])(
  "maps %s/%s to a stable application error",
  (code, message, status, resultCode) => {
    try {
      bookingError({ code: String(code), message: String(message) });
      expect.fail("Expected a booking error");
    } catch (error) {
      expect(error).toMatchObject({ status, code: resultCode });
    }
  },
);
it("never echoes unknown database messages or row details", () => {
  const raw = "private database message and row values";
  expect(() => bookingError({ code: "P0001", message: raw })).toThrow(
    "The booking service is temporarily unavailable.",
  );
  expect(() => bookingError({ code: "23P01", message: raw })).not.toThrow(raw);
  expect(() => bookingError(null)).not.toThrow();
});
