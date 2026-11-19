import type { Notification } from "@/lib/notifications/validation";
import type { BookingProblem } from "./booking-dates";
import { STATUS_LABEL, type BookingStatus } from "./booking-status";
import { parseMessagesPage } from "./chat";

/*
 * Pure helpers for the notification bell and center (A3.2), following Person
 * B's contract (lib/notifications/README.md). The HTTP read model is the source
 * of truth: Realtime events only say "refetch". Marking read is one-way.
 */

export const NOTIFICATIONS_PATH = "/notifications";
export const NOTIFICATIONS_PAGE_SIZE = 20;

export type NotificationView = { page: number; unreadOnly: boolean };

/** Bad or repeated URL values fall back to the first page of everything. */
export function parseNotificationView(
  params: Record<string, string | string[] | undefined>,
): NotificationView {
  return {
    page: parseMessagesPage(params),
    unreadOnly: params.unread === "true",
  };
}

export function notificationsHref({
  page,
  unreadOnly,
}: NotificationView): string {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unread", "true");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${NOTIFICATIONS_PATH}?${query}` : NOTIFICATIONS_PATH;
}

/** The API rejects unknown or repeated parameters, so this is its exact shape. */
export function notificationsApiUrl(
  { page, unreadOnly }: NotificationView,
  pageSize: number = NOTIFICATIONS_PAGE_SIZE,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    unread: String(unreadOnly),
  });
  return `/api/notifications?${params}`;
}

export function notificationReadUrl(id: string): string {
  return `/api/notifications/${id}/read`;
}

/** Where a notification leads. A chat alert with no conversation opens its booking. */
export function notificationHref(
  notification: Pick<Notification, "type" | "payload">,
): string {
  const { booking_id: bookingId, conversation_id: conversationId } =
    notification.payload;
  if (notification.type === "chat.message" && conversationId)
    return `/messages/${conversationId}`;
  return `/bookings/${bookingId}`;
}

/** A status the app can name. Anything newer gets generic wording instead. */
export function notificationStatus(
  notification: Pick<Notification, "type" | "payload">,
): BookingStatus | null {
  const status = notification.payload.status;
  if (notification.type !== "booking.status" || !status) return null;
  return Object.hasOwn(STATUS_LABEL, status) ? (status as BookingStatus) : null;
}

/** Payloads carry only IDs and a status, so the wording can't name a listing. */
export function notificationCopy(
  notification: Pick<Notification, "type" | "payload">,
): { title: string; detail: string } {
  switch (notification.type) {
    case "chat.message":
      return {
        title: "New message",
        detail: "Open the conversation to read it.",
      };
    case "booking.requested":
      return {
        title: "New booking request",
        detail:
          "A renter asked to book one of your listings. Open it to reply.",
      };
    case "booking.status": {
      const status = notificationStatus(notification);
      return {
        title: "Booking update",
        detail: status
          ? `This booking is now ${STATUS_LABEL[status].toLowerCase()}.`
          : "This booking changed. Open it to see the latest.",
      };
    }
  }
}

/** The bell's accessible name, which carries what its badge and marker show. */
export function notificationBellLabel(
  count: number | null,
  degraded: boolean,
): string {
  const base = count ? `Notifications, ${count} unread` : "Notifications";
  return degraded ? `${base}. May be out of date` : base;
}

/** What the bell announces. The first load and a falling count stay silent. */
export function arrivalAnnouncement(
  previous: number | null,
  next: number,
): string | null {
  if (previous === null || next <= previous) return null;
  const added = next - previous;
  return `${added} new ${added === 1 ? "notification" : "notifications"}`;
}

export type NotificationProblem = BookingProblem & {
  kind: "sign_in" | "rate_limited" | "not_found" | "invalid" | "temporary";
  /** Trying again as it is may work. */
  retry: boolean;
};

type ErrorBody = { error?: { code?: unknown } };

/** What to show for a failed request. Status 0 means no response. */
export function notificationProblem(
  status: number,
  body: unknown,
  returnTo: string,
): NotificationProblem {
  const code = (body as ErrorBody | null)?.error?.code;
  if (status === 0)
    return {
      kind: "temporary",
      retry: true,
      message:
        "We couldn't reach Rentify. Check your connection and try again.",
    };
  if (code === "sign_in" || status === 401)
    return {
      kind: "sign_in",
      retry: false,
      message: "Your session ended. Sign in again to continue.",
      action: {
        href: `/login?next=${encodeURIComponent(returnTo)}`,
        label: "Sign in",
      },
    };
  if (code === "rate_limited" || status === 429)
    return {
      kind: "rate_limited",
      retry: true,
      message: "That was a lot of requests. Wait a moment, then try again.",
    };
  if (code === "not_found" || status === 404)
    return {
      kind: "not_found",
      retry: false,
      message: "This notification isn't available any more.",
    };
  if (status >= 400 && status < 500)
    return {
      kind: "invalid",
      retry: false,
      message: "Rentify couldn't accept that. Refresh the page and try again.",
    };
  return {
    kind: "temporary",
    retry: true,
    message:
      "Notifications are having a problem right now. Please try again shortly.",
  };
}

export type NotificationCenterState = {
  /** Which page and filter the rows belong to; null before the first response. */
  viewKey: string | null;
  /** Stays "loading" until the first successful read, even after an error. */
  phase: "loading" | "ready";
  rows: Notification[];
  total: number;
  unreadCount: number;
  /** The latest refetch failed; what's on screen may be behind. */
  problem: NotificationProblem | null;
  /** Rows with a mark-read request in flight. */
  marking: string[];
  /** Why a row couldn't be marked read. */
  readProblems: Record<string, NotificationProblem>;
  /** Reads this page has confirmed. A response that started earlier can't undo them. */
  readAt: Record<string, string>;
  /** A new key replaces the live region's text, so it is read out again. */
  announcement: { key: number; text: string } | null;
};

export const NOTIFICATION_CENTER_START: NotificationCenterState = {
  viewKey: null,
  phase: "loading",
  rows: [],
  total: 0,
  unreadCount: 0,
  problem: null,
  marking: [],
  readProblems: {},
  readAt: {},
  announcement: null,
};

export type NotificationCenterAction =
  | {
      type: "loaded";
      viewKey: string;
      rows: Notification[];
      total: number;
      unreadCount: number;
      /** Read out when the page or filter changed. */
      summary: string;
    }
  | { type: "load_failed"; viewKey: string; problem: NotificationProblem }
  | { type: "marking"; id: string }
  | { type: "marked"; row: Notification }
  | { type: "mark_failed"; id: string; problem: NotificationProblem };

function announce(
  state: NotificationCenterState,
  text: string,
): NotificationCenterState["announcement"] {
  return { key: (state.announcement?.key ?? 0) + 1, text };
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

export function notificationCenterReducer(
  state: NotificationCenterState,
  action: NotificationCenterAction,
): NotificationCenterState {
  switch (action.type) {
    case "loaded": {
      const changedView =
        state.viewKey !== null && state.viewKey !== action.viewKey;
      return {
        ...state,
        viewKey: action.viewKey,
        phase: "ready",
        rows: action.rows.map((row) =>
          !row.read_at && state.readAt[row.id]
            ? { ...row, read_at: state.readAt[row.id] }
            : row,
        ),
        total: action.total,
        unreadCount: action.unreadCount,
        problem: null,
        announcement: changedView
          ? announce(state, action.summary)
          : state.announcement,
      };
    }
    case "load_failed": {
      // Rows from another page or filter would be wrong here, not just late.
      const sameView = state.viewKey === action.viewKey;
      return {
        ...state,
        viewKey: action.viewKey,
        phase: sameView ? state.phase : "loading",
        rows: sameView ? state.rows : [],
        total: sameView ? state.total : 0,
        problem: action.problem,
      };
    }
    case "marking":
      return {
        ...state,
        marking: [...state.marking, action.id],
        readProblems: without(state.readProblems, action.id),
      };
    case "marked": {
      const wasUnread = state.rows.some(
        (row) => row.id === action.row.id && !row.read_at,
      );
      return {
        ...state,
        rows: state.rows.map((row) =>
          row.id === action.row.id ? action.row : row,
        ),
        unreadCount: wasUnread
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
        marking: state.marking.filter((id) => id !== action.row.id),
        readAt: action.row.read_at
          ? { ...state.readAt, [action.row.id]: action.row.read_at }
          : state.readAt,
        announcement: announce(state, "Marked as read."),
      };
    }
    case "mark_failed":
      return {
        ...state,
        marking: state.marking.filter((id) => id !== action.id),
        readProblems: { ...state.readProblems, [action.id]: action.problem },
        announcement: announce(
          state,
          `Couldn't mark this as read. ${action.problem.message}`,
        ),
      };
  }
}

/** A row read just now leaves the unread filter straight away. */
export function visibleNotifications(
  rows: Notification[],
  unreadOnly: boolean,
): Notification[] {
  return unreadOnly ? rows.filter((row) => !row.read_at) : rows;
}

/**
 * Where focus goes after "Mark as read" removes the button that had it: the
 * row's own link, or if the filter drops the row, its neighbour. Null means no
 * rows are left, so the page heading takes focus.
 */
export function focusAfterRead(
  rows: Notification[],
  id: string,
  unreadOnly: boolean,
): string | null {
  if (!unreadOnly) return id;
  const remaining = visibleNotifications(rows, true);
  const index = remaining.findIndex((row) => row.id === id);
  if (index === -1) return null;
  return remaining[index + 1]?.id ?? remaining[index - 1]?.id ?? null;
}

export function notificationTotalPages(
  total: number,
  pageSize: number = NOTIFICATIONS_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Read out after moving to another page or filter. */
export function viewSummary(view: NotificationView, total: number): string {
  const kind = view.unreadOnly ? "unread notifications" : "all notifications";
  if (total === 0)
    return `No ${view.unreadOnly ? "unread " : ""}notifications.`;
  return `Showing ${kind}, page ${view.page} of ${notificationTotalPages(total)}.`;
}

export type RefetchGate = { running: boolean; again: boolean };

/** One per view: the bell and the center each run their own requests. */
export function newRefetchGate(): RefetchGate {
  return { running: false, again: false };
}

/**
 * Runs one request at a time, plus one more if anything asked while it ran, so
 * a burst of hints can't let an older response overwrite a newer one.
 */
export async function runSerially(
  gate: RefetchGate,
  run: () => Promise<void>,
): Promise<void> {
  if (gate.running) {
    gate.again = true;
    return;
  }
  gate.running = true;
  try {
    do {
      gate.again = false;
      await run();
    } while (gate.again);
  } finally {
    gate.running = false;
  }
}
