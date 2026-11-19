import { describe, expect, it } from "vitest";
import {
  notificationPage,
  notificationQuery,
  type Notification,
} from "@/lib/notifications/validation";
import {
  NOTIFICATION_CENTER_START,
  arrivalAnnouncement,
  focusAfterRead,
  newRefetchGate,
  notificationBellLabel,
  notificationCenterReducer,
  notificationCopy,
  notificationHref,
  notificationProblem,
  notificationReadUrl,
  notificationStatus,
  notificationTotalPages,
  notificationsApiUrl,
  notificationsHref,
  parseNotificationView,
  runSerially,
  viewSummary,
  visibleNotifications,
  type NotificationCenterState,
} from "./notifications";

const USER = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-11-05T02:00:00.000000+00:00";
const LATER = "2026-11-05T03:00:00.000000+00:00";

function row(id: string, overrides: Partial<Notification> = {}): Notification {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${id.padStart(12, "0")}`,
    user_id: USER,
    type: "booking.status",
    payload: { booking_id: BOOKING, status: "accepted" },
    read_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function loaded(
  state: NotificationCenterState,
  rows: Notification[],
  viewKey = "all:1",
  unreadCount = rows.filter((item) => !item.read_at).length,
) {
  return notificationCenterReducer(state, {
    type: "loaded",
    viewKey,
    rows,
    total: rows.length,
    unreadCount,
    summary: "Showing all notifications, page 1 of 1.",
  });
}

describe("notification links", () => {
  it("sends a chat alert to its conversation", () => {
    expect(
      notificationHref({
        type: "chat.message",
        payload: {
          booking_id: BOOKING,
          conversation_id: CONVERSATION,
          message_id: MESSAGE,
        },
      }),
    ).toBe(`/messages/${CONVERSATION}`);
  });

  it("sends a chat alert with no conversation to its booking", () => {
    expect(
      notificationHref({
        type: "chat.message",
        payload: { booking_id: BOOKING },
      }),
    ).toBe(`/bookings/${BOOKING}`);
  });

  it.each(["booking.requested", "booking.status"] as const)(
    "sends %s to the booking",
    (type) => {
      expect(
        notificationHref({
          type,
          payload: { booking_id: BOOKING, status: "requested" },
        }),
      ).toBe(`/bookings/${BOOKING}`);
    },
  );

  it("ignores a conversation on a booking alert", () => {
    expect(
      notificationHref({
        type: "booking.status",
        payload: { booking_id: BOOKING, conversation_id: CONVERSATION },
      }),
    ).toBe(`/bookings/${BOOKING}`);
  });
});

describe("notification wording", () => {
  it("names each type without inventing listing details", () => {
    expect(
      notificationCopy({
        type: "chat.message",
        payload: { booking_id: BOOKING },
      }).title,
    ).toBe("New message");
    expect(
      notificationCopy({
        type: "booking.requested",
        payload: { booking_id: BOOKING, status: "requested" },
      }).title,
    ).toBe("New booking request");
  });

  it("uses the app's own status label", () => {
    expect(
      notificationCopy({
        type: "booking.status",
        payload: { booking_id: BOOKING, status: "handed_over" },
      }).detail,
    ).toBe("This booking is now picked up.");
  });

  it("stays generic for a status it doesn't know", () => {
    const unknown = {
      type: "booking.status" as const,
      payload: { booking_id: BOOKING, status: "constructor" },
    };
    expect(notificationStatus(unknown)).toBeNull();
    expect(notificationCopy(unknown).detail).toBe(
      "This booking changed. Open it to see the latest.",
    );
  });

  it("shows a status badge only on status changes", () => {
    expect(
      notificationStatus({
        type: "booking.requested",
        payload: { booking_id: BOOKING, status: "requested" },
      }),
    ).toBeNull();
    expect(
      notificationStatus({
        type: "booking.status",
        payload: { booking_id: BOOKING, status: "paid" },
      }),
    ).toBe("paid");
  });
});

describe("notification URLs", () => {
  it("reads the page and filter from the URL", () => {
    expect(parseNotificationView({ page: "3", unread: "true" })).toEqual({
      page: 3,
      unreadOnly: true,
    });
  });

  it.each([
    [{}],
    [{ page: "0" }],
    [{ page: "-1" }],
    [{ page: "10001" }],
    [{ page: "abc" }],
    [{ page: ["1", "2"] }],
    [{ unread: "TRUE" }],
    [{ unread: ["true", "true"] }],
  ])("falls back to the first page of everything for %j", (params) => {
    expect(parseNotificationView(params)).toEqual({
      page: 1,
      unreadOnly: false,
    });
  });

  it("keeps the default view's URL clean", () => {
    expect(notificationsHref({ page: 1, unreadOnly: false })).toBe(
      "/notifications",
    );
    expect(notificationsHref({ page: 2, unreadOnly: true })).toBe(
      "/notifications?unread=true&page=2",
    );
  });

  it("builds an API query Person B's schema accepts", () => {
    const url = new URL(
      notificationsApiUrl({ page: 2, unreadOnly: true }),
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/notifications");
    expect(
      notificationQuery.parse(Object.fromEntries(url.searchParams)),
    ).toEqual({ page: 2, pageSize: 20, unread: true });
    expect(notificationReadUrl("abc")).toBe("/api/notifications/abc/read");
  });

  it("accepts the documented page response", () => {
    expect(
      notificationPage.safeParse({
        data: [row("1")],
        pagination: { page: 1, pageSize: 20, total: 1 },
        unread_count: 1,
      }).success,
    ).toBe(true);
  });
});

describe("bell text", () => {
  it("names the count and a stale state for screen readers", () => {
    expect(notificationBellLabel(null, false)).toBe("Notifications");
    expect(notificationBellLabel(0, false)).toBe("Notifications");
    expect(notificationBellLabel(3, false)).toBe("Notifications, 3 unread");
    expect(notificationBellLabel(3, true)).toBe(
      "Notifications, 3 unread. May be out of date",
    );
  });

  it("announces only new arrivals", () => {
    expect(arrivalAnnouncement(null, 5)).toBeNull();
    expect(arrivalAnnouncement(5, 5)).toBeNull();
    expect(arrivalAnnouncement(5, 4)).toBeNull();
    expect(arrivalAnnouncement(5, 6)).toBe("1 new notification");
    expect(arrivalAnnouncement(0, 3)).toBe("3 new notifications");
  });
});

describe("notificationProblem", () => {
  const at = "/notifications?unread=true";

  it("treats no response as retryable", () => {
    expect(notificationProblem(0, null, at)).toMatchObject({
      kind: "temporary",
      retry: true,
    });
  });

  it("offers sign-in that returns to the same view", () => {
    const problem = notificationProblem(401, null, at);
    expect(problem.kind).toBe("sign_in");
    expect(problem.retry).toBe(false);
    expect(problem.action?.href).toBe(
      "/login?next=%2Fnotifications%3Funread%3Dtrue",
    );
  });

  it("maps the contract's other failures", () => {
    expect(notificationProblem(429, null, at)).toMatchObject({
      kind: "rate_limited",
      retry: true,
    });
    expect(notificationProblem(404, null, at)).toMatchObject({
      kind: "not_found",
      retry: false,
    });
    expect(
      notificationProblem(403, { error: { code: "origin" } }, at),
    ).toMatchObject({ kind: "invalid", retry: false });
    expect(
      notificationProblem(503, { error: { code: "unavailable" } }, at),
    ).toMatchObject({ kind: "temporary", retry: true });
  });

  it("goes by the error code when it has one", () => {
    expect(
      notificationProblem(400, { error: { code: "not_found" } }, at).kind,
    ).toBe("not_found");
  });

  it("never shows the server's own message", () => {
    const secret = "database detail";
    expect(
      notificationProblem(500, { error: { message: secret } }, at).message,
    ).not.toContain(secret);
  });
});

describe("notificationCenterReducer", () => {
  it("stays loading through a failed first read", () => {
    const state = notificationCenterReducer(NOTIFICATION_CENTER_START, {
      type: "load_failed",
      viewKey: "all:1",
      problem: notificationProblem(0, null, "/notifications"),
    });
    expect(state.phase).toBe("loading");
    expect(state.problem?.kind).toBe("temporary");
  });

  it("keeps rows on a failed refetch of the same view", () => {
    const ready = loaded(NOTIFICATION_CENTER_START, [row("1")]);
    const state = notificationCenterReducer(ready, {
      type: "load_failed",
      viewKey: "all:1",
      problem: notificationProblem(503, null, "/notifications"),
    });
    expect(state.phase).toBe("ready");
    expect(state.rows).toHaveLength(1);
    expect(state.problem).not.toBeNull();
  });

  it("drops rows when a different view's read fails", () => {
    const ready = loaded(NOTIFICATION_CENTER_START, [row("1")]);
    const state = notificationCenterReducer(ready, {
      type: "load_failed",
      viewKey: "unread:1",
      problem: notificationProblem(503, null, "/notifications"),
    });
    expect(state.phase).toBe("loading");
    expect(state.rows).toEqual([]);
  });

  it("clears the problem after a good read", () => {
    const failed = notificationCenterReducer(NOTIFICATION_CENTER_START, {
      type: "load_failed",
      viewKey: "all:1",
      problem: notificationProblem(503, null, "/notifications"),
    });
    expect(loaded(failed, [row("1")]).problem).toBeNull();
  });

  it("announces a changed view, not a first load or a refetch", () => {
    const first = loaded(NOTIFICATION_CENTER_START, [row("1")]);
    expect(first.announcement).toBeNull();
    expect(loaded(first, [row("1")]).announcement).toBeNull();
    expect(loaded(first, [row("1")], "all:2").announcement?.text).toBe(
      "Showing all notifications, page 1 of 1.",
    );
  });

  it("marks a row read and lowers the count once", () => {
    const item = row("1");
    let state = loaded(NOTIFICATION_CENTER_START, [item], "all:1", 4);
    state = notificationCenterReducer(state, { type: "marking", id: item.id });
    expect(state.marking).toEqual([item.id]);
    const read = { ...item, read_at: LATER };
    state = notificationCenterReducer(state, { type: "marked", row: read });
    expect(state.marking).toEqual([]);
    expect(state.rows[0].read_at).toBe(LATER);
    expect(state.unreadCount).toBe(3);
    // Marking read is idempotent on the server, so a repeat changes nothing.
    state = notificationCenterReducer(state, { type: "marked", row: read });
    expect(state.unreadCount).toBe(3);
  });

  it("never lets a response that started earlier undo a read", () => {
    const item = row("1");
    let state = loaded(NOTIFICATION_CENTER_START, [item]);
    state = notificationCenterReducer(state, {
      type: "marked",
      row: { ...item, read_at: LATER },
    });
    state = loaded(state, [item], "all:1", 1);
    expect(state.rows[0].read_at).toBe(LATER);
  });

  it("keeps a failed read unread, with the reason, until it's retried", () => {
    const item = row("1");
    let state = loaded(NOTIFICATION_CENTER_START, [item]);
    state = notificationCenterReducer(state, { type: "marking", id: item.id });
    state = notificationCenterReducer(state, {
      type: "mark_failed",
      id: item.id,
      problem: notificationProblem(503, null, "/notifications"),
    });
    expect(state.rows[0].read_at).toBeNull();
    expect(state.unreadCount).toBe(1);
    expect(state.marking).toEqual([]);
    expect(state.readProblems[item.id].retry).toBe(true);
    expect(state.announcement?.text).toContain("Couldn't mark this as read.");
    state = notificationCenterReducer(state, { type: "marking", id: item.id });
    expect(state.readProblems[item.id]).toBeUndefined();
  });

  it("gives each announcement a new key", () => {
    const item = row("1");
    let state = loaded(NOTIFICATION_CENTER_START, [item]);
    state = notificationCenterReducer(state, { type: "marked", row: item });
    const key = state.announcement?.key;
    state = notificationCenterReducer(state, { type: "marked", row: item });
    expect(state.announcement?.key).toBe((key ?? 0) + 1);
  });
});

describe("the unread filter", () => {
  const rows = [row("1"), row("2", { read_at: NOW }), row("3"), row("4")];

  it("shows every row, or just the unread ones", () => {
    expect(visibleNotifications(rows, false)).toHaveLength(4);
    expect(visibleNotifications(rows, true).map((item) => item.id)).toEqual([
      rows[0].id,
      rows[2].id,
      rows[3].id,
    ]);
  });

  it("keeps focus on the row when it stays on screen", () => {
    expect(focusAfterRead(rows, rows[0].id, false)).toBe(rows[0].id);
  });

  it("moves focus to the next unread row, then the previous", () => {
    expect(focusAfterRead(rows, rows[0].id, true)).toBe(rows[2].id);
    expect(focusAfterRead(rows, rows[3].id, true)).toBe(rows[2].id);
  });

  it("has nowhere to go when the last unread row leaves", () => {
    expect(focusAfterRead([rows[0]], rows[0].id, true)).toBeNull();
    expect(focusAfterRead(rows, "missing", true)).toBeNull();
  });
});

describe("paging", () => {
  it("counts at least one page", () => {
    expect(notificationTotalPages(0)).toBe(1);
    expect(notificationTotalPages(20)).toBe(1);
    expect(notificationTotalPages(21)).toBe(2);
  });

  it("summarises the view", () => {
    expect(viewSummary({ page: 2, unreadOnly: false }, 45)).toBe(
      "Showing all notifications, page 2 of 3.",
    );
    expect(viewSummary({ page: 1, unreadOnly: true }, 1)).toBe(
      "Showing unread notifications, page 1 of 1.",
    );
    expect(viewSummary({ page: 1, unreadOnly: true }, 0)).toBe(
      "No unread notifications.",
    );
    expect(viewSummary({ page: 1, unreadOnly: false }, 0)).toBe(
      "No notifications.",
    );
  });
});

describe("runSerially", () => {
  function deferred() {
    let release = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }

  it("collapses a burst into one more run", async () => {
    const gates = [deferred(), deferred()];
    let runs = 0;
    const gate = newRefetchGate();
    const refetch = () => runSerially(gate, () => gates[runs++].promise);
    const first = refetch();
    void refetch();
    void refetch();
    void refetch();
    expect(runs).toBe(1);
    gates[0].release();
    await gates[0].promise;
    await new Promise((resolve) => setTimeout(resolve));
    expect(runs).toBe(2);
    gates[1].release();
    await first;
    expect(runs).toBe(2);
  });

  it("runs again later, even after a failure", async () => {
    let runs = 0;
    const gate = newRefetchGate();
    const refetch = () =>
      runSerially(gate, async () => {
        runs += 1;
        if (runs === 1) throw new Error("boom");
      });
    await expect(refetch()).rejects.toThrow("boom");
    await refetch();
    expect(runs).toBe(2);
  });
});
