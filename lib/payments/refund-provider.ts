import { z } from "zod";
import { ProviderError } from "./provider";

const paymentId = z.string().regex(/^pay_[A-Za-z0-9]+$/);
const refundId = z.string().regex(/^ref_[A-Za-z0-9]+$/);
const resource = z.object({
  id: refundId,
  type: z.literal("refund"),
  attributes: z.object({
    amount: z.number().int().min(100).max(2147483647),
    currency: z.literal("PHP"),
    livemode: z.literal(false),
    payment_id: paymentId,
    status: z.enum(["pending", "processing", "succeeded", "failed"]),
    notes: z.string().nullable(),
  }),
});
export type RefundSnapshot = {
  id: string;
  payment_id: string;
  amount: number;
  currency: "PHP";
  livemode: false;
  status: "pending" | "processing" | "succeeded" | "failed";
  reference: string | null;
};
function normalize(value: unknown): RefundSnapshot {
  const parsed = resource.safeParse(value);
  if (!parsed.success) throw new ProviderError("provider_invalid");
  const { id, attributes: a } = parsed.data;
  const marker = a.notes?.match(/^rentify-refund:([0-9a-f-]{36})$/)?.[1];
  return {
    id,
    payment_id: a.payment_id,
    amount: a.amount,
    currency: a.currency,
    livemode: a.livemode,
    status: a.status,
    reference: marker && z.uuid().safeParse(marker).success ? marker : null,
  };
}
export interface RefundProvider {
  create(input: {
    id: string;
    payment_id: string;
    amount: number;
  }): Promise<RefundSnapshot>;
  retrieve(id: string): Promise<RefundSnapshot>;
  list(payment: string): Promise<RefundSnapshot[]>;
}
export function paymongoRefundProvider(
  secret: string,
  send: typeof fetch = fetch,
): RefundProvider {
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secret))
    throw new ProviderError("provider_unavailable");
  async function request(
    path: string,
    body?: unknown,
    key?: string,
  ): Promise<unknown> {
    try {
      const response = await send(`https://api.paymongo.com${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new ProviderError("provider_unavailable");
      try {
        return await response.json();
      } catch {
        throw new ProviderError("provider_invalid");
      }
    } catch (error) {
      throw error instanceof ProviderError
        ? error
        : new ProviderError("provider_unavailable");
    }
  }
  async function single(path: string, body?: unknown, key?: string) {
    const value = z
      .object({ data: resource })
      .safeParse(await request(path, body, key));
    if (!value.success) throw new ProviderError("provider_invalid");
    return normalize(value.data.data);
  }
  return {
    async create(input) {
      z.uuid().parse(input.id);
      paymentId.parse(input.payment_id);
      z.number().int().min(100).max(2147483647).parse(input.amount);
      return single(
        "/refunds",
        {
          data: {
            attributes: {
              amount: input.amount,
              payment_id: input.payment_id,
              reason: "others",
              notes: `rentify-refund:${input.id}`,
              metadata: { rentify_refund: input.id },
            },
          },
        },
        `rentify-refund-${input.id}`,
      );
    },
    async retrieve(id) {
      refundId.parse(id);
      return single(`/refunds/${id}`);
    },
    async list(payment) {
      paymentId.parse(payment);
      const all: RefundSnapshot[] = [];
      let after: string | undefined;
      // Bounded pagination keeps the work within its lease. Never treat a truncated
      // list as proof that an ambiguous POST failed or that no other refund exists.
      for (let page = 0; page < 2; page++) {
        const query = new URLSearchParams({
          "data.attributes.payment_id": payment,
          "data.attributes.limit": "100",
        });
        if (after) query.set("data.attributes.after", after);
        const result = z
          .object({ data: z.array(resource).max(100), has_more: z.boolean() })
          .safeParse(await request(`/refunds?${query}`));
        if (!result.success) throw new ProviderError("provider_invalid");
        for (const item of result.data.data) {
          const value = normalize(item);
          if (
            value.payment_id !== payment ||
            all.some((r) => r.id === value.id)
          )
            throw new ProviderError("provider_invalid");
          all.push(value);
        }
        if (!result.data.has_more) return all;
        after = all.at(-1)?.id;
        if (!after) throw new ProviderError("provider_invalid");
      }
      throw new ProviderError("provider_invalid");
    },
  };
}
