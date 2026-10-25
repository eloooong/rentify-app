import { z } from "zod";
import { pageQuery, paginationSchema } from "@/lib/chat/validation";

export const notificationQuery = pageQuery.extend({
  unread: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export const notificationSchema = z
  .object({
    id: z.uuid(),
    user_id: z.uuid(),
    type: z.enum(["chat.message", "booking.requested", "booking.status"]),
    payload: z
      .object({
        booking_id: z.uuid(),
        status: z.string().optional(),
        conversation_id: z.uuid().optional(),
        message_id: z.uuid().optional(),
      })
      .strict(),
    read_at: z.iso.datetime({ offset: true }).nullable(),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export const notificationPage = z
  .object({
    data: z.array(notificationSchema).max(50),
    pagination: paginationSchema,
    unread_count: z.number().int().nonnegative(),
  })
  .strict();
export type Notification = z.infer<typeof notificationSchema>;
