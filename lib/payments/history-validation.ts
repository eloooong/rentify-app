import { z } from "zod";

export const historyQuery = z
  .object({
    type: z.enum(["payment", "refund"]).optional(),
    role: z.enum(["all", "renter", "owner"]).default("all"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "End date must be on or after start date.",
  });

const minorAmount = z.number().int().nonnegative();
export const transactionSchema = z
  .object({
    id: z.string().regex(/^(payment|refund):[a-f0-9-]{36}$/),
    booking_id: z.uuid(),
    listing_id: z.uuid(),
    role: z.enum(["renter", "owner"]),
    type: z.enum(["payment", "refund"]),
    state: z.enum([
      "captured",
      "review",
      "queued",
      "submitting",
      "pending",
      "processing",
      "succeeded",
      "failed",
    ]),
    amount: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    provider: z.enum(["paymongo", "xendit"]),
    test_mode: z.literal(true),
    occurred_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    rental_amount: minorAmount.nullable(),
    deposit_amount: minorAmount.nullable(),
  })
  .strict();
export const historySchema = z
  .object({
    data: z.array(transactionSchema).max(50),
    pagination: z
      .object({
        page: z.number().int().min(1).max(10000),
        pageSize: z.number().int().min(1).max(50),
        total: minorAmount,
      })
      .strict(),
    timezone: z.literal("Asia/Manila"),
  })
  .strict();
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionHistory = z.infer<typeof historySchema>;
