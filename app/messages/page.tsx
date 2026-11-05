import type { Metadata } from "next";
import Link from "next/link";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { RefreshOnFocus } from "@/components/chat/refresh-on-focus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { displayStatus, formatManilaTime } from "@/lib/listings/booking-status";
import {
  messagesHref,
  parseMessagesPage,
  unreadBadge,
  unreadLabel,
} from "@/lib/listings/chat";
import {
  listMyConversations,
  type ConversationsPage,
} from "@/lib/listings/conversations";

export const metadata: Metadata = {
  title: "Messages | Rentify",
  robots: { index: false, follow: false },
};

export default async function MessagesPage(props: PageProps<"/messages">) {
  const page = parseMessagesPage(await props.searchParams);
  const user = await requireUser(messagesHref(page));

  let result: ConversationsPage | null = null;
  try {
    result = await listMyConversations(user.id, page);
  } catch {
    result = null;
  }
  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-fg">Messages</h1>
          <p className="mt-1 text-muted-foreground">
            Each conversation belongs to one booking.
          </p>
        </div>
        <RefreshOnFocus />
      </div>

      {!result ? (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface-muted p-6"
        >
          <h2 className="text-lg font-semibold text-fg">
            We couldn&apos;t load your messages
          </h2>
          <p className="mt-1">Please refresh the page in a moment.</p>
        </div>
      ) : result.total === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            No conversations yet
          </h2>
          <p className="mt-1">
            Open a booking and choose to message the other person. Your
            conversation shows up here.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/bookings">Go to your bookings</Link>
          </Button>
        </div>
      ) : result.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted p-6">
          <h2 className="text-lg font-semibold text-fg">
            This page is past your last conversation
          </h2>
          <Button asChild variant="outline" className="mt-4">
            <Link href={messagesHref(1)}>Back to the first page</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {result.items.map(({ conversation, booking }) => {
              const unread = conversation.unread_count;
              const title = booking?.listing?.title ?? "Listing unavailable";
              return (
                <li key={conversation.id}>
                  <Link
                    href={`/messages/${conversation.id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border p-4 hover:border-brand-strong"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span
                        className={
                          unread > 0
                            ? "font-semibold break-words text-fg"
                            : "font-medium break-words text-fg"
                        }
                      >
                        {title}
                      </span>
                      {booking?.counterpart && (
                        <span className="text-sm text-muted-foreground">
                          {booking.role === "owner" ? "Renter" : "Owner"}:{" "}
                          {booking.counterpart}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Last activity{" "}
                        {formatManilaTime(conversation.updated_at)}
                      </span>
                      {booking && (
                        <BookingStatusBadge status={displayStatus(booking)} />
                      )}
                    </span>
                    {unread > 0 && (
                      <Badge className="bg-brand-strong text-white">
                        <span aria-hidden>{unreadBadge(unread)}</span>
                        <span className="sr-only">{unreadLabel(unread)}</span>
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between gap-4"
            >
              {result.page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={messagesHref(result.page - 1)}>Previous</Link>
                </Button>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">
                Page {result.page} of {totalPages}
              </p>
              {result.page < totalPages ? (
                <Button asChild variant="outline">
                  <Link href={messagesHref(result.page + 1)}>Next</Link>
                </Button>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
