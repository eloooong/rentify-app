import { expect, it } from "vitest";
import { historyQuery, historySchema } from "./history-validation";

it("accepts bounded participant/type/date filters and leap-day dates", () => {
  expect(
    historyQuery.parse({
      type: "refund",
      role: "owner",
      from: "2024-02-29",
      to: "2024-03-01",
      page: "2",
      pageSize: "50",
    }),
  ).toMatchObject({ type: "refund", role: "owner", page: 2, pageSize: 50 });
  expect(historyQuery.parse({})).toEqual({
    role: "all",
    page: 1,
    pageSize: 20,
  });
});
it.each([
  { user_id: "someone" },
  { type: "payout" },
  { role: "admin" },
  { page: "0" },
  { pageSize: "51" },
  { from: "2026-02-29" },
  { from: "2026-10-26", to: "2026-10-25" },
  { from: "2026-10-25T00:00:00Z" },
])("rejects invalid or identity-selecting filters: %j", (input) => {
  expect(historyQuery.safeParse(input).success).toBe(false);
});
it("rejects provider capabilities and unsafe monetary amounts in public output", () => {
  const row = {
    id: "payment:a1000000-0000-4000-8000-000000000001",
    booking_id: "a1000000-0000-4000-8000-000000000001",
    listing_id: "a1000000-0000-4000-8000-000000000002",
    role: "renter",
    type: "payment",
    state: "captured",
    amount: 425000,
    currency: "PHP",
    provider: "xendit",
    test_mode: true,
    occurred_at: "2026-10-25T16:00:00+08:00",
    updated_at: "2026-10-25T08:00:01Z",
    rental_amount: 255000,
    deposit_amount: 170000,
  };
  const output = {
    data: [row],
    pagination: { page: 1, pageSize: 20, total: 1 },
    timezone: "Asia/Manila",
  };
  expect(historySchema.safeParse(output).success).toBe(true);
  for (const extra of [
    { checkout_url: "https://dev.xen.to/private" },
    { payment_id: "py-private" },
    { last_error_code: "private" },
  ])
    expect(
      historySchema.safeParse({ ...output, data: [{ ...row, ...extra }] })
        .success,
    ).toBe(false);
  expect(
    historySchema.safeParse({
      ...output,
      data: [{ ...row, amount: Number.MAX_SAFE_INTEGER + 1 }],
    }).success,
  ).toBe(false);
});
