import { apiRequest } from "@/components/listings/api-request";
import {
  notificationPage,
  notificationSchema,
  type Notification,
} from "@/lib/notifications/validation";
import {
  notificationProblem,
  notificationReadUrl,
  notificationsApiUrl,
  type NotificationProblem,
  type NotificationView,
} from "@/lib/listings/notifications";

/** A stalled connection counts as a failed request, so a refetch can't block later ones. */
const REQUEST_TIMEOUT_MS = 20_000;

function timedRequest(method: string, url: string, body?: unknown) {
  return Promise.race([
    apiRequest(method, url, body),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT_MS),
    ),
  ]);
}

export type NotificationPageResult =
  | { ok: true; rows: Notification[]; total: number; unreadCount: number }
  | { ok: false; problem: NotificationProblem };

export async function fetchNotifications(
  view: NotificationView,
  returnTo: string,
  pageSize?: number,
): Promise<NotificationPageResult> {
  try {
    const result = await timedRequest(
      "GET",
      notificationsApiUrl(view, pageSize),
    );
    if (!result.ok)
      return {
        ok: false,
        problem: notificationProblem(result.status, result.json, returnTo),
      };
    const page = notificationPage.safeParse(result.json);
    if (!page.success)
      return { ok: false, problem: notificationProblem(503, null, returnTo) };
    return {
      ok: true,
      rows: page.data.data,
      total: page.data.pagination.total,
      unreadCount: page.data.unread_count,
    };
  } catch {
    return { ok: false, problem: notificationProblem(0, null, returnTo) };
  }
}

export type NotificationReadResult =
  { ok: true; row: Notification } | { ok: false; problem: NotificationProblem };

export async function markNotificationRead(
  id: string,
  returnTo: string,
): Promise<NotificationReadResult> {
  try {
    const result = await timedRequest("POST", notificationReadUrl(id), {});
    if (!result.ok)
      return {
        ok: false,
        problem: notificationProblem(result.status, result.json, returnTo),
      };
    const read = notificationSchema.safeParse(result.json?.data);
    if (!read.success)
      return { ok: false, problem: notificationProblem(503, null, returnTo) };
    return { ok: true, row: read.data };
  } catch {
    return { ok: false, problem: notificationProblem(0, null, returnTo) };
  }
}

const CHANGED_EVENT = "rentify:notifications-changed";

/** Tells the bell a read just landed, so its count updates even without Realtime. */
export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function onNotificationsChanged(listener: () => void) {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}
