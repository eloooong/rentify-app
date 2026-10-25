import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sessionId } from "./xendit";
const event = z.object({
  event: z.enum(["payment_session.completed", "payment_session.expired"]),
  business_id: z.string().min(1),
  data: z.object({
    payment_session_id: sessionId,
    reference_id: z.uuid(),
    business_id: z.string().min(1).optional(),
    session_type: z.literal("PAY"),
    currency: z.literal("PHP"),
    country: z.literal("PH"),
    mode: z.literal("PAYMENT_LINK"),
  }),
});
export function signedEvent(raw: Buffer, token: string | null, secret: string) {
  if (
    !secret ||
    !token ||
    token.length > 1024 ||
    Buffer.byteLength(token) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  )
    throw new Error("Invalid webhook token.");
  const parsed = event.parse(JSON.parse(raw.toString("utf8")));
  if (parsed.data.business_id && parsed.business_id !== parsed.data.business_id)
    throw new Error("Invalid webhook business.");
  // Delivery timestamps may change on retries; deduplicate the resource transition.
  const id = createHash("sha256")
    .update(
      `${parsed.business_id}:${parsed.event}:${parsed.data.payment_session_id}`,
    )
    .digest("hex");
  const hash = createHash("sha256")
    .update(`${id}:${parsed.data.reference_id}`)
    .digest("hex");
  return {
    id: `xevt_${id}`,
    session: parsed.data.payment_session_id,
    reference: parsed.data.reference_id,
    hash,
  };
}
