"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { apiRequest } from "@/components/listings/api-request";
import { Button } from "@/components/ui/button";
import {
  messagePage,
  readResult,
  sentMessage,
  type ChatMessage,
} from "@/lib/chat/validation";
import {
  CHAT_READ_ONLY_NOTE,
  CHAT_THREAD_START,
  MESSAGES_PAGE_SIZE,
  REFETCH_PAGE_SIZE,
  chatProblem,
  chatThreadReducer,
  checkChatBody,
  readThrough,
  sendPayload,
  type ChatProblem,
  type OutgoingMessage,
} from "@/lib/listings/chat";
import { ChatComposer } from "./chat-composer";
import { MessageBubble, OutgoingBubble } from "./message-bubble";
import { useChatChannel } from "./use-chat-channel";

/** Close enough to the end of the thread to keep following new messages. */
const NEAR_BOTTOM_PX = 160;

/** While live updates are down, HTTP keeps the thread roughly current. */
const DEGRADED_POLL_MS = 30_000;

/**
 * A stalled connection counts as a failed request, so a send can't sit on
 * "Sending…" and a refetch can't block later ones. A send that did arrive is
 * safe: retrying reuses its key, and the next refetch finds the stored row.
 */
const REQUEST_TIMEOUT_MS = 20_000;

function timedRequest(method: string, url: string, body?: unknown) {
  return Promise.race([
    apiRequest(method, url, body),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT_MS),
    ),
  ]);
}

type PageResult =
  | { ok: true; rows: ChatMessage[]; nextBefore: string | null }
  | { ok: false; problem: ChatProblem };

async function fetchPage(
  conversationId: string,
  limit: number,
  before: string | null,
  returnTo: string,
): Promise<PageResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  try {
    const result = await timedRequest(
      "GET",
      `/api/conversations/${conversationId}/messages?${params}`,
    );
    if (!result.ok)
      return {
        ok: false,
        problem: chatProblem(result.status, result.json, returnTo),
      };
    const page = messagePage.safeParse(result.json);
    if (!page.success)
      return { ok: false, problem: chatProblem(503, null, returnTo) };
    return {
      ok: true,
      rows: page.data.data,
      nextBefore: page.data.next_before,
    };
  } catch {
    return { ok: false, problem: chatProblem(0, null, returnTo) };
  }
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

// The thread's end, not the page's: the site footer sits below the message box.
function nearBottom() {
  const end = document.getElementById("chat-end");
  return (
    !end ||
    end.getBoundingClientRect().bottom - window.innerHeight < NEAR_BOTTOM_PX
  );
}

function scrollToEnd() {
  document.getElementById("chat-end")?.scrollIntoView({ block: "end" });
}

/**
 * The messages of one conversation: live hints, older pages, read receipts,
 * sending with retries and the polite announcements. Every view of the
 * messages comes from the HTTP read model. Failed sends live in memory, so
 * message text never goes to browser storage.
 */
export function ChatThread({
  conversationId,
  viewerId,
  counterpart,
  canSend,
  note,
}: {
  conversationId: string;
  viewerId: string;
  counterpart: string;
  canSend: boolean;
  /** Extra context above the message box, such as a closed booking. */
  note: string | null;
}) {
  const router = useRouter();
  const returnTo = `/messages/${conversationId}`;
  const [state, dispatch] = useReducer(chatThreadReducer, CHAT_THREAD_START);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendBlocked, setSendBlocked] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );

  const textarea = useRef<HTMLTextAreaElement>(null);
  const latestState = useRef(state);
  useEffect(() => {
    latestState.current = state;
  }, [state]);

  // Hints can arrive in bursts. One refetch runs at a time, plus one more if
  // anything asked while it ran, so an older response never overwrites a newer.
  const fetching = useRef(false);
  const fetchAgain = useRef(false);
  const refetch = useCallback(async () => {
    if (fetching.current) {
      fetchAgain.current = true;
      return;
    }
    fetching.current = true;
    do {
      fetchAgain.current = false;
      const current = latestState.current;
      const oldest =
        current.phase === "ready" ? (current.messages[0]?.id ?? null) : null;
      const rows: ChatMessage[] = [];
      let cursor: string | null = null;
      let nextBefore: string | null = null;
      let problem: ChatProblem | null = null;
      // Read until the oldest message on screen, so a long gap closes and read
      // receipts on older messages update too.
      do {
        const page: PageResult = await fetchPage(
          conversationId,
          oldest ? REFETCH_PAGE_SIZE : MESSAGES_PAGE_SIZE,
          cursor,
          returnTo,
        );
        if (!page.ok) {
          problem = page.problem;
          break;
        }
        rows.push(...page.rows);
        nextBefore = page.nextBefore;
        cursor =
          oldest && !page.rows.some((row) => row.id === oldest)
            ? page.nextBefore
            : null;
      } while (cursor);
      if (problem) dispatch({ type: "load_failed", problem });
      else
        dispatch({
          type: "latest",
          rows,
          nextBefore,
          viewerId,
          counterpart,
        });
    } while (fetchAgain.current);
    fetching.current = false;
  }, [conversationId, counterpart, returnTo, viewerId]);

  // Declared before the first fetch below, so the listeners are registered
  // first, as the contract requires.
  const { status: live, reconnect } = useChatChannel(conversationId, refetch);

  useEffect(() => {
    void refetch();
    function onVisibility() {
      if (document.visibilityState === "visible") void refetch();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refetch]);

  useEffect(() => {
    if (live !== "degraded" || !visible) return;
    const timer = setInterval(() => void refetch(), DEGRADED_POLL_MS);
    return () => clearInterval(timer);
  }, [live, refetch, visible]);

  // Mark incoming messages read while the thread is actually on screen. The
  // refresh updates can_send and clears cached pages showing the old count.
  const through =
    visible && state.phase === "ready"
      ? readThrough(state.messages, viewerId)
      : null;
  const markedThrough = useRef<string | null>(null);
  useEffect(() => {
    if (!through || markedThrough.current === through) return;
    markedThrough.current = through;
    apiRequest("POST", `/api/conversations/${conversationId}/read`, { through })
      .then((result) => {
        if (!result.ok) {
          markedThrough.current = null;
          return;
        }
        void refetch();
        const read = readResult.safeParse(result.json);
        if (read.success && read.data.updated > 0) router.refresh();
      })
      .catch(() => {
        markedThrough.current = null;
      });
  }, [conversationId, refetch, router, through]);

  // Keep the reader in place: at the first unread message on the first load,
  // following the end when already there, and steady when older pages appear.
  const scrolledOnLoad = useRef(false);
  const list = useRef<HTMLOListElement>(null);
  const firstRowBeforeOlder = useRef<{ row: Element; top: number } | null>(
    null,
  );
  const followEnd = useRef(true);
  const lastId = state.messages.at(-1)?.id;
  const outboxSize = state.outbox.length;
  const failedSends = state.outbox.filter(
    (item) => item.status === "failed",
  ).length;
  useLayoutEffect(() => {
    if (state.phase !== "ready") return;
    if (firstRowBeforeOlder.current) {
      const { row, top } = firstRowBeforeOlder.current;
      firstRowBeforeOlder.current = null;
      window.scrollBy({ top: row.getBoundingClientRect().top - top });
      return;
    }
    if (!scrolledOnLoad.current) {
      scrolledOnLoad.current = true;
      const divider = document.getElementById("chat-first-unread");
      if (divider) divider.scrollIntoView({ block: "start" });
      else scrollToEnd();
      return;
    }
    if (followEnd.current) scrollToEnd();
  }, [failedSends, lastId, outboxSize, state.messages.length, state.phase]);

  useEffect(() => {
    function onScroll() {
      const end = nearBottom();
      followEnd.current = end;
      setAtEnd(end);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function deliver(item: OutgoingMessage) {
    const key = item.client_key;
    try {
      const result = await timedRequest(
        "POST",
        `/api/conversations/${conversationId}/messages`,
        sendPayload(item),
      );
      const sent = sentMessage.safeParse(result.json);
      if (result.ok && sent.success) {
        dispatch({
          type: "delivered",
          clientKey: key,
          message: sent.data.data,
        });
        return;
      }
      const problem = result.ok
        ? chatProblem(503, null, returnTo, "send")
        : chatProblem(result.status, result.json, returnTo, "send");
      dispatch({ type: "failed", clientKey: key, problem });
      if (problem.kind === "read_only") setSendBlocked(true);
    } catch {
      dispatch({
        type: "failed",
        clientKey: key,
        problem: chatProblem(0, null, returnTo, "send"),
      });
    }
  }

  function submit() {
    const check = checkChatBody(draft);
    if (!check.ok) {
      setDraftError(check.message);
      textarea.current?.focus();
      return;
    }
    const item: OutgoingMessage = {
      client_key: crypto.randomUUID(),
      body: check.body,
      status: "sending",
      problem: null,
    };
    setDraft("");
    setDraftError(null);
    followEnd.current = true;
    dispatch({ type: "queued", item });
    void deliver(item);
  }

  function retry(item: OutgoingMessage) {
    dispatch({ type: "retrying", clientKey: item.client_key });
    // The Retry button is about to disappear; don't lose keyboard focus with it.
    textarea.current?.focus();
    void deliver(item);
  }

  function discard(item: OutgoingMessage) {
    dispatch({ type: "discarded", clientKey: item.client_key });
    textarea.current?.focus();
  }

  function editFailed(item: OutgoingMessage) {
    dispatch({ type: "discarded", clientKey: item.client_key });
    setDraft(item.body);
    textarea.current?.focus();
  }

  async function loadOlder() {
    if (!state.nextBefore || loadingOlder) return;
    setLoadingOlder(true);
    const page = await fetchPage(
      conversationId,
      MESSAGES_PAGE_SIZE,
      state.nextBefore,
      returnTo,
    );
    if (page.ok) {
      const row = list.current?.firstElementChild;
      if (row)
        firstRowBeforeOlder.current = {
          row,
          top: row.getBoundingClientRect().top,
        };
      dispatch({
        type: "older",
        rows: page.rows,
        nextBefore: page.nextBefore,
      });
      // The button is about to go; keep keyboard focus at the older messages.
      if (!page.nextBefore) list.current?.focus();
    } else dispatch({ type: "load_failed", problem: page.problem });
    setLoadingOlder(false);
  }

  function refreshNow() {
    if (live === "degraded") {
      refocusWhenLive.current = true;
      reconnect();
    }
    void refetch();
  }

  // The banner and its button go away once live again; don't lose focus there.
  const refocusWhenLive = useRef(false);
  useEffect(() => {
    if (live !== "live" || !refocusWhenLive.current) return;
    refocusWhenLive.current = false;
    textarea.current?.focus();
  }, [live]);

  const liveRegion = (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {state.announcement && (
        <p key={state.announcement.key}>{state.announcement.text}</p>
      )}
    </div>
  );

  const problem = state.loadProblem;
  if (problem?.kind === "not_found")
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-6">
        <h2 className="text-lg font-semibold text-fg">
          This conversation isn&apos;t available
        </h2>
        <p className="mt-1">{problem.message}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/messages">Go to your messages</Link>
        </Button>
      </div>
    );

  const readOnly = !canSend || sendBlocked;

  return (
    // Scroll position is managed above, so the browser's anchoring stays out.
    <div className="flex flex-1 flex-col gap-4 [overflow-anchor:none]">
      {liveRegion}

      {problem && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm"
        >
          <p>
            {state.phase === "ready"
              ? "We couldn't refresh this conversation. "
              : "We couldn't load this conversation. "}
            {problem.message}
          </p>
          {problem.action ? (
            <Button asChild variant="outline" size="lg">
              <Link href={problem.action.href}>{problem.action.label}</Link>
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={refreshNow}>
              Try again
            </Button>
          )}
        </div>
      )}

      {live === "degraded" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted p-3 text-sm"
        >
          <p className="min-w-0 flex-1 basis-60">
            Live updates are off, so new messages may arrive late. You can still
            send, and refresh to check for new messages.
          </p>
          <Button variant="outline" size="lg" onClick={refreshNow}>
            Refresh messages
          </Button>
        </div>
      )}
      {live === "connecting" && (
        <p role="status" className="text-sm text-muted-foreground">
          Connecting to live updates…
        </p>
      )}

      {state.nextBefore && (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => void loadOlder()}
          aria-busy={loadingOlder}
        >
          {loadingOlder ? "Loading older messages…" : "Load older messages"}
        </Button>
      )}

      {state.phase === "loading" && !problem && (
        <p role="status" className="text-center text-muted-foreground">
          Loading messages…
        </p>
      )}
      {state.phase === "ready" &&
        state.messages.length === 0 &&
        state.outbox.length === 0 && (
          <div className="rounded-lg border border-border bg-surface-muted p-6 text-center">
            <h2 className="text-lg font-semibold text-fg">No messages yet</h2>
            <p className="mt-1">
              {readOnly
                ? "Nothing has been sent in this conversation."
                : `Say hello to ${counterpart} about this booking.`}
            </p>
          </div>
        )}

      {(state.messages.length > 0 || state.outbox.length > 0) && (
        <ol
          ref={list}
          tabIndex={-1}
          aria-label="Messages"
          className="flex flex-col gap-3 focus:outline-none"
        >
          {state.messages.map((message) => (
            <FragmentWithDivider
              key={message.id}
              divider={message.id === state.firstUnreadId}
            >
              <MessageBubble
                message={message}
                own={message.sender_id === viewerId}
                counterpart={counterpart}
              />
            </FragmentWithDivider>
          ))}
          {state.outbox.map((item) => (
            <OutgoingBubble
              key={item.client_key}
              item={item}
              onRetry={() => retry(item)}
              onEdit={() => editFailed(item)}
              onDiscard={() => discard(item)}
            />
          ))}
        </ol>
      )}

      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-surface py-3">
        {!atEnd && (
          <Button
            variant="outline"
            size="lg"
            className="self-center"
            onClick={scrollToEnd}
          >
            Go to latest messages
          </Button>
        )}
        {note && !readOnly && (
          <p className="text-sm text-muted-foreground">{note}</p>
        )}
        {readOnly ? (
          <p role="status" className="text-sm">
            {CHAT_READ_ONLY_NOTE}
          </p>
        ) : (
          <ChatComposer
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setDraftError(null);
            }}
            onSubmit={submit}
            error={draftError}
            counterpart={counterpart}
            textareaRef={textarea}
          />
        )}
      </div>
      <div id="chat-end" />
    </div>
  );
}

/** A list item's "New messages" divider, kept as its own list item. */
function FragmentWithDivider({
  divider,
  children,
}: {
  divider: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {divider && (
        <li
          id="chat-first-unread"
          className="flex scroll-mt-4 items-center gap-2 text-xs font-medium text-brand-strong"
        >
          <span aria-hidden className="h-px flex-1 bg-border" />
          New messages
          <span aria-hidden className="h-px flex-1 bg-border" />
        </li>
      )}
      {children}
    </>
  );
}
