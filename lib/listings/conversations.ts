import "server-only";
import { bookingSchema } from "@/lib/bookings/validation";
import {
  conversationPage,
  conversationSchema,
  id as chatId,
  type Conversation,
} from "@/lib/chat/validation";
import { createClient } from "@/lib/supabase/server";
import { withDetails, type DashboardBooking } from "./bookings";
import { CONVERSATIONS_PAGE_SIZE } from "./chat";

/*
 * Server-side reads for the chat screens (A3.1). They call the same
 * authenticated RPCs as Person B's /api/conversations handlers
 * (lib/chat/README.md) with the request's cookie client. Messages load in the
 * browser, after the Realtime listeners are registered.
 */

export type ConversationView = {
  conversation: Conversation;
  /** Null when the booking couldn't be read; the chat itself still works. */
  booking: DashboardBooking | null;
};

export type ConversationsPage = {
  items: ConversationView[];
  page: number;
  pageSize: number;
  total: number;
};

type Client = Awaited<ReturnType<typeof createClient>>;

async function bookingViews(
  client: Client,
  userId: string,
  conversations: Conversation[],
): Promise<ConversationView[]> {
  const rows = await Promise.all(
    conversations.map(async ({ booking_id }) => {
      const { data, error } = await client.rpc("get_booking", {
        p_booking: booking_id,
      });
      const booking = error ? null : bookingSchema.safeParse(data);
      return booking?.success ? booking.data : null;
    }),
  );
  const detailed = await withDetails(
    client,
    userId,
    rows.filter((row) => row !== null),
  ).catch(() => []);
  const byId = new Map(detailed.map((booking) => [booking.id, booking]));
  return conversations.map((conversation) => ({
    conversation,
    booking: byId.get(conversation.booking_id) ?? null,
  }));
}

/** The signed-in user's conversations, most recently active first. */
export async function listMyConversations(
  userId: string,
  page: number,
): Promise<ConversationsPage> {
  const client = await createClient();
  const { data, error } = await client.rpc("list_my_conversations", {
    p_page: page,
    p_page_size: CONVERSATIONS_PAGE_SIZE,
  });
  if (error) throw new Error("Unable to load your conversations.");
  const result = conversationPage.safeParse(data);
  if (!result.success) throw new Error("Unexpected conversations response.");
  return {
    items: await bookingViews(client, userId, result.data.data),
    page: result.data.pagination.page,
    pageSize: result.data.pagination.pageSize,
    total: result.data.pagination.total,
  };
}

/**
 * One conversation the user takes part in, or null (missing or not theirs).
 * The contract has no read for a single conversation, so RLS gives the
 * booking and B's idempotent open_booking_chat gives the read model.
 */
export async function getMyConversation(
  userId: string,
  id: string,
): Promise<ConversationView | null> {
  if (!chatId.safeParse(id).success) return null;
  const client = await createClient();
  const row = await client
    .from("conversations")
    .select("booking_id")
    .eq("id", id)
    .maybeSingle();
  if (row.error) throw new Error("Unable to load the conversation.");
  if (!row.data) return null;
  const { data, error } = await client.rpc("open_booking_chat", {
    p_booking: row.data.booking_id,
  });
  if (error?.message === "not_found") return null;
  if (error) throw new Error("Unable to load the conversation.");
  const conversation = conversationSchema.safeParse(data);
  if (!conversation.success)
    throw new Error("Unexpected conversation response.");
  const [view] = await bookingViews(client, userId, [conversation.data]);
  return view;
}
