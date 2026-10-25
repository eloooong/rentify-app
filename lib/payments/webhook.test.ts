import { expect, it } from "vitest";
import { signedEvent } from "./webhook";
const secret = "unit-webhook-token";
const event = {
  event: "payment_session.completed",
  business_id: "business",
  created: "2026-10-25T10:00:00Z",
  data: {
    payment_session_id: "ps-661f87c614802d6c402cd82d",
    reference_id: "a1000000-0000-4000-8000-000000000001",
    business_id: "business",
    session_type: "PAY",
    currency: "PHP",
    country: "PH",
    mode: "PAYMENT_LINK",
  },
};
const raw = (value: unknown = event) => Buffer.from(JSON.stringify(value));
it("authenticates the callback token and extracts only normalized durable identity", () => {
  expect(signedEvent(raw(), secret, secret)).toMatchObject({
    id: expect.stringMatching(/^xevt_[a-f0-9]{64}$/),
    hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    session: event.data.payment_session_id,
    reference: event.data.reference_id,
  });
});
it.each([null, "", "wrong", secret + "," + secret])(
  "rejects missing, wrong and duplicated tokens: %s",
  (token) => expect(() => signedEvent(raw(), token, secret)).toThrow(),
);
it("deduplicates retries despite changed timestamps or ignored customer fields", () => {
  const withoutBusiness = { ...event.data, business_id: undefined };
  expect(
    signedEvent(raw({ ...event, data: withoutBusiness }), secret, secret),
  ).toEqual(signedEvent(raw(), secret, secret));
  expect(
    signedEvent(
      raw({ ...event, created: "2026-10-25T11:00:00Z", private: "ignored" }),
      secret,
      secret,
    ),
  ).toEqual(signedEvent(raw(), secret, secret));
  expect(
    signedEvent(
      raw({ ...event, event: "payment_session.expired" }),
      secret,
      secret,
    ).id,
  ).not.toBe(signedEvent(raw(), secret, secret).id);
});
it("rejects altered resource references, wrong business, wrong envelope and wrong country", () => {
  for (const value of [
    { paid: true },
    { ...event, event: "payment.capture" },
    { ...event, data: { ...event.data, business_id: "other" } },
    { ...event, data: { ...event.data, country: "ID" } },
  ])
    expect(() => signedEvent(raw(value), secret, secret)).toThrow();
  expect(
    signedEvent(
      raw({
        ...event,
        data: {
          ...event.data,
          reference_id: "b1000000-0000-4000-8000-000000000001",
        },
      }),
      secret,
      secret,
    ).hash,
  ).not.toBe(signedEvent(raw(), secret, secret).hash);
});
