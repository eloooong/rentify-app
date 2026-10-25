import { expect, it, vi } from "vitest";
import { normalizeSession, paymongoProvider } from "./provider";
const id = "a1000000-0000-4000-8000-000000000001";
const bookingId = "a1000000-0000-4000-8000-000000000002";
function response() {
  return {
    data: {
      id: "cs_fixture",
      type: "checkout_session",
      attributes: {
        livemode: false,
        reference_number: id,
        checkout_url: "https://checkout.paymongo.com/fixture",
        status: "active",
        payments: [] as unknown[],
      },
    },
  };
}
it("creates only GCash test checkout with fixed totals, no fees and stable idempotency", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(response()));
  const gateway = paymongoProvider("sk_test_unit", send);
  const input = {
    id,
    booking_id: bookingId,
    rental_amount: 255000,
    deposit_amount: 170000,
  };
  await gateway.create(input, "https://rentify.example");
  await gateway.create(input, "https://rentify.example");
  expect(send.mock.calls[0][0]).toBe(
    "https://api.paymongo.com/v2/checkout_sessions",
  );
  const options = send.mock.calls[0][1]!;
  expect(options.headers).toMatchObject({
    "Idempotency-Key": `rentify-checkout-${id}`,
  });
  expect(send.mock.calls[1][1]!.body).toBe(options.body);
  expect(JSON.parse(options.body as string).data.attributes).toMatchObject({
    payment_method_types: ["gcash"],
    pass_on_fees: false,
    reference_number: id,
    success_url: `https://rentify.example/checkout/${bookingId}`,
    cancel_url: `https://rentify.example/checkout/${bookingId}`,
    line_items: [
      { amount: 255000, quantity: 1 },
      { amount: 170000, quantity: 1 },
    ],
  });
});
it("refuses an invalid booking return path before contacting the provider", async () => {
  const send = vi.fn<typeof fetch>();
  const gateway = paymongoProvider("sk_test_unit", send);
  await expect(
    gateway.create(
      {
        id,
        booking_id: "../../account",
        rental_amount: 10000,
        deposit_amount: 0,
      },
      "https://rentify.example",
    ),
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
it.each(["sk_live_unit", "pk_test_unit", "", "anything"])(
  "rejects non-test server keys without contacting the provider: %s",
  (key) => {
    const send = vi.fn();
    expect(() => paymongoProvider(key, send)).toThrow();
    expect(send).not.toHaveBeenCalled();
  },
);
it("pins retrieval/expiry endpoints and refuses identifier path injection", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(response()));
  const gateway = paymongoProvider("sk_test_unit", send);
  await gateway.retrieve("cs_fixture");
  await gateway.expire("cs_fixture");
  expect(send.mock.calls.map((call) => call[0])).toEqual([
    "https://api.paymongo.com/v1/checkout_sessions/cs_fixture",
    "https://api.paymongo.com/v1/checkout_sessions/cs_fixture/expire",
  ]);
  await expect(gateway.retrieve("cs_other/../../secrets")).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(2);
});
it.each([
  "https://evil.example/pay",
  "http://checkout.paymongo.com/pay",
  "https://checkout.paymongo.com.evil.example/pay",
  "https://user:pass@checkout.paymongo.com/pay",
])("rejects unsafe checkout URLs: %s", (url) => {
  const value = response();
  value.data.attributes.checkout_url = url;
  expect(() => normalizeSession(value)).toThrow();
});
it("rejects live resources and requires complete paid evidence, ignoring untrusted extra billing fields", () => {
  const value = response();
  Object.assign(value.data.attributes, { livemode: true });
  expect(() => normalizeSession(value)).toThrow();
  Object.assign(value.data.attributes, {
    livemode: false,
    payments: [
      {
        id: "pay_fixture",
        attributes: {
          status: "paid",
          amount: 425000,
          currency: "PHP",
          livemode: false,
          source: { type: "gcash" },
          paid_at: 1760000000,
          billing: { email: "private@example.test" },
        },
      },
    ],
  });
  const normalized = normalizeSession(value);
  expect(normalized.payments[0]).toMatchObject({
    amount: 425000,
    method: "gcash",
  });
  expect(JSON.stringify(normalized)).not.toContain("private@example.test");
  (
    value.data.attributes.payments[0] as { attributes: { paid_at: unknown } }
  ).attributes.paid_at = null;
  expect(() => normalizeSession(value)).toThrow();
});
it("keeps errors generic and never echoes a raw provider error or API key", async () => {
  const gateway = paymongoProvider(
    "sk_test_unit",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ private: "private-provider-details" }, { status: 500 }),
      ),
  );
  await expect(gateway.retrieve("cs_fixture")).rejects.toMatchObject({
    code: "provider_unavailable",
  });
  await expect(gateway.retrieve("cs_fixture")).rejects.not.toThrow(
    "private-provider-details",
  );
});
it("accepts an explicitly expired session without a remaining checkout capability", () => {
  const value = response();
  Object.assign(value.data.attributes, {
    status: "expired",
    checkout_url: null,
  });
  expect(normalizeSession(value)).toMatchObject({
    status: "expired",
    checkout_url: null,
  });
});
