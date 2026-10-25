import { z } from "zod";
import {
  minorAmount,
  paymentId,
  paymentResource,
  ProviderError,
  refundId,
  requestId,
  xenditRequest,
} from "./xendit";
const resource = z.object({
  id: refundId,
  payment_request_id: requestId,
  amount: z.number().positive(),
  currency: z.literal("PHP"),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  reference_id: z.string().nullable(),
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
export interface RefundProvider {
  create(input: {
    id: string;
    payment_id: string;
    amount: number;
  }): Promise<RefundSnapshot>;
  retrieve(id: string, payment: string): Promise<RefundSnapshot>;
  list(payment: string): Promise<RefundSnapshot[]>;
}
export function xenditRefundProvider(
  secret: string,
  send: typeof fetch = fetch,
): RefundProvider {
  const request = xenditRequest(secret, send);
  async function target(id: string) {
    paymentId.parse(id);
    const value = paymentResource.safeParse(
      await request(`/v3/payments/${id}`),
    );
    if (!value.success || value.data.payment_id !== id)
      throw new ProviderError("provider_invalid");
    return value.data;
  }
  function normalize(
    value: unknown,
    payment: string,
    paymentRequest: string,
  ): RefundSnapshot {
    const parsed = resource.safeParse(value);
    if (!parsed.success || parsed.data.payment_request_id !== paymentRequest)
      throw new ProviderError("provider_invalid");
    const r = parsed.data;
    return {
      id: r.id,
      payment_id: payment,
      amount: minorAmount(r.amount),
      currency: "PHP",
      livemode: false,
      status:
        r.status === "SUCCEEDED"
          ? "succeeded"
          : r.status === "FAILED"
            ? "failed"
            : "pending",
      reference:
        r.reference_id && z.uuid().safeParse(r.reference_id).success
          ? r.reference_id
          : null,
    };
  }
  return {
    async create(input) {
      z.uuid().parse(input.id);
      z.number().int().min(100).max(10_000_000).parse(input.amount);
      const payment = await target(input.payment_id);
      if (input.amount > minorAmount(payment.captures[0].capture_amount))
        throw new ProviderError("provider_invalid");
      return normalize(
        await request(
          "/refunds",
          {
            reference_id: input.id,
            payment_request_id: payment.payment_request_id,
            currency: "PHP",
            amount: input.amount / 100,
            reason: "CANCELLATION",
          },
          `rentify-refund-${input.id}`,
        ),
        input.payment_id,
        payment.payment_request_id,
      );
    },
    async retrieve(id, payment) {
      refundId.parse(id);
      const p = await target(payment);
      return normalize(
        await request(`/refunds/${id}`),
        payment,
        p.payment_request_id,
      );
    },
    async list(payment) {
      const p = await target(payment);
      const all: RefundSnapshot[] = [];
      let after: string | undefined;
      for (let page = 0; page < 2; page++) {
        const query = new URLSearchParams({
          payment_request_id: p.payment_request_id,
          limit: "100",
        });
        if (after) query.set("after_id", after);
        const result = z
          .object({ data: z.array(resource).max(100), has_more: z.boolean() })
          .safeParse(await request(`/refunds?${query}`));
        if (!result.success) throw new ProviderError("provider_invalid");
        for (const item of result.data.data) {
          const value = normalize(item, payment, p.payment_request_id);
          if (all.some((r) => r.id === value.id))
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
