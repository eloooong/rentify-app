import { expect, it } from "vitest";
import {
  actionSchema,
  availabilityQuerySchema,
  listSchema,
  requestSchema,
} from "./validation";
const id = "a1000000-0000-4000-8000-000000000001";
const input = {
  listing_id: id,
  request_key: id,
  pickup_date: "2027-01-01",
  return_date: "2027-01-03",
};

it("accepts same-day and thirty-day date ranges with a mandatory retry key", () => {
  expect(
    requestSchema.parse({ ...input, return_date: input.pickup_date }),
  ).toEqual({ ...input, return_date: input.pickup_date });
  expect(
    requestSchema.safeParse({ ...input, return_date: "2027-01-30" }).success,
  ).toBe(true);
  expect(
    requestSchema.safeParse({ ...input, request_key: undefined }).success,
  ).toBe(false);
});
it.each(["2027-01-31", "2026-12-31", "2027-02-30", "2027-01-03T12:00:00Z"])(
  "rejects overlong, backwards, invalid or timestamp date: %s",
  (return_date) => {
    expect(requestSchema.safeParse({ ...input, return_date }).success).toBe(
      false,
    );
  },
);
it.each([
  { owner_id: id },
  { renter_id: id },
  { rental_amount: 1 },
  { status: "paid" },
  { daily_price_amount: 1 },
])("rejects client-controlled identities, prices and statuses", (extra) => {
  expect(requestSchema.safeParse({ ...input, ...extra }).success).toBe(false);
});
it("allows only the three supported unpaid actions with clean reasons", () => {
  expect(
    actionSchema.parse({ action: "cancel", reason: "  Changed plans  " }),
  ).toEqual({ action: "cancel", reason: "Changed plans" });
  expect(actionSchema.safeParse({ action: "accept" }).success).toBe(true);
  for (const value of [
    { action: "paid" },
    { action: "handed_over" },
    { action: "accept", reason: "extra" },
    { action: "decline" },
    { action: "cancel", reason: "x" },
    { action: "cancel", reason: "line\nbreak" },
  ]) {
    expect(actionSchema.safeParse(value).success).toBe(false);
  }
});
it("bounds private lists and cannot select another participant", () => {
  expect(listSchema.parse({})).toEqual({ role: "all", page: 1, pageSize: 20 });
  for (const value of [
    { owner_id: id },
    { page: "0" },
    { page: "10001" },
    { pageSize: "51" },
    { role: "admin" },
    { status: "refunded" },
  ]) {
    expect(listSchema.safeParse(value).success).toBe(false);
  }
});
it("bounds availability windows and rejects private query fields", () => {
  expect(
    availabilityQuerySchema.safeParse({
      listingId: id,
      from: "2027-01-01",
      to: "2027-04-30",
    }).success,
  ).toBe(true);
  for (const value of [
    { listingId: id, from: "2027-01-01", to: "2027-05-01" },
    { listingId: id, from: "2027-01-03", to: "2027-01-01" },
    { listingId: id, from: "2027-01-01", to: "2027-01-03", renter_id: id },
  ]) {
    expect(availabilityQuerySchema.safeParse(value).success).toBe(false);
  }
});
