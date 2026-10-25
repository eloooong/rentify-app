import { expect, it, vi } from "vitest";
import { xenditRefundProvider } from "./refund-provider";
const id = "a1000000-0000-4000-8000-000000000001";
const pid = `py-${id}`,
  rid = `pr-${id}`,
  fid = `rfd-${id}`;
const payment = {
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
};
const refund = (extra = {}) => ({
  id: fid,
  payment_request_id: rid,
  amount: 4250,
  currency: "PHP",
  status: "PENDING",
  reference_id: id,
  ...extra,
});
function transport(body: unknown) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      Response.json(String(url).includes("/v3/payments/") ? payment : body),
    );
}
it("binds refunds to the authenticated payment request with stable refund idempotency", async () => {
  const send = transport(refund());
  expect(
    await xenditRefundProvider("xnd_development_unit", send).create({
      id,
      payment_id: pid,
      amount: 425000,
    }),
  ).toMatchObject({
    id: fid,
    payment_id: pid,
    reference: id,
    amount: 425000,
    status: "pending",
    livemode: false,
  });
  expect(send.mock.calls[1][0]).toBe("https://api.xendit.co/refunds");
  const opts = send.mock.calls[1][1]!;
  expect(opts.headers).toHaveProperty(
    "idempotency-key",
    `rentify-refund-${id}`,
  );
  expect(JSON.parse(opts.body as string)).toMatchObject({
    reference_id: id,
    payment_request_id: rid,
    amount: 4250,
    currency: "PHP",
    reason: "CANCELLATION",
  });
});
it("reads a refund by id without treating pending as success", async () => {
  const send = transport(refund());
  expect(
    (
      await xenditRefundProvider("xnd_development_unit", send).retrieve(
        fid,
        pid,
      )
    ).status,
  ).toBe("pending");
  expect(send.mock.calls[1][0]).toBe(`https://api.xendit.co/refunds/${fid}`);
});
it("verifies payment identity and enforces the captured amount", async () => {
  const send = transport(refund());
  const p = xenditRefundProvider("xnd_development_unit", send);
  await expect(
    p.create({ id, payment_id: pid, amount: 425001 }),
  ).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
});
it("rejects wrong-request, malformed and unsupported outcomes", async () => {
  for (const r of [
    refund({ payment_request_id: "pr-wrong" }),
    refund({ status: "CANCELLED" }),
    refund({ amount: 1.001 }),
    {},
  ])
    await expect(
      xenditRefundProvider("xnd_development_unit", transport(r)).retrieve(
        fid,
        pid,
      ),
    ).rejects.toThrow();
});
it("does not expose private metadata and keeps unknown references unbound", async () => {
  const value = await xenditRefundProvider(
    "xnd_development_unit",
    transport(
      refund({ reference_id: "external", metadata: { private: "hidden" } }),
    ),
  ).retrieve(fid, pid);
  expect(value.reference).toBeNull();
  expect(JSON.stringify(value)).not.toContain("hidden");
});
it("lists all refunds for the verified request with bounded pagination", async () => {
  let page = 0;
  const send = vi.fn<typeof fetch>().mockImplementation(async (url) =>
    Response.json(
      String(url).includes("/v3/payments/")
        ? payment
        : {
            data: [
              refund({
                id: page++ ? "rfd-b1000000-0000-4000-8000-000000000001" : fid,
              }),
            ],
            has_more: page === 1,
          },
    ),
  );
  expect(
    await xenditRefundProvider("xnd_development_unit", send).list(pid),
  ).toHaveLength(2);
  const url = new URL(send.mock.calls[2][0] as string);
  expect(url.searchParams.get("payment_request_id")).toBe(rid);
  expect(url.searchParams.get("after_id")).toBe(fid);
});
it("refuses incomplete pagination, duplicate refunds and wrong requests", async () => {
  for (const body of [
    { data: [], has_more: true },
    { data: [refund(), refund()], has_more: false },
    { data: [refund({ payment_request_id: "pr-wrong" })], has_more: false },
    { data: [] },
  ])
    await expect(
      xenditRefundProvider("xnd_development_unit", transport(body)).list(pid),
    ).rejects.toThrow();
});
it("refuses live keys and identifier path injection before a network request", async () => {
  const send = vi.fn<typeof fetch>();
  expect(() => xenditRefundProvider("xnd_production_unit", send)).toThrow();
  const p = xenditRefundProvider("xnd_development_unit", send);
  await expect(p.retrieve("../secret", pid)).rejects.toThrow();
  await expect(p.list("../secret")).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
});
