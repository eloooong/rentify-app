"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type MouseEvent,
} from "react";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { Button } from "@/components/ui/button";
import { formatManilaTime } from "@/lib/listings/booking-status";
import {
  NOTIFICATION_CENTER_START,
  focusAfterRead,
  newRefetchGate,
  notificationCenterReducer,
  notificationCopy,
  notificationHref,
  notificationStatus,
  notificationTotalPages,
  notificationsHref,
  runSerially,
  viewSummary,
  visibleNotifications,
  type NotificationView,
} from "@/lib/listings/notifications";
import type { Notification } from "@/lib/notifications/validation";
import {
  announceNotificationsChanged,
  fetchNotifications,
  markNotificationRead,
} from "./notifications-api";
import { useNotificationChannel } from "./use-notification-channel";

const linkId = (id: string) => `notification-${id}`;

/**
 * The notification list: one page and filter from the URL, marking read, and
 * polite announcements. Every view of the rows comes from the HTTP read model;
 * the page's Realtime channel only asks for a refetch.
 */
export function NotificationCenter({
  userId,
  view,
}: {
  userId: string;
  view: NotificationView;
}) {
  const returnTo = notificationsHref(view);
  const viewKey = returnTo;
  const [reduced, dispatch] = useReducer(
    notificationCenterReducer,
    NOTIFICATION_CENTER_START,
  );
  // Rows from the previous page or filter never show under the new one's URL.
  const state =
    reduced.viewKey === null || reduced.viewKey === viewKey
      ? reduced
      : {
          ...NOTIFICATION_CENTER_START,
          readAt: reduced.readAt,
          announcement: reduced.announcement,
        };

  const latestView = useRef({ view, viewKey, returnTo });
  useEffect(() => {
    latestView.current = { view, viewKey, returnTo };
  }, [returnTo, view, viewKey]);

  const gate = useRef(newRefetchGate());
  const refetch = useCallback(
    () =>
      runSerially(gate.current, async () => {
        const asked = latestView.current;
        const result = await fetchNotifications(asked.view, asked.returnTo);
        if (result.ok)
          dispatch({
            type: "loaded",
            viewKey: asked.viewKey,
            rows: result.rows,
            total: result.total,
            unreadCount: result.unreadCount,
            summary: viewSummary(asked.view, result.total),
          });
        else
          dispatch({
            type: "load_failed",
            viewKey: asked.viewKey,
            problem: result.problem,
          });
      }),
    [],
  );

  const { status: live, reconnect } = useNotificationChannel(userId, refetch);

  // A new page or filter comes from the URL, so it needs its own read.
  const firstView = useRef(viewKey);
  useEffect(() => {
    if (firstView.current === viewKey) return;
    firstView.current = viewKey;
    void refetch();
  }, [refetch, viewKey]);

  const rows = visibleNotifications(state.rows, view.unreadOnly);

  // "Mark as read" removes the button that has focus, so focus moves here once
  // the row has updated. `undefined` means nothing is waiting to move.
  const heading = useRef<HTMLHeadingElement>(null);
  const moveFocusTo = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const target = moveFocusTo.current;
    if (target === undefined) return;
    moveFocusTo.current = undefined;
    const row = target ? document.getElementById(linkId(target)) : null;
    (row ?? heading.current)?.focus();
  }, [state.rows]);

  async function markRead(id: string, beforeUpdate?: () => void) {
    dispatch({ type: "marking", id });
    const result = await markNotificationRead(id, latestView.current.returnTo);
    if (result.ok) {
      beforeUpdate?.();
      dispatch({ type: "marked", row: result.row });
    } else dispatch({ type: "mark_failed", id, problem: result.problem });
    // The list and the bell re-read even after a failure: a row that's gone
    // should leave the list.
    announceNotificationsChanged();
    void refetch();
  }

  function onMarkClick(event: MouseEvent<HTMLElement>, id: string) {
    const button = event.currentTarget;
    const target = focusAfterRead(rows, id, view.unreadOnly);
    void markRead(id, () => {
      // Someone who has moved on while this ran keeps their place.
      if (document.activeElement === button) moveFocusTo.current = target;
    });
  }

  function onOpen(row: Notification) {
    // Navigation doesn't wait for this. If it fails the row stays unread, which
    // is the truth, and the next read shows it.
    if (!row.read_at && !state.marking.includes(row.id)) void markRead(row.id);
  }

  const totalPages = notificationTotalPages(state.total);
  const problem = state.problem;

  return (
    <>
      <div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-3xl font-semibold text-fg focus:outline-none"
        >
          Notifications
        </h1>
        <p className="mt-1 text-muted-foreground">
          {state.phase === "ready"
            ? state.unreadCount > 0
              ? `${state.unreadCount} unread`
              : "Nothing unread"
            : "Booking requests, status changes and new messages."}
        </p>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement && (
          <p key={state.announcement.key}>{state.announcement.text}</p>
        )}
      </div>

      <nav aria-label="Filter notifications" className="flex gap-2">
        <FilterLink
          href={notificationsHref({ page: 1, unreadOnly: false })}
          current={!view.unreadOnly}
        >
          All
        </FilterLink>
        <FilterLink
          href={notificationsHref({ page: 1, unreadOnly: true })}
          current={view.unreadOnly}
        >
          Unread
        </FilterLink>
      </nav>

      {live === "degraded" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm"
        >
          <p className="min-w-0 flex-1 basis-60">
            Live updates are off, so new notifications may arrive late.
            We&apos;ll keep checking every 30 seconds.
          </p>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              reconnect();
              void refetch();
            }}
          >
            Reconnect
          </Button>
        </div>
      )}

      {problem && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm"
        >
          <p className="min-w-0 flex-1 basis-60">
            {state.phase === "ready"
              ? "This list may be out of date. "
              : "We couldn't load your notifications. "}
            {problem.message}
          </p>
          {problem.action ? (
            <Button asChild variant="outline" size="lg">
              <Link href={problem.action.href}>{problem.action.label}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {state.phase === "loading" ? (
        !problem && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading notifications…
          </p>
        )
      ) : rows.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <NotificationRow
              key={row.id}
              row={row}
              marking={state.marking.includes(row.id)}
              problem={state.readProblems[row.id]?.message}
              onOpen={() => onOpen(row)}
              onMark={(event) => onMarkClick(event, row.id)}
            />
          ))}
        </ul>
      ) : state.total > 0 && view.page > 1 ? (
        <EmptyState
          title="This page is past your last notification"
          action={{
            href: notificationsHref({ ...view, page: 1 }),
            label: "Back to the first page",
          }}
        />
      ) : view.unreadOnly ? (
        <EmptyState
          title="You're all caught up"
          action={{
            href: notificationsHref({ page: 1, unreadOnly: false }),
            label: "See all notifications",
          }}
        />
      ) : (
        <EmptyState
          title="No notifications yet"
          body="Booking requests, status changes and new messages show up here."
        />
      )}

      {state.phase === "ready" && totalPages > 1 && rows.length > 0 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-4"
        >
          {view.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={notificationsHref({ ...view, page: view.page - 1 })}>
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <p className="text-sm text-muted-foreground">
            Page {view.page} of {totalPages}
          </p>
          {view.page < totalPages ? (
            <Button asChild variant="outline">
              <Link href={notificationsHref({ ...view, page: view.page + 1 })}>
                Next
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

function FilterLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      asChild
      size="lg"
      variant={current ? "default" : "outline"}
      className="min-h-11"
    >
      <Link href={href} aria-current={current ? "true" : undefined}>
        {children}
      </Link>
    </Button>
  );
}

function NotificationRow({
  row,
  marking,
  problem,
  onOpen,
  onMark,
}: {
  row: Notification;
  marking: boolean;
  problem?: string;
  onOpen: () => void;
  onMark: (event: MouseEvent<HTMLElement>) => void;
}) {
  const unread = !row.read_at;
  const { title, detail } = notificationCopy(row);
  const status = notificationStatus(row);
  const time = formatManilaTime(row.created_at);

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between ${
        unread ? "border-brand-strong bg-surface-tint" : "border-border"
      }`}
    >
      <Link
        id={linkId(row.id)}
        href={notificationHref(row)}
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm"
      >
        <span
          className={
            unread
              ? "font-semibold break-words text-fg"
              : "font-medium break-words text-fg"
          }
        >
          {unread && <span className="sr-only">Unread: </span>}
          {title}
        </span>
        <span className="text-sm">{detail}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
        {status && (
          <span>
            <BookingStatusBadge status={status} />
          </span>
        )}
      </Link>
      {unread && (
        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <Button
            variant="outline"
            size="lg"
            className="min-h-11"
            aria-busy={marking}
            aria-label={`Mark as read: ${title}, ${time}`}
            onClick={(event) => {
              if (!marking) onMark(event);
            }}
          >
            {marking ? "Marking…" : "Mark as read"}
          </Button>
          {problem && <p className="text-xs text-destructive">{problem}</p>}
        </div>
      )}
    </li>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-6">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {body && <p className="mt-1">{body}</p>}
      {action && (
        <Button asChild variant="outline" className="mt-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
