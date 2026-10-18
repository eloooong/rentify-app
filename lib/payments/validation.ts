import { z } from "zod";
export const policyVersion = "demo-payments-v1";
export const checkoutInput = z
  .object({ policy_version: z.literal(policyVersion) })
  .strict();
export const checkoutStatus = z
  .object({
    id: z.uuid(),
    booking_id: z.uuid(),
    state: z.enum([
      "creating",
      "open",
      "paid",
      "expired",
      "refund_due",
      "review",
    ]),
    rental_amount: z.number().int().positive(),
    deposit_amount: z.number().int().nonnegative(),
    total_amount: z.number().int().positive(),
    currency: z.literal("PHP"),
    method: z.literal("gcash"),
    test_mode: z.literal(true),
    policy_version: z.literal(policyVersion),
    expires_at: z.iso.datetime({ offset: true }),
    consented_at: z.iso.datetime({ offset: true }),
    checkout_url: z.url().nullable(),
    refund_due_amount: z.number().int().nonnegative(),
  })
  .strict();
export type CheckoutStatus = z.infer<typeof checkoutStatus>;
