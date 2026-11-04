import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { ChatThread } from "@/components/chat/chat-thread";
import { requireUser } from "@/lib/auth/session";
import { displayStatus } from "@/lib/listings/booking-status";
import { closedBookingNote } from "@/lib/listings/chat";
import { getMyConversation } from "@/lib/listings/conversations";

export const metadata: Metadata = {
  title: "Conversation | Rentify",
  robots: { index: false, follow: false },
};

export default async function ConversationPage(
  props: PageProps<"/messages/[id]">,
) {
  const { id } = await props.params;
  const user = await requireUser(`/messages/${id}`);
  const thread = await getMyConversation(user.id, id);
  if (!thread) notFound();

  const { conversation, booking } = thread;
  const counterpart =
    booking?.counterpart ??
    (booking?.role === "owner" ? "the renter" : "the other person");
  const status = booking && displayStatus(booking);

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/messages"
          className="text-muted-foreground hover:text-brand-strong hover:underline"
        >
          ← Messages
        </Link>
      </nav>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold break-words text-fg sm:text-3xl">
            {booking?.listing?.title ?? "Conversation"}
          </h1>
          {status && <BookingStatusBadge status={status} />}
        </div>
        <p className="text-sm text-muted-foreground">With {counterpart}</p>
        <Link
          href={`/bookings/${conversation.booking_id}`}
          className="w-fit text-sm font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
        >
          View booking
        </Link>
      </div>

      <ChatThread
        key={conversation.id}
        conversationId={conversation.id}
        viewerId={user.id}
        counterpart={counterpart}
        canSend={conversation.can_send}
        note={status ? closedBookingNote(status) : null}
      />
    </div>
  );
}
