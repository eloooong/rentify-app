import { z } from "zod";
import {
  minorAmount,
  paymentId,
  paymentResource,
  ProviderError,
  sessionId,
  testCheckoutUrl,
  xenditRequest,
} from "./xendit";
export { ProviderError } from "./xendit";

const session = z.object({
  payment_session_id: sessionId,
  reference_id: z.uuid(),
  business_id: z.string().min(1),
  session_type: z.literal("PAY"),
  mode: z.literal("PAYMENT_LINK"),
  country: z.literal("PH"),
  currency: z.literal("PHP"),
  amount: z.number().positive(),
  status: z.enum(["ACTIVE", "COMPLETED", "EXPIRED", "CANCELED"]),
  payment_link_url: testCheckoutUrl.nullable(),
  payment_id: paymentId.nullable().optional(),
  payment_request_id: z.string().nullable().optional(),
});
export type Snapshot = {
  session_id: string;
  reference: string;
  checkout_url: string | null;
  status: "active" | "expired";
  livemode: false;
  payments: {
    id: string;
    amount: number;
    currency: string;
    method: string;
    paid_at: string;
  }[];
};
export function normalizeSession(value: unknown, payment?: unknown): Snapshot {
  const parsed = session.safeParse(value);
  if (!parsed.success) throw new ProviderError("provider_invalid");
  const s = parsed.data;
  const payments: Snapshot["payments"] = [];
  minorAmount(s.amount);
  if (s.status === "ACTIVE" && !s.payment_link_url)
    throw new ProviderError("provider_invalid");
  if (s.status === "COMPLETED" || s.payment_id) {
    const result = paymentResource.safeParse(payment);
    if (
      !result.success ||
      result.data.payment_id !== s.payment_id ||
      result.data.payment_request_id !== s.payment_request_id ||
      result.data.business_id !== s.business_id
    )
      throw new ProviderError("provider_invalid");
    const p = result.data;
    const captured = minorAmount(p.captures[0].capture_amount);
    if (
      captured !== minorAmount(p.request_amount) ||
      captured !== minorAmount(s.amount)
    )
      throw new ProviderError("provider_invalid");
    payments.push({
      id: p.payment_id,
      amount: captured,
      currency: "PHP",
      method: "gcash",
      paid_at: p.captures[0].capture_timestamp,
    });
  }
  return {
    session_id: s.payment_session_id,
    reference: s.reference_id,
    checkout_url: s.payment_link_url,
    status:
      s.status === "EXPIRED" || s.status === "CANCELED" ? "expired" : "active",
    livemode: false,
    payments,
  };
}
export type CheckoutInput = {
  id: string;
  booking_id: string;
  rental_amount: number;
  deposit_amount: number;
};
export interface PaymentProvider {
  create(input: CheckoutInput, origin: string): Promise<Snapshot>;
  retrieve(id: string): Promise<Snapshot>;
  expire(id: string): Promise<void>;
}
export function xenditProvider(
  secret: string,
  send: typeof fetch = fetch,
): PaymentProvider {
  const request = xenditRequest(secret, send);
  async function normalized(value: unknown) {
    const s = session.safeParse(value);
    if (!s.success) throw new ProviderError("provider_invalid");
    return normalizeSession(
      value,
      s.data.payment_id
        ? await request(`/v3/payments/${s.data.payment_id}`)
        : undefined,
    );
  }
  return {
    async create(input, origin) {
      z.uuid().parse(input.id);
      const booking = z.uuid().parse(input.booking_id);
      const url = new URL(origin);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new ProviderError("provider_unavailable");
      z.number().int().positive().parse(input.rental_amount);
      z.number().int().nonnegative().parse(input.deposit_amount);
      const total = input.rental_amount + input.deposit_amount;
      if (!Number.isSafeInteger(total) || total < 100 || total > 10_000_000)
        throw new ProviderError("provider_invalid");
      const returnUrl = `${url.origin}/checkout/${booking}`;
      const items = [
        {
          reference_id: "rental",
          type: "PHYSICAL_SERVICE",
          name: "Demo rental",
          category: "rental",
          net_unit_amount: input.rental_amount / 100,
          quantity: 1,
        },
      ];
      if (input.deposit_amount > 0)
        items.push({
          reference_id: "deposit",
          type: "PHYSICAL_SERVICE",
          name: "Refundable demo deposit",
          category: "deposit",
          net_unit_amount: input.deposit_amount / 100,
          quantity: 1,
        });
      // No documented session idempotency guarantee: the worker sends one POST only.
      return normalized(
        await request("/sessions", {
          reference_id: input.id,
          session_type: "PAY",
          mode: "PAYMENT_LINK",
          allow_save_payment_method: "DISABLED",
          amount: total / 100,
          currency: "PHP",
          country: "PH",
          allowed_payment_channels: ["GCASH"],
          success_return_url: returnUrl,
          cancel_return_url: returnUrl,
          items,
          metadata: { rentify_attempt: input.id, rentify_booking: booking },
        }),
      );
    },
    async retrieve(id) {
      sessionId.parse(id);
      return normalized(await request(`/sessions/${id}`));
    },
    async expire(id) {
      sessionId.parse(id);
      await request(`/sessions/${id}/cancel`, {});
    },
  };
}
