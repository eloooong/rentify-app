import { z } from "zod";

export const reviewId = z.uuid();
export const reviewInput = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z
      .string()
      .default("")
      .transform((value) => value.replace(/^ +| +$/g, ""))
      .refine(
        (value) => Array.from(value).length <= 2000 && !value.includes("\0"),
      ),
  })
  .strict();
export const reviewQuery = z
  .object({
    role: z.enum(["owner", "renter"]).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const reviewSchema = z
  .object({
    id: reviewId,
    author_id: reviewId,
    subject_id: reviewId,
    author_name: z.string(),
    subject_role: z.enum(["owner", "renter"]),
    rating: z.number().int().min(1).max(5),
    comment: z.string(),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export const submittedReview = z
  .object({ data: reviewSchema, replayed: z.boolean() })
  .strict();
export const reviewEligibility = z
  .object({
    booking_id: reviewId,
    can_review: z.boolean(),
    reason: z
      .enum(["already_reviewed", "booking_incomplete", "account_inactive"])
      .nullable(),
    review: reviewSchema.nullable(),
  })
  .strict();
export const reviewPage = z
  .object({
    data: z.array(reviewSchema).max(50),
    pagination: z
      .object({
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    summary: z
      .object({
        count: z.number().int().nonnegative(),
        average: z.number().min(1).max(5).nullable(),
      })
      .strict(),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;
