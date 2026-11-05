import type { ChatMessage } from "@/lib/chat/validation";
import type { BookingProblem } from "./booking-dates";
import {
  STATUS_LABEL,
  STATUS_TONE,
  type BookingStatus,
} from "./booking-status";

/*
 * Pure helpers for booking chat (A3.1), following Person B's contract
 * (lib/chat/README.md). The HTTP read model is the source of truth: Realtime
 * events only say "refetch", and the server rechecks every send.
 */

export const CHAT_BODY_MAX = 2000;
export const CONVERSATIONS_PAGE_SIZE = 20;

/** Page size for a first load or for "older messages". */
export const MESSAGES_PAGE_SIZE = 30;

/** The API's largest page, used when refetching what is already on screen. */
export const REFETCH_PAGE_SIZE = 50;

/** The contract trims surrounding ASCII spaces only, not other whitespace. */
function trimBody(raw: string): string {
  return raw.replace(/^ +| +$/g, "");
}

/** Length as the server counts it: Unicode characters, after trimming. */
export function chatBodyLength(raw: string): number {
  return Array.from(trimBody(raw)).length;
}

export type ChatBodyCheck =
  { ok: true; body: string } | { ok: false; message: string };

/** The same rule as the server, with the text to send on success. */
export function checkChatBody(raw: string): ChatBodyCheck {
  const body = trimBody(raw);
  if (!/\S/u.test(body))
    return { ok: false, message: "Write a message first." };
  const length = Array.from(body).length;
  if (length > CHAT_BODY_MAX)
    return {
      ok: false,
      message: `Messages can be up to 2,000 characters. This one is ${length.toLocaleString("en-PH")}.`,
    };
  return { ok: true, body };
}

export type ChatProblemKind =
  | "sign_in"
  | "rate_limited"
  | "conflict"
  | "not_found"
  | "read_only"
  | "invalid"
  | "temporary";

export type ChatProblem = BookingProblem & {
  kind: ChatProblemKind;
  /** Sending again with the same client_key and body is safe and may work. */
  retry: boolean;
};

type ErrorBody = { error?: { code?: unknown; message?: unknown } };

/** What to show for a failed chat request. Status 0 means no response. */
export function chatProblem(
  status: number,
  body: unknown,
  returnTo: string,
  context: "send" | "load" = "load",
): ChatProblem {
  const code = (body as ErrorBody | null)?.error?.code;
  if (status === 0)
    return {
      kind: "temporary",
      retry: true,
      // A lost response can hide a send that worked, so the key is what makes
      // this safe to repeat.
      message:
        context === "send"
          ? "We couldn't confirm this was sent. Retrying won't send it twice."
          : "We couldn't reach Rentify. Check your connection and try again.",
    };
  if (code === "sign_in" || status === 401)
    return {
      kind: "sign_in",
      retry: true,
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
      message: "You're sending messages quickly. Wait a moment, then retry.",
    };
  if (code === "idempotency_conflict")
    return {
      kind: "conflict",
      retry: false,
      message:
        "This message can't be sent again as it is. Edit it to send it as a new message.",
    };
  if (code === "retry")
    return {
      kind: "temporary",
      retry: true,
      message: "Rentify was busy. Please try again.",
    };
  if (code === "not_found" || status === 404)
    return {
      kind: "not_found",
      retry: false,
      message:
        "This conversation isn't available. It may belong to another account, or the link may be wrong.",
    };
  if (code === "forbidden" || status === 403)
    return { kind: "read_only", retry: false, message: CHAT_READ_ONLY_NOTE };
  if (status >= 400 && status < 500)
    return {
      kind: "invalid",
      retry: false,
      message: "Rentify couldn't accept this message. Edit it and try again.",
    };
  return {
    kind: "temporary",
    retry: true,
    message: "Chat is having a problem right now. Please try again shortly.",
  };
}

/** Shown instead of the message box when `can_send` is false. */
export const CHAT_READ_ONLY_NOTE =
  "You can read this conversation, but new messages are off. Both accounts need to be active with a verified email to send.";

/** Chat stays open after a booking closes, so this explains why it still works. */
export function closedBookingNote(status: BookingStatus): string | null {
  if (STATUS_TONE[status] !== "closed") return null;
  return `This booking is ${STATUS_LABEL[status].toLowerCase()}. You can still message each other about refunds or anything unresolved.`;
}

export function unreadLabel(count: number): string {
  return `${count} unread ${count === 1 ? "message" : "messages"}`;
}

export function unreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function parseMessagesPage(
  params: Record<string, string | string[] | undefined>,
): number {
  const raw = typeof params.page === "string" ? params.page : "";
  const page = /^\d+$/.test(raw) ? Number(raw) : 1;
  return page >= 1 && page <= 10000 ? page : 1;
}

export function messagesHref(page: number): string {
  return page > 1 ? `/messages?page=${page}` : "/messages";
}

/**
 * A timestamp as whole microseconds. Stored times have microseconds, which
 * Date drops, and the order must match the server's when messages are close.
 */
function timeKey(timestamp: string): number {
  const fraction = /\.(\d+)/.exec(timestamp)?.[1] ?? "";
  const micros = Number(fraction.padEnd(6, "0").slice(0, 6));
  return Date.parse(timestamp.replace(/\.\d+/, "")) * 1000 + micros;
}

/** Oldest first: the server's timestamp and UUID order, reversed for reading. */
export function compareMessages(
  a: Pick<ChatMessage, "created_at" | "id">,
  b: Pick<ChatMessage, "created_at" | "id">,
): number {
  const byTime = timeKey(a.created_at) - timeKey(b.created_at);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Combine rows, one per message id, oldest first. The newest row wins, except
 * that a read receipt can't be undone by a response that started earlier.
 */
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const known = byId.get(message.id);
    byId.set(message.id, known?.read_at && !message.read_at ? known : message);
  }
  return [...byId.values()].sort(compareMessages);
}

/** The newest incoming unread message: what to mark read through, if any. */
export function readThrough(
  messages: ChatMessage[],
  viewerId: string,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.sender_id !== viewerId && !message.read_at) return message.id;
  }
  return null;
}

/** What the polite live region says when new messages arrive. */
export function arrivalAnnouncement(
  arrived: ChatMessage[],
  counterpart: string,
): string {
  if (arrived.length > 1)
    return `${arrived.length} new messages from ${counterpart}`;
  const characters = Array.from(arrived[0].body);
  const excerpt =
    characters.length > 200
      ? `${characters.slice(0, 200).join("")}…`
      : arrived[0].body;
  return `New message from ${counterpart}: ${excerpt}`;
}

export type OutgoingMessage = {
  client_key: string;
  body: string;
  status: "sending" | "failed";
  problem: ChatProblem | null;
};

/** The request for a send or a retry: always this key with this exact body. */
export function sendPayload(item: OutgoingMessage) {
  return { client_key: item.client_key, body: item.body };
}

export type ChatThreadState = {
  /** Stays "loading" until the first successful read, even after an error. */
  phase: "loading" | "ready";
  /** Oldest first. */
  messages: ChatMessage[];
  /** Cursor for the next older page; null when the oldest is on screen. */
  nextBefore: string | null;
  /** Sends that aren't confirmed yet. Failed ones stay until retried or discarded. */
  outbox: OutgoingMessage[];
  /** Where the "New messages" divider goes, fixed at the first load. */
  firstUnreadId: string | null;
  /** The latest refetch failed; what's on screen may be behind. */
  loadProblem: ChatProblem | null;
  /** A new key replaces the live region's text, so it is read out again. */
  announcement: { key: number; text: string } | null;
};

export const CHAT_THREAD_START: ChatThreadState = {
  phase: "loading",
  messages: [],
  nextBefore: null,
  outbox: [],
  firstUnreadId: null,
  loadProblem: null,
  announcement: null,
};

export type ChatThreadAction =
  | {
      type: "latest";
      /** Newest rows, up to and including the oldest message on screen. */
      rows: ChatMessage[];
      /** The server's cursor for those rows; used only on the first load. */
      nextBefore: string | null;
      viewerId: string;
      counterpart: string;
    }
  | { type: "older"; rows: ChatMessage[]; nextBefore: string | null }
  | { type: "load_failed"; problem: ChatProblem }
  | { type: "queued"; item: OutgoingMessage }
  | { type: "delivered"; clientKey: string; message: ChatMessage }
  | { type: "failed"; clientKey: string; problem: ChatProblem }
  | { type: "retrying"; clientKey: string }
  | { type: "discarded"; clientKey: string };

function announce(
  state: ChatThreadState,
  text: string,
): ChatThreadState["announcement"] {
  return { key: (state.announcement?.key ?? 0) + 1, text };
}

export function chatThreadReducer(
  state: ChatThreadState,
  action: ChatThreadAction,
): ChatThreadState {
  switch (action.type) {
    case "latest": {
      const first = state.phase === "loading";
      const oldest = first ? undefined : state.messages[0];
      // A refetch page can reach past the oldest message on screen. Those rows
      // belong to "older messages", or they'd look new and open a gap there.
      const rows = oldest
        ? action.rows.filter((row) => compareMessages(row, oldest) >= 0)
        : action.rows;
      const known = new Set(state.messages.map((message) => message.id));
      const messages = mergeMessages(state.messages, rows);
      const arrived = first
        ? []
        : rows
            .filter(
              (row) => !known.has(row.id) && row.sender_id !== action.viewerId,
            )
            .sort(compareMessages);
      // A row with this key means the send worked, including one that looked
      // failed because its response was lost.
      const stored = new Set(rows.map((row) => row.client_key));
      return {
        ...state,
        phase: "ready",
        messages,
        nextBefore: first ? action.nextBefore : state.nextBefore,
        outbox: state.outbox.filter((item) => !stored.has(item.client_key)),
        firstUnreadId: first
          ? (messages.find(
              (message) =>
                message.sender_id !== action.viewerId && !message.read_at,
            )?.id ?? null)
          : state.firstUnreadId,
        loadProblem: null,
        announcement: arrived.length
          ? announce(state, arrivalAnnouncement(arrived, action.counterpart))
          : state.announcement,
      };
    }
    case "older":
      return {
        ...state,
        messages: mergeMessages(state.messages, action.rows),
        nextBefore: action.nextBefore,
        loadProblem: null,
      };
    case "load_failed":
      return { ...state, loadProblem: action.problem };
    case "queued":
      return { ...state, outbox: [...state.outbox, action.item] };
    case "delivered":
      return {
        ...state,
        messages: mergeMessages(state.messages, [action.message]),
        outbox: state.outbox.filter(
          (item) => item.client_key !== action.clientKey,
        ),
      };
    case "failed":
      return {
        ...state,
        outbox: state.outbox.map((item) =>
          item.client_key === action.clientKey
            ? { ...item, status: "failed", problem: action.problem }
            : item,
        ),
        announcement: announce(
          state,
          `Your message wasn't sent. ${action.problem.message}`,
        ),
      };
    case "retrying":
      return {
        ...state,
        outbox: state.outbox.map((item) =>
          item.client_key === action.clientKey
            ? { ...item, status: "sending", problem: null }
            : item,
        ),
      };
    case "discarded":
      return {
        ...state,
        outbox: state.outbox.filter(
          (item) => item.client_key !== action.clientKey,
        ),
      };
  }
}

/*
 * Realtime readiness. A socket SUBSCRIBED alone doesn't mean the database is
 * streaming: the contract waits for "ok" system events from both
 * postgres_changes and system, then refetches to cover the gap.
 */

export type RealtimeFlags = {
  joined: boolean;
  postgres: boolean;
  replication: boolean;
  failed: boolean;
};

export const REALTIME_START: RealtimeFlags = {
  joined: false,
  postgres: false,
  replication: false,
  failed: false,
};

export type RealtimeEvent =
  | { kind: "joined" }
  | { kind: "system"; extension?: string; status?: string }
  /** The channel dropped: readiness has to be earned again after a rejoin. */
  | { kind: "disconnected" }
  /** Readiness is overdue. A late "ok" can still bring it back. */
  | { kind: "timeout" };

export function realtimeIsLive(flags: RealtimeFlags): boolean {
  return flags.joined && flags.postgres && flags.replication;
}

export function realtimeStep(
  flags: RealtimeFlags,
  event: RealtimeEvent,
): RealtimeFlags {
  switch (event.kind) {
    case "disconnected":
      return { ...REALTIME_START, failed: true };
    case "timeout":
      return realtimeIsLive(flags) ? flags : { ...flags, failed: true };
    case "joined":
    case "system": {
      if (event.kind === "system") {
        const key =
          event.extension === "postgres_changes"
            ? "postgres"
            : event.extension === "system"
              ? "replication"
              : null;
        if (!key) return flags;
        if (event.status === "error")
          return { ...flags, [key]: false, failed: true };
        if (event.status !== "ok") return flags;
        flags = { ...flags, [key]: true };
      } else {
        flags = { ...flags, joined: true };
      }
      return realtimeIsLive(flags) ? { ...flags, failed: false } : flags;
    }
  }
}

export type RealtimeStatus = "connecting" | "live" | "degraded";

export function realtimeStatus(flags: RealtimeFlags): RealtimeStatus {
  if (realtimeIsLive(flags)) return "live";
  return flags.failed ? "degraded" : "connecting";
}
