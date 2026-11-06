import { z } from "zod";
import { bookingId, bookingStatuses } from "@/lib/bookings/validation";

export const stageSchema = z.enum(["handover", "return"]);
export const sideSchema = z.enum(["owner", "renter"]);
export const checklistId = bookingId;

export const checklistItems = [
  ["device_checked", "I checked the device and its accessories."],
  [
    "condition_recorded",
    "I checked the visible condition and recorded any issues.",
  ],
  ["physical_transfer", "I confirm the device physically changed hands."],
] as const;

export const confirmationSchema = z.strictObject({
  checks: z.strictObject({
    device_checked: z.literal(true),
    condition_recorded: z.literal(true),
    physical_transfer: z.literal(true),
  }),
  note: z
    .string()
    .default("")
    .transform((value) => value.replace(/^ +| +$/g, ""))
    .refine(
      (value) => Array.from(value).length <= 1000 && !value.includes("\0"),
    ),
});

const timestamp = z.iso.datetime({ offset: true }).nullable();
export const checklistSchema = z.strictObject({
  booking_id: bookingId,
  booking_status: z.enum(bookingStatuses),
  stage: stageSchema,
  role: sideSchema,
  can_confirm: z.boolean(),
  owner_confirmed_at: timestamp,
  renter_confirmed_at: timestamp,
  owner_note: z.string().nullable(),
  renter_note: z.string().nullable(),
  owner_photo: z.boolean(),
  renter_photo: z.boolean(),
});

export type Checklist = z.infer<typeof checklistSchema>;
