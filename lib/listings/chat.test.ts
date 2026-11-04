import { describe, expect, it } from "vitest";
import { sendBody, type ChatMessage } from "@/lib/chat/validation";
import {
  CHAT_BODY_MAX,
  CHAT_READ_ONLY_NOTE,
  CHAT_THREAD_START,
  REALTIME_START,
  arrivalAnnouncement,
  chatBodyLength,
  chatProblem,
  chatThreadReducer,
  checkChatBody,
  closedBookingNote,
  compareMessages,
  mergeMessages,
  messagesHref,
  parseMessagesPage,
  readThrough,
  realtimeIsLive,
  realtimeStatus,
  realtimeStep,
  sendPayload,
  unreadBadge,
  unreadLabel,
  type ChatThreadState,
  type OutgoingMessage,
  type RealtimeEvent,
} from "./chat";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

function message(n: number, fields: Partial<ChatMessage> = {}): ChatMessage {
  const suffix = String(n).padStart(12, "0");
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`,
    conversation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sender_id: OTHER,
    client_key: `cccccccc-cccc-4ccc-8ccc-${suffix}`,
    body: `Message ${n}`,
    read_at: null,
    created_at: `2026-11-01T10:00:${String(n).padStart(2, "0")}.000000+00:00`,
    updated_at: `2026-11-01T10:00:${String(n).padStart(2, "0")}.000000+00:00`,
    ...fields,
  };
}

const outgoing: OutgoingMessage = {
  client_key: KEY,
  body: "Is the camera still available?",
  status: "sending",
  problem: null,
};

function latest(
  state: ChatThreadState,
  rows: ChatMessage[],
  nextBefore: string | null = null,
) {
  return chatThreadReducer(state, {
    type: "latest",
    rows,
    nextBefore,
    viewerId: VIEWER,
    counterpart: "Ana",
  });
}

describe("checkChatBody", () => {
  it("trims surrounding spaces and returns what to send", () => {
    expect(checkChatBody("  hello  ")).toEqual({ ok: true, body: "hello" });
  });

  it("keeps line breaks and inner spaces, like the server", () => {
    expect(checkChatBody("line one\n  line two")).toEqual({
      ok: true,
      body: "line one\n  line two",
    });
  });

  it("rejects an empty or whitespace-only body", () => {
    for (const raw of ["", "   ", " \n\t "])
      expect(checkChatBody(raw).ok).toBe(false);
  });

  it("allows exactly 2,000 characters after trimming", () => {
    const body = "a".repeat(CHAT_BODY_MAX);
    expect(checkChatBody(`  ${body}  `)).toEqual({ ok: true, body });
  });

  it("rejects 2,001 characters and says how long it is", () => {
    const result = checkChatBody("a".repeat(CHAT_BODY_MAX + 1));
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("2,001"),
    });
  });

  it("counts Unicode characters, not UTF-16 units", () => {
    const body = "📷".repeat(CHAT_BODY_MAX);
    expect(body.length).toBe(CHAT_BODY_MAX * 2);
    expect(chatBodyLength(body)).toBe(CHAT_BODY_MAX);
    expect(checkChatBody(body).ok).toBe(true);
    expect(checkChatBody(`${body}📷`).ok).toBe(false);
  });

  it("agrees with Person B's server schema", () => {
    const cases = [
      "hello",
      "  padded  ",
      "",
      "    ",
      "\n\n",
      "a".repeat(CHAT_BODY_MAX),
      "a".repeat(CHAT_BODY_MAX + 1),
      `  ${"a".repeat(CHAT_BODY_MAX)}  `,
      "📷".repeat(CHAT_BODY_MAX),
      "📷".repeat(CHAT_BODY_MAX + 1),
    ];
    for (const body of cases) {
      const server = sendBody.safeParse({ client_key: KEY, body });
      const client = checkChatBody(body);
      expect(client.ok).toBe(server.success);
      if (client.ok && server.success)
        expect(client.body).toBe(server.data.body);
    }
  });
});

describe("chatProblem", () => {
  const returnTo = "/messages/abc";
  const body = (code: string) => ({ error: { code, message: "server text" } });

  it("offers a same-key retry after a network error on send", () => {
    const problem = chatProblem(0, null, returnTo, "send");
    expect(problem.retry).toBe(true);
    expect(problem.kind).toBe("temporary");
    expect(problem.message).toContain("won't send it twice");
  });

  it("describes a failed load without talking about sending", () => {
    expect(chatProblem(0, null, returnTo).message).toContain("reach Rentify");
  });

  it("links sign_in back to this thread", () => {
    const problem = chatProblem(401, body("sign_in"), returnTo);
    expect(problem.kind).toBe("sign_in");
    expect(problem.action).toEqual({
      href: "/login?next=%2Fmessages%2Fabc",
      label: "Sign in",
    });
  });

  it("lets rate_limited retry with the same key", () => {
    const problem = chatProblem(429, body("rate_limited"), returnTo, "send");
    expect(problem.kind).toBe("rate_limited");
    expect(problem.retry).toBe(true);
  });

  it("never retries idempotency_conflict with the same key", () => {
    const problem = chatProblem(
      409,
      body("idempotency_conflict"),
      returnTo,
      "send",
    );
    expect(problem.kind).toBe("conflict");
    expect(problem.retry).toBe(false);
  });

  it("retries the server's own 409 retry code", () => {
    const problem = chatProblem(409, body("retry"), returnTo, "send");
    expect(problem.kind).toBe("temporary");
    expect(problem.retry).toBe(true);
  });

  it("treats 404 as an unavailable conversation, for any reason", () => {
    for (const problem of [
      chatProblem(404, body("not_found"), returnTo),
      chatProblem(404, null, returnTo),
    ]) {
      expect(problem.kind).toBe("not_found");
      expect(problem.retry).toBe(false);
    }
  });

  it("treats a 403 send as read-only", () => {
    const problem = chatProblem(403, body("forbidden"), returnTo, "send");
    expect(problem.kind).toBe("read_only");
    expect(problem.retry).toBe(false);
    expect(problem.message).toBe(CHAT_READ_ONLY_NOTE);
  });

  it("doesn't retry a rejected message", () => {
    const problem = chatProblem(400, body("validation"), returnTo, "send");
    expect(problem.kind).toBe("invalid");
    expect(problem.retry).toBe(false);
  });

  it("retries server failures, and never shows their text", () => {
    const problem = chatProblem(503, body("unavailable"), returnTo, "send");
    expect(problem.kind).toBe("temporary");
    expect(problem.retry).toBe(true);
    expect(problem.message).not.toContain("server text");
  });

  it("handles a body that isn't JSON", () => {
    expect(chatProblem(500, null, returnTo).retry).toBe(true);
  });
});

describe("closedBookingNote", () => {
  it("explains that chat stays open on closed bookings", () => {
    for (const status of [
      "completed",
      "cancelled",
      "declined",
      "expired",
    ] as const)
      expect(closedBookingNote(status)).toContain("still message");
  });

  it("stays quiet for open bookings", () => {
    for (const status of ["requested", "paid", "disputed"] as const)
      expect(closedBookingNote(status)).toBeNull();
  });
});

describe("unread labels", () => {
  it("uses the right plural", () => {
    expect(unreadLabel(1)).toBe("1 unread message");
    expect(unreadLabel(2)).toBe("2 unread messages");
  });

  it("caps the badge, not the label", () => {
    expect(unreadBadge(99)).toBe("99");
    expect(unreadBadge(100)).toBe("99+");
    expect(unreadLabel(100)).toBe("100 unread messages");
  });
});

describe("parseMessagesPage", () => {
  it("reads a valid page", () => {
    expect(parseMessagesPage({ page: "3" })).toBe(3);
    expect(parseMessagesPage({ page: "10000" })).toBe(10000);
  });

  it("falls back to page 1", () => {
    for (const page of [
      "0",
      "-1",
      "abc",
      "1.5",
      "10001",
      ["2", "3"],
      undefined,
    ])
      expect(parseMessagesPage({ page })).toBe(1);
  });

  it("builds a link back", () => {
    expect(messagesHref(1)).toBe("/messages");
    expect(messagesHref(2)).toBe("/messages?page=2");
  });
});

describe("compareMessages", () => {
  it("orders microseconds that Date would treat as equal", () => {
    const earlier = {
      id: "b",
      created_at: "2026-11-01T10:00:00.123456+00:00",
    };
    const later = { id: "a", created_at: "2026-11-01T10:00:00.123457+00:00" };
    expect(compareMessages(earlier, later)).toBeLessThan(0);
  });

  it("handles times the database prints without trailing zeros", () => {
    const a = { id: "a", created_at: "2026-11-01T10:00:00.5+00:00" };
    const b = { id: "b", created_at: "2026-11-01T10:00:00.49+00:00" };
    const c = { id: "c", created_at: "2026-11-01T10:00:00+00:00" };
    expect(compareMessages(b, a)).toBeLessThan(0);
    expect(compareMessages(c, b)).toBeLessThan(0);
  });

  it("breaks an equal timestamp by id, like the server's cursor", () => {
    const time = "2026-11-01T10:00:00.123456+00:00";
    expect(
      compareMessages(
        { id: "a", created_at: time },
        { id: "b", created_at: time },
      ),
    ).toBeLessThan(0);
  });
});

describe("mergeMessages", () => {
  it("keeps one row per id, oldest first", () => {
    const merged = mergeMessages(
      [message(2), message(1)],
      [message(3), message(2)],
    );
    expect(merged.map((row) => row.body)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
    ]);
  });

  it("takes the newer row for a read receipt", () => {
    const read = "2026-11-01T11:00:00.000000+00:00";
    const [merged] = mergeMessages(
      [message(1)],
      [message(1, { read_at: read })],
    );
    expect(merged.read_at).toBe(read);
  });

  it("doesn't let an earlier response undo a read receipt", () => {
    const read = "2026-11-01T11:00:00.000000+00:00";
    const [merged] = mergeMessages(
      [message(1, { read_at: read })],
      [message(1)],
    );
    expect(merged.read_at).toBe(read);
  });
});

describe("readThrough", () => {
  it("picks the newest incoming unread message", () => {
    expect(readThrough([message(1), message(2)], VIEWER)).toBe(message(2).id);
  });

  it("ignores the viewer's own messages", () => {
    const rows = [message(1), message(2, { sender_id: VIEWER })];
    expect(readThrough(rows, VIEWER)).toBe(message(1).id);
  });

  it("is null when nothing is waiting", () => {
    const read = "2026-11-01T11:00:00.000000+00:00";
    expect(readThrough([], VIEWER)).toBeNull();
    expect(readThrough([message(1, { read_at: read })], VIEWER)).toBeNull();
    expect(readThrough([message(1, { sender_id: VIEWER })], VIEWER)).toBeNull();
  });
});

describe("arrivalAnnouncement", () => {
  it("reads one message with its sender", () => {
    expect(arrivalAnnouncement([message(1)], "Ana")).toBe(
      "New message from Ana: Message 1",
    );
  });

  it("counts several instead of reading them all", () => {
    expect(arrivalAnnouncement([message(1), message(2)], "Ana")).toBe(
      "2 new messages from Ana",
    );
  });

  it("cuts a long message short without splitting a character", () => {
    const text = arrivalAnnouncement(
      [message(1, { body: "📷".repeat(500) })],
      "Ana",
    );
    expect(text.endsWith(`${"📷".repeat(200)}…`)).toBe(true);
    expect(text).not.toContain("📷".repeat(201));
  });
});

describe("retry state", () => {
  const queued = chatThreadReducer(CHAT_THREAD_START, {
    type: "queued",
    item: outgoing,
  });
  const problem = chatProblem(0, null, "/messages/abc", "send");
  const failed = chatThreadReducer(queued, {
    type: "failed",
    clientKey: KEY,
    problem,
  });

  it("keeps a failed send visible with its problem", () => {
    expect(failed.outbox).toEqual([{ ...outgoing, status: "failed", problem }]);
  });

  it("announces a failed send", () => {
    expect(failed.announcement?.text).toContain("wasn't sent");
  });

  it("retries with the same client_key and body", () => {
    const retrying = chatThreadReducer(failed, {
      type: "retrying",
      clientKey: KEY,
    });
    expect(retrying.outbox[0].status).toBe("sending");
    expect(retrying.outbox[0].problem).toBeNull();
    expect(sendPayload(retrying.outbox[0])).toEqual({
      client_key: KEY,
      body: outgoing.body,
    });
  });

  it("clears the outbox when the send is confirmed", () => {
    const sent = message(1, { client_key: KEY, sender_id: VIEWER });
    const state = chatThreadReducer(failed, {
      type: "delivered",
      clientKey: KEY,
      message: sent,
    });
    expect(state.outbox).toEqual([]);
    expect(state.messages).toEqual([sent]);
  });

  it("clears a 'failed' send whose response was only lost", () => {
    const stored = message(1, { client_key: KEY, sender_id: VIEWER });
    const state = latest(failed, [stored]);
    expect(state.outbox).toEqual([]);
    expect(state.messages).toEqual([stored]);
  });

  it("keeps other failed sends when one is discarded", () => {
    const other = { ...outgoing, client_key: "other-key" };
    const two = chatThreadReducer(failed, { type: "queued", item: other });
    const state = chatThreadReducer(two, { type: "discarded", clientKey: KEY });
    expect(state.outbox).toEqual([other]);
  });
});

describe("thread view state", () => {
  it("sets the cursor from the first load, without announcing it", () => {
    const state = latest(CHAT_THREAD_START, [message(2), message(1)], "cursor");
    expect(state.phase).toBe("ready");
    expect(state.nextBefore).toBe("cursor");
    expect(state.messages.map((row) => row.id)).toEqual([
      message(1).id,
      message(2).id,
    ]);
    expect(state.announcement).toBeNull();
  });

  it("marks the first unread message once and keeps it there", () => {
    const read = "2026-11-01T11:00:00.000000+00:00";
    const first = latest(CHAT_THREAD_START, [
      message(1, { read_at: read }),
      message(2),
      message(3),
    ]);
    expect(first.firstUnreadId).toBe(message(2).id);
    const later = latest(first, [
      message(1, { read_at: read }),
      message(2, { read_at: read }),
      message(3, { read_at: read }),
    ]);
    expect(later.firstUnreadId).toBe(message(2).id);
  });

  it("has no divider when everything was read", () => {
    const state = latest(CHAT_THREAD_START, [
      message(1, { sender_id: VIEWER }),
    ]);
    expect(state.firstUnreadId).toBeNull();
  });

  it("announces only messages that are new and from the other person", () => {
    const first = latest(CHAT_THREAD_START, [message(1)]);
    const own = latest(first, [message(2, { sender_id: VIEWER }), message(1)]);
    expect(own.announcement).toBeNull();
    const next = latest(own, [
      message(3),
      message(2, { sender_id: VIEWER }),
      message(1),
    ]);
    expect(next.announcement?.text).toBe("New message from Ana: Message 3");
  });

  it("gives each announcement a new key, even with the same text", () => {
    const first = latest(CHAT_THREAD_START, [message(1)]);
    const one = latest(first, [message(2, { body: "ok" })]);
    const two = latest(one, [message(3, { body: "ok" })]);
    expect(one.announcement?.text).toBe(two.announcement?.text);
    expect(two.announcement?.key).toBe((one.announcement?.key ?? 0) + 1);
  });

  it("doesn't announce a repeat refetch or a read receipt", () => {
    const first = latest(CHAT_THREAD_START, [message(1)]);
    const read = "2026-11-01T11:00:00.000000+00:00";
    const state = latest(first, [message(1, { read_at: read })]);
    expect(state.announcement).toBeNull();
    expect(state.messages[0].read_at).toBe(read);
  });

  it("ignores refetched rows older than the screen, keeping the cursor", () => {
    const first = latest(
      CHAT_THREAD_START,
      [message(10), message(9)],
      message(9).id,
    );
    const state = latest(
      first,
      [message(11), message(10), message(9), message(8), message(7)],
      message(7).id,
    );
    expect(state.messages.map((row) => row.body)).toEqual([
      "Message 9",
      "Message 10",
      "Message 11",
    ]);
    expect(state.nextBefore).toBe(message(9).id);
    expect(state.announcement?.text).toBe("New message from Ana: Message 11");
  });

  it("adds older pages quietly and moves the cursor", () => {
    const first = latest(CHAT_THREAD_START, [message(5)], message(5).id);
    const state = chatThreadReducer(first, {
      type: "older",
      rows: [message(4), message(3)],
      nextBefore: null,
    });
    expect(state.messages.map((row) => row.body)).toEqual([
      "Message 3",
      "Message 4",
      "Message 5",
    ]);
    expect(state.nextBefore).toBeNull();
    expect(state.announcement).toBeNull();
  });

  it("doesn't let a send during the first load hide the history", () => {
    const sent = message(9, { client_key: KEY, sender_id: VIEWER });
    const sending = chatThreadReducer(CHAT_THREAD_START, {
      type: "delivered",
      clientKey: KEY,
      message: sent,
    });
    const state = latest(sending, [message(8), message(7)], "cursor");
    expect(state.messages).toHaveLength(3);
    expect(state.nextBefore).toBe("cursor");
  });

  it("keeps messages on screen when a refetch fails, then clears the problem", () => {
    const first = latest(CHAT_THREAD_START, [message(1)]);
    const problem = chatProblem(0, null, "/messages/abc");
    const failed = chatThreadReducer(first, { type: "load_failed", problem });
    expect(failed.messages).toHaveLength(1);
    expect(failed.loadProblem).toBe(problem);
    expect(latest(failed, [message(1)]).loadProblem).toBeNull();
  });

  it("stays in loading after a failed first load, so its retry isn't announced", () => {
    const problem = chatProblem(0, null, "/messages/abc");
    const failed = chatThreadReducer(CHAT_THREAD_START, {
      type: "load_failed",
      problem,
    });
    expect(failed.phase).toBe("loading");
    const state = latest(failed, [message(1)]);
    expect(state.phase).toBe("ready");
    expect(state.announcement).toBeNull();
  });
});

describe("realtime readiness", () => {
  const run = (events: RealtimeEvent[], start = REALTIME_START) =>
    events.reduce(realtimeStep, start);
  const joined: RealtimeEvent = { kind: "joined" };
  const postgres: RealtimeEvent = {
    kind: "system",
    extension: "postgres_changes",
    status: "ok",
  };
  const replication: RealtimeEvent = {
    kind: "system",
    extension: "system",
    status: "ok",
  };

  it("starts as connecting", () => {
    expect(realtimeStatus(REALTIME_START)).toBe("connecting");
  });

  it("isn't live from SUBSCRIBED alone", () => {
    expect(realtimeStatus(run([joined]))).toBe("connecting");
  });

  it("isn't live until both system events report ok", () => {
    expect(realtimeStatus(run([joined, postgres]))).toBe("connecting");
    expect(realtimeStatus(run([joined, replication]))).toBe("connecting");
    expect(realtimeStatus(run([joined, postgres, replication]))).toBe("live");
  });

  it("is live in any arrival order", () => {
    expect(realtimeIsLive(run([replication, postgres, joined]))).toBe(true);
  });

  it("ignores system events for other extensions and other statuses", () => {
    const flags = run([
      joined,
      { kind: "system", extension: "broadcast", status: "ok" },
      { kind: "system", extension: "postgres_changes", status: "pending" },
    ]);
    expect(flags.postgres).toBe(false);
    expect(flags.failed).toBe(false);
  });

  it("is degraded when either extension reports an error", () => {
    for (const extension of ["postgres_changes", "system"])
      expect(
        realtimeStatus(
          run([joined, { kind: "system", extension, status: "error" }]),
        ),
      ).toBe("degraded");
  });

  it("is degraded after a timeout, and a late ok recovers", () => {
    const late = run([joined, postgres, { kind: "timeout" }]);
    expect(realtimeStatus(late)).toBe("degraded");
    expect(realtimeStatus(run([replication], late))).toBe("live");
  });

  it("ignores a timeout once live", () => {
    const live = run([joined, postgres, replication]);
    expect(realtimeStep(live, { kind: "timeout" })).toEqual(live);
  });

  it("needs readiness again after a disconnect", () => {
    const dropped = run([
      joined,
      postgres,
      replication,
      { kind: "disconnected" },
    ]);
    expect(realtimeStatus(dropped)).toBe("degraded");
    const rejoined = run([joined], dropped);
    expect(realtimeStatus(rejoined)).toBe("degraded");
    expect(realtimeStatus(run([postgres, replication], rejoined))).toBe("live");
  });
});
