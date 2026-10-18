import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const event = z.object({
  data: z.object({
    id: z.string().regex(/^evt_[A-Za-z0-9]+$/),
    type: z.literal("event"),
    attributes: z.object({
      type: z.literal("checkout_session.payment.paid"),
      livemode: z.literal(false),
      data: z.object({
        id: z.string().regex(/^cs_[A-Za-z0-9]+$/),
        type: z.literal("checkout_session"),
        attributes: z.object({
          reference_number: z.uuid(),
          livemode: z.literal(false),
        }),
      }),
    }),
  }),
});
export function signedEvent(
  raw: Buffer,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  // Deliberately pin the detailed timestamp.test-signature format; no unsigned fallback.
  if (!secret || !header || header.length > 1024)
    throw new Error("Invalid webhook signature.");
  const pairs = header.split(",").map((entry) => entry.trim().split("="));
  if (
    pairs.some((entry) => entry.length !== 2) ||
    new Set(pairs.map(([key]) => key)).size !== pairs.length
  )
    throw new Error("Invalid webhook signature.");
  const values = Object.fromEntries(pairs);
  if (
    !/^\d{10}$/.test(values.t ?? "") ||
    !/^[0-9a-f]{64}$/.test(values.te ?? "") ||
    (values.li ?? "") !== "" ||
    Object.keys(values).some((key) => !["t", "te", "li"].includes(key)) ||
    Math.abs(now / 1000 - Number(values.t)) > 300
  )
    throw new Error("Invalid webhook signature.");
  const expected = createHmac("sha256", secret)
    .update(`${values.t}.`)
    .update(raw)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(values.te, "hex")))
    throw new Error("Invalid webhook signature.");
  const parsed = event.parse(JSON.parse(raw.toString("utf8")));
  return {
    id: parsed.data.id,
    session: parsed.data.attributes.data.id,
    reference: parsed.data.attributes.data.attributes.reference_number,
    hash: createHash("sha256").update(raw).digest("hex"),
  };
}
