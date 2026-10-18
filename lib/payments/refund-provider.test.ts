import { expect, it, vi } from "vitest";
import { paymongoRefundProvider } from "./refund-provider";
const id = "a1000000-0000-4000-8000-000000000001";
function resource(overrides = {}) {
  return {
    id: "ref_fixture",
    type: "refund",
    attributes: {
      amount: 425000,
      currency: "PHP",
      livemode: false,
      payment_id: "pay_fixture",
      status: "pending",
      notes: `rentify-refund:${id}`,
      ...overrides,
    },
  };
}
it("pins the reference refund endpoints and server-controlled body, marker and stable key", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ data: resource() }));
  const provider = paymongoRefundProvider("sk_test_unit", send);
  const input = { id, payment_id: "pay_fixture", amount: 425000 };
  expect(await provider.create(input)).toEqual({
    id: "ref_fixture",
    payment_id: "pay_fixture",
    amount: 425000,
    currency: "PHP",
    livemode: false,
    status: "pending",
    reference: id,
  });
  await provider.retrieve("ref_fixture");
  expect(send.mock.calls.map((c) => c[0])).toEqual([
    "https://api.paymongo.com/refunds",
    "https://api.paymongo.com/refunds/ref_fixture",
  ]);
  expect(send.mock.calls[0][1]).toMatchObject({
    method: "POST",
    redirect: "error",
    headers: { "Idempotency-Key": `rentify-refund-${id}` },
  });
  expect(JSON.parse(send.mock.calls[0][1]!.body as string)).toEqual({
    data: {
      attributes: {
        amount: 425000,
        payment_id: "pay_fixture",
        reason: "others",
        notes: `rentify-refund:${id}`,
        metadata: { rentify_refund: id },
      },
    },
  });
});
it.each(["sk_live_unit", "pk_test_unit", ""])(
  "rejects non-test secrets: %s",
  (key) => {
    const send = vi.fn();
    expect(() => paymongoRefundProvider(key, send)).toThrow();
    expect(send).not.toHaveBeenCalled();
  },
);
it.each([
  { livemode: true },
  { currency: "USD" },
  { amount: 99 },
  { status: "unknown" },
])("rejects unverifiable refund evidence %j", async (override) => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ data: resource(override) }));
  await expect(
    paymongoRefundProvider("sk_test_unit", send).retrieve("ref_fixture"),
  ).rejects.toThrow();
});
it("strips private notes/metadata and preserves an unrecognized refund for review", async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: resource({
        notes: "Private operator remark",
        metadata: { secret: "hidden" },
      }),
    }),
  );
  const value = await paymongoRefundProvider("sk_test_unit", send).retrieve(
    "ref_fixture",
  );
  expect(value.reference).toBeNull();
  expect(JSON.stringify(value)).not.toMatch(/Private|hidden|metadata|notes/);
});
it("follows bounded pagination and checks payment identity", async () => {
  const second = { ...resource(), id: "ref_second" };
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ data: [resource()], has_more: true }),
    )
    .mockResolvedValueOnce(Response.json({ data: [second], has_more: false }));
  expect(
    await paymongoRefundProvider("sk_test_unit", send).list("pay_fixture"),
  ).toHaveLength(2);
  const url = new URL(send.mock.calls[1][0] as string);
  expect(url.searchParams.get("data.attributes.payment_id")).toBe(
    "pay_fixture",
  );
  expect(url.searchParams.get("data.attributes.after")).toBe("ref_fixture");
});
it("refuses truncated, duplicated, wrong-payment or malformed refund lists", async () => {
  for (const body of [
    { data: [], has_more: true },
    { data: [resource(), resource()], has_more: false },
    { data: [resource({ payment_id: "pay_other" })], has_more: false },
    { data: [] },
  ]) {
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(body));
    await expect(
      paymongoRefundProvider("sk_test_unit", send).list("pay_fixture"),
    ).rejects.toThrow();
  }
});
it("fails closed when pagination exceeds its lease budget", async () => {
  let n = 0;
  const send = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      data: [{ ...resource(), id: `ref_page${++n}` }],
      has_more: true,
    }),
  );
  await expect(
    paymongoRefundProvider("sk_test_unit", send).list("pay_fixture"),
  ).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(2);
});
it("rejects path injection and hides provider error bodies", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("secret raw provider body", { status: 400 }),
    );
  const p = paymongoRefundProvider("sk_test_unit", send);
  await expect(p.retrieve("ref_x/../../anything")).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  await expect(p.retrieve("ref_fixture")).rejects.toThrow(
    "could not be verified",
  );
});
