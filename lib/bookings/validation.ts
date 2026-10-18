import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";

export const bookingId = z.uuid();
const date = z.iso.date();
export const bookingStatuses = Constants.public.Enums.booking_status;
export const requestSchema = z
  .object({
    listing_id: bookingId,
    pickup_date: date,
    return_date: date,
    request_key: bookingId,
  })
  .strict()
  .refine((value) => value.return_date >= value.pickup_date, {
    path: ["return_date"],
    message: "Return date must be on or after pickup.",
  })
  .refine(
    (value) =>
      (Date.parse(value.return_date) - Date.parse(value.pickup_date)) /
        86_400_000 <
      30,
    {
      path: ["return_date"],
      message: "Choose at most 30 rental days.",
    },
  );

const reason = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .regex(/^[^\u0000-\u001f\u007f]*$/u);
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }).strict(),
  z.object({ action: z.literal("decline"), reason }).strict(),
  z.object({ action: z.literal("cancel"), reason }).strict(),
]);
export const listSchema = z
  .object({
    role: z.enum(["all", "owner", "renter"]).default("all"),
    status: z.enum(bookingStatuses).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const availabilityQuerySchema = z
  .object({
    listingId: bookingId,
    from: date,
    to: date,
  })
  .strict()
  .refine(
    (value) =>
      value.to >= value.from &&
      (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 < 120,
    {
      path: ["to"],
      message: "Choose a valid window of at most 120 days.",
    },
  );

const timestamp = z.iso.datetime({ offset: true });
export const bookingSchema = z
  .object({
    id: bookingId,
    listing_id: bookingId,
    owner_id: bookingId,
    renter_id: bookingId,
    pickup_date: date,
    return_date: date,
    rental_days: z.number().int().min(1).max(30),
    daily_price_amount: z.number().int().positive().nullable(),
    rental_amount: z.number().int().nonnegative(),
    deposit_amount: z.number().int().nonnegative(),
    total_amount: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(bookingStatuses),
    policy_version: z.string().nullable(),
    request_expires_at: timestamp.nullable(),
    payment_expires_at: timestamp.nullable(),
    accepted_at: timestamp.nullable(),
    closed_by: bookingId.nullable(),
    status_reason: z.string().nullable(),
    is_expired: z.boolean(),
    allowed_actions: z.array(z.enum(["accept", "decline", "cancel"])),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .strict();
export const bookingPageSchema = z
  .object({
    data: z.array(bookingSchema),
    pagination: z
      .object({
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export const availabilitySchema = z
  .object({
    listing_id: bookingId,
    from: date,
    to: date,
    timezone: z.literal("Asia/Manila"),
    earliest_pickup_date: date,
    latest_pickup_date: date,
    max_rental_days: z.literal(30),
    device_available: z.boolean(),
    blocked_ranges: z.array(z.object({ from: date, to: date }).strict()),
  })
  .strict();
export type Booking = z.infer<typeof bookingSchema>;
export type BookingPage = z.infer<typeof bookingPageSchema>;
export type BookingAvailability = z.infer<typeof availabilitySchema>;
