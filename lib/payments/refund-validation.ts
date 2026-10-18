import { z } from "zod";
import { bookingSchema } from "@/lib/bookings/validation";

export const paidCancellationInput = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .regex(/^[^\u0000-\u001f\u007f]*$/u),
  })
  .strict();
const amount = z.number().int().nonnegative();
export const refundStatus = z
  .object({
    booking_id: z.uuid(),
    currency: z.literal("PHP"),
    test_mode: z.literal(true),
    can_cancel_paid: z.boolean(),
    refund_due_amount: amount,
    refund_pending_amount: amount,
    refunded_amount: amount,
    review_required: z.boolean(),
    attempts: z.array(
      z
        .object({
          id: z.uuid(),
          amount: amount,
          state: z.enum([
            "queued",
            "submitting",
            "pending",
            "processing",
            "succeeded",
            "failed",
            "review",
          ]),
          created_at: z.iso.datetime({ offset: true }),
          updated_at: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ),
  })
  .strict();
export const paidCancellationStatus = z
  .object({ booking: bookingSchema, refunds: refundStatus })
  .strict();
export type RefundStatus = z.infer<typeof refundStatus>;
