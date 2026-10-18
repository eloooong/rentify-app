import { z } from "zod";

export class ProviderError extends Error {
  constructor(public code: "provider_unavailable" | "provider_invalid") {
    super("The test payment provider could not be verified.");
  }
}
const sessionId = z.string().regex(/^cs_[A-Za-z0-9]+$/);
const checkoutUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "checkout.paymongo.com" &&
    !url.port &&
    !url.username &&
    !url.password &&
    url.pathname !== "/"
  );
});
const payment = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  attributes: z.object({
    status: z.string(),
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    livemode: z.literal(false),
    paid_at: z
      .number()
      .int()
      .positive()
      .max(8_000_000_000)
      .nullable()
      .optional(),
    source: z.object({ type: z.string() }).nullable(),
  }),
});
const session = z.object({
  data: z.object({
    id: sessionId,
    type: z.literal("checkout_session"),
    attributes: z.object({
      livemode: z.literal(false),
      reference_number: z.uuid(),
      checkout_url: checkoutUrl.nullable(),
      status: z.enum(["active", "expired"]),
      payments: z.array(payment),
    }),
  }),
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
export function normalizeSession(value: unknown): Snapshot {
  const parsed = session.safeParse(value);
  if (!parsed.success) throw new ProviderError("provider_invalid");
  const resource = parsed.data.data;
  const paid = resource.attributes.payments.filter(
    (row) => row.attributes.status === "paid",
  );
  if (
    paid.length > 1 ||
    paid.some((row) => !row.attributes.paid_at || !row.attributes.source) ||
    (resource.attributes.status === "active" &&
      !resource.attributes.checkout_url)
  )
    throw new ProviderError("provider_invalid");
  return {
    session_id: resource.id,
    reference: resource.attributes.reference_number,
    checkout_url: resource.attributes.checkout_url,
    status: resource.attributes.status,
    livemode: false,
    payments: paid.map((row) => ({
      id: row.id,
      amount: row.attributes.amount,
      currency: row.attributes.currency,
      method: row.attributes.source!.type,
      paid_at: new Date(row.attributes.paid_at! * 1000).toISOString(),
    })),
  };
}
export type CheckoutInput = {
  id: string;
  rental_amount: number;
  deposit_amount: number;
};
export interface PaymentProvider {
  create(input: CheckoutInput, origin: string): Promise<Snapshot>;
  retrieve(id: string): Promise<Snapshot>;
  expire(id: string): Promise<void>;
}
export function paymongoProvider(
  secret: string,
  send: typeof fetch = fetch,
): PaymentProvider {
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secret))
    throw new ProviderError("provider_unavailable");
  async function request(path: string, body?: unknown, key?: string) {
    let response: Response;
    try {
      response = await send(`https://api.paymongo.com${path}`, {
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
    } catch {
      throw new ProviderError("provider_unavailable");
    }
    if (!response.ok) throw new ProviderError("provider_unavailable");
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ProviderError("provider_invalid");
    }
  }
  return {
    async create(input, origin) {
      const items = [
        {
          name: "Demo rental",
          amount: input.rental_amount,
          currency: "PHP",
          quantity: 1,
        },
      ];
      if (input.deposit_amount > 0)
        items.push({
          name: "Refundable demo deposit",
          amount: input.deposit_amount,
          currency: "PHP",
          quantity: 1,
        });
      return normalizeSession(
        await request(
          "/v2/checkout_sessions",
          {
            data: {
              attributes: {
                line_items: items,
                payment_method_types: ["gcash"],
                reference_number: input.id,
                success_url: `${origin}/account`,
                cancel_url: `${origin}/account`,
                send_email_receipt: false,
                pass_on_fees: false,
                metadata: {
                  rentify_attempt: input.id,
                  policy: "demo-payments-v1",
                },
              },
            },
          },
          `rentify-checkout-${input.id}`,
        ),
      );
    },
    async retrieve(id) {
      sessionId.parse(id);
      return normalizeSession(await request(`/v1/checkout_sessions/${id}`));
    },
    async expire(id) {
      sessionId.parse(id);
      await request(`/v1/checkout_sessions/${id}/expire`, {});
    },
  };
}
