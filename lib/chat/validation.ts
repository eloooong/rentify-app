import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
export const id = z.uuid();
export const emptyBody = z.object({}).strict();
export const pageQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const messagesQuery = z
  .object({
    before: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict();
export const sendBody = z
  .object({
    client_key: id,
    body: z
      .string()
      .transform((value) => value.replace(/^ +| +$/g, ""))
      .refine(
        (value) => /\S/u.test(value) && Array.from(value).length <= 2000,
        "Use 1–2,000 characters.",
      ),
  })
  .strict();
export const readBody = z.object({ through: id }).strict();
export const messageSchema = z
  .object({
    id,
    conversation_id: id,
    sender_id: id,
    client_key: id,
    body: z.string(),
    read_at: timestamp.nullable(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .strict();
export const conversationSchema = z
  .object({
    id,
    booking_id: id,
    created_at: timestamp,
    updated_at: timestamp,
    unread_count: z.number().int().nonnegative(),
    can_send: z.boolean(),
  })
  .strict();
export const paginationSchema = z
  .object({
    page: z.number().int().min(1).max(10000),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
  })
  .strict();
export const conversationPage = z
  .object({
    data: z.array(conversationSchema).max(50),
    pagination: paginationSchema,
  })
  .strict();
export const messagePage = z
  .object({ data: z.array(messageSchema).max(50), next_before: id.nullable() })
  .strict();
export const sentMessage = z
  .object({ data: messageSchema, replayed: z.boolean() })
  .strict();
export const readResult = z
  .object({ updated: z.number().int().nonnegative() })
  .strict();
export type ChatMessage = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
