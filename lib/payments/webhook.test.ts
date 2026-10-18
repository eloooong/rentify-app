import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { signedEvent } from "./webhook";
const secret = "unit-webhook-secret";
const timestamp = 1_760_000_000;
const event = {
  data: {
    id: "evt_fixture",
    type: "event",
    attributes: {
      type: "checkout_session.payment.paid",
      livemode: false,
      data: {
        id: "cs_fixture",
        type: "checkout_session",
        attributes: {
          reference_number: "a1000000-0000-4000-8000-000000000001",
          livemode: false,
        },
      },
    },
  },
};
function fixture(value: unknown = event) {
  const raw = Buffer.from(JSON.stringify(value));
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest("hex");
  return { raw, header: `t=${timestamp},te=${digest},li=` };
}
it("verifies exact raw bytes and extracts only the durable inbox fields", () => {
  const f = fixture();
  expect(signedEvent(f.raw, f.header, secret, timestamp * 1000)).toMatchObject({
    id: "evt_fixture",
    session: "cs_fixture",
    reference: event.data.attributes.data.attributes.reference_number,
  });
  expect(signedEvent(f.raw, f.header, secret, timestamp * 1000).hash).toMatch(
    /^[0-9a-f]{64}$/,
  );
});
it.each([
  null,
  "",
  `t=${timestamp},te=bad,li=`,
  `t=${timestamp},te=${"a".repeat(64)},li=`,
  `t=${timestamp},te=${"a".repeat(64)},te=${"a".repeat(64)}`,
])("rejects missing, malformed, duplicate or invalid signatures", (header) => {
  expect(() =>
    signedEvent(fixture().raw, header, secret, timestamp * 1000),
  ).toThrow();
});
it("rejects changed bytes, stale/future signatures and live mode", () => {
  const f = fixture();
  expect(() =>
    signedEvent(
      Buffer.concat([f.raw, Buffer.from(" ")]),
      f.header,
      secret,
      timestamp * 1000,
    ),
  ).toThrow();
  for (const delta of [-301, 301])
    expect(() =>
      signedEvent(f.raw, f.header, secret, (timestamp + delta) * 1000),
    ).toThrow();
  expect(() =>
    signedEvent(f.raw, f.header + "extra", secret, timestamp * 1000),
  ).toThrow();
  const live = structuredClone(event);
  live.data.attributes.livemode = true;
  const g = fixture(live);
  expect(() =>
    signedEvent(g.raw, g.header, secret, timestamp * 1000),
  ).toThrow();
});
it("does not accept alternate undocumented envelopes or success-redirect payloads", () => {
  for (const value of [
    { paid: true },
    {
      data: {
        type: "checkout_session.payment.paid",
        data: event.data.attributes.data,
      },
    },
  ]) {
    const f = fixture(value);
    expect(() =>
      signedEvent(f.raw, f.header, secret, timestamp * 1000),
    ).toThrow();
  }
});
