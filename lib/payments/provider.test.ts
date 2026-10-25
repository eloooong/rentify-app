import { expect, it, vi } from "vitest";
import { normalizeSession, xenditProvider } from "./provider";
import { minorAmount } from "./xendit";
const id = "a1000000-0000-4000-8000-000000000001";
const booking = "a1000000-0000-4000-8000-000000000002";
const sid = "ps-661f87c614802d6c402cd82d";
const pid = `py-${id}`;
const rid = `pr-${id}`;
const session = () => ({
  payment_session_id: sid,
  reference_id: id,
  business_id: "business",
  session_type: "PAY",
  mode: "PAYMENT_LINK",
  country: "PH",
  currency: "PHP",
  amount: 4250,
  status: "ACTIVE",
  payment_link_url: "https://dev.xen.to/fixture",
  payment_id: null as string | null,
  payment_request_id: null as string | null,
});
const payment = () => ({
  payment_id: pid,
  payment_request_id: rid,
  business_id: "business",
  status: "SUCCEEDED",
  country: "PH",
  currency: "PHP",
  channel_code: "GCASH",
  request_amount: 4250,
  captures: [
    { capture_amount: 4250, capture_timestamp: "2026-10-25T10:00:00Z" },
  ],
});
const input = {
  id,
  booking_id: booking,
  rental_amount: 255000,
  deposit_amount: 170000,
};
it("creates a GCash-only Xendit test session with exact peso amounts and booking return URLs", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(session()));
  await xenditProvider("xnd_development_unit", send).create(
    input,
    "https://rentify.example",
  );
  expect(send.mock.calls[0][0]).toBe("https://api.xendit.co/sessions");
  const options = send.mock.calls[0][1]!;
  expect(options.method).toBe("POST");
  expect(options.redirect).toBe("error");
  expect(options.headers).not.toHaveProperty("Idempotency-Key");
  expect(JSON.parse(options.body as string)).toMatchObject({
    reference_id: id,
    session_type: "PAY",
    mode: "PAYMENT_LINK",
    allow_save_payment_method: "DISABLED",
    amount: 4250,
    currency: "PHP",
    country: "PH",
    allowed_payment_channels: ["GCASH"],
    success_return_url: `https://rentify.example/checkout/${booking}`,
    cancel_return_url: `https://rentify.example/checkout/${booking}`,
    items: [
      { net_unit_amount: 2550, quantity: 1 },
      { net_unit_amount: 1700, quantity: 1 },
    ],
  });
});
it("supports zero deposit and centavo precision without adding a deposit line", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...session(), amount: 100.01 }));
  await xenditProvider("xnd_development_unit", send).create(
    { ...input, rental_amount: 10001, deposit_amount: 0 },
    "https://rentify.example",
  );
  expect(JSON.parse(send.mock.calls[0][1]!.body as string).items).toHaveLength(
    1,
  );
  expect(minorAmount(100.01)).toBe(10001);
});
it.each(["xnd_production_unit", "sk_test_unit", "", "anything"])(
  "rejects non-development keys: %s",
  (key) => {
    const send = vi.fn<typeof fetch>();
    expect(() => xenditProvider(key, send)).toThrow();
    expect(send).not.toHaveBeenCalled();
  },
);
it.each([
  "http://localhost:3000",
  "https://user@rentify.example",
  "https://rentify.example/path",
])("requires a configured HTTPS return origin: %s", async (origin) => {
  const send = vi.fn<typeof fetch>();
  await expect(
    xenditProvider("xnd_development_unit", send).create(input, origin),
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
it("rejects path injection and quotes exceeding GCash limits before network work", async () => {
  const send = vi.fn<typeof fetch>();
  const p = xenditProvider("xnd_development_unit", send);
  await expect(
    p.create({ ...input, booking_id: "../account" }, "https://rentify.example"),
  ).rejects.toThrow();
  await expect(
    p.create(
      { ...input, rental_amount: 10_000_001 },
      "https://rentify.example",
    ),
  ).rejects.toThrow();
  await expect(p.retrieve("ps-../secret")).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
it("retrieves actual captured payment evidence before normalizing completed sessions", async () => {
  const s = {
    ...session(),
    status: "COMPLETED",
    payment_id: pid,
    payment_request_id: rid,
  };
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(s))
    .mockResolvedValueOnce(Response.json(payment()));
  const result = await xenditProvider("xnd_development_unit", send).retrieve(
    sid,
  );
  expect(send.mock.calls.map((c) => c[0])).toEqual([
    `https://api.xendit.co/sessions/${sid}`,
    `https://api.xendit.co/v3/payments/${pid}`,
  ]);
  expect(result.payments).toEqual([
    {
      id: pid,
      amount: 425000,
      currency: "PHP",
      method: "gcash",
      paid_at: "2026-10-25T10:00:00Z",
    },
  ]);
  expect(() => normalizeSession(s)).toThrow();
  for (const p of [
    { ...payment(), business_id: "other" },
    { ...payment(), payment_request_id: `pr-${booking}` },
    { ...payment(), status: "PENDING" },
    { ...payment(), captures: [] },
    { ...payment(), request_amount: 1 },
  ])
    expect(() => normalizeSession(s, p)).toThrow();
});
it.each([
  "https://checkout.xendit.co/sessions/" + sid,
  "https://evil.example/pay",
  "https://dev.xen.to.evil.example/pay",
  "https://user@dev.xen.to/pay",
  "http://dev.xen.to/pay",
])("rejects live or unsafe checkout URLs: %s", (url) => {
  expect(() =>
    normalizeSession({ ...session(), payment_link_url: url }),
  ).toThrow();
});
it("normalizes canceled/expired sessions and pins cancellation endpoint", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  await xenditProvider("xnd_development_unit", send).expire(sid);
  expect(send.mock.calls[0][0]).toBe(
    `https://api.xendit.co/sessions/${sid}/cancel`,
  );
  expect(
    normalizeSession({
      ...session(),
      status: "CANCELED",
      payment_link_url: null,
    }).status,
  ).toBe("expired");
});
it.each([0, -1, 1.001, 100000.01, Infinity])(
  "rejects invalid PHP amounts: %s",
  (amount) => expect(() => minorAmount(amount)).toThrow(),
);
it("keeps raw provider errors private", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ message: "private details" }, { status: 403 }),
    );
  await expect(
    xenditProvider("xnd_development_unit", send).retrieve(sid),
  ).rejects.toThrow("could not be verified");
});
