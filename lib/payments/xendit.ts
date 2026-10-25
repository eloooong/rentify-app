import { z } from "zod";

export class ProviderError extends Error {
  constructor(public code: "provider_unavailable" | "provider_invalid") {
    super("The test payment provider could not be verified.");
  }
}
export const sessionId = z.string().regex(/^ps-[a-f0-9]{24}$/);
export const paymentId = z.string().regex(/^py-[a-f0-9-]{36}$/);
export const requestId = z.string().regex(/^pr-[a-f0-9-]{36}$/);
export const refundId = z.string().regex(/^rfd-[a-f0-9-]{36}$/);
export const testCheckoutUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    ((url.hostname === "checkout-staging.xendit.co" &&
      /^\/sessions\/ps-[a-f0-9]{24}$/.test(url.pathname)) ||
      (url.hostname === "dev.xen.to" &&
        /^\/[A-Za-z0-9_-]+$/.test(url.pathname)))
  );
});
export function minorAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 100_000)
    throw new ProviderError("provider_invalid");
  const [whole, fraction = ""] = String(value).split(".");
  if (!/^\d+$/.test(whole) || fraction.length > 2)
    throw new ProviderError("provider_invalid");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function paymentReturnOrigin(fallback: string) {
  const url = new URL(process.env.XENDIT_RETURN_ORIGIN || fallback);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new ProviderError("provider_unavailable");
  return url.origin;
}
export function xenditRequest(secret: string, send: typeof fetch = fetch) {
  if (!/^xnd_development_[A-Za-z0-9_+/=-]+$/.test(secret))
    throw new ProviderError("provider_unavailable");
  return async (
    path: string,
    body?: unknown,
    key?: string,
  ): Promise<unknown> => {
    try {
      const response = await send(`https://api.xendit.co${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
          "Content-Type": "application/json",
          "api-version": "2024-11-11",
          ...(key ? { "idempotency-key": key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new ProviderError("provider_unavailable");
      return await response.json();
    } catch (error) {
      throw error instanceof ProviderError
        ? error
        : new ProviderError("provider_unavailable");
    }
  };
}
export const paymentResource = z.object({
  payment_id: paymentId,
  payment_request_id: requestId,
  business_id: z.string().min(1),
  status: z.literal("SUCCEEDED"),
  currency: z.literal("PHP"),
  country: z.literal("PH"),
  channel_code: z.literal("GCASH"),
  request_amount: z.number().positive(),
  captures: z
    .array(
      z.object({
        capture_amount: z.number().positive(),
        capture_timestamp: z.iso.datetime({ offset: true }),
      }),
    )
    .length(1),
});
