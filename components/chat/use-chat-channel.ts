"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REALTIME_START,
  realtimeIsLive,
  realtimeStatus,
  realtimeStep,
  type RealtimeEvent,
} from "@/lib/listings/chat";
import { createClient } from "@/lib/supabase/browser";

/** Same limit as Person B's local Realtime tests, which allow a cold start. */
const READINESS_TIMEOUT_MS = 30_000;

/**
 * Listens for changes to one conversation, following lib/chat/README.md. The
 * events carry no data the page uses: `onHint` only says "refetch", including
 * when the channel becomes ready and after a token refresh. Register this
 * before the thread's first fetch. The channel goes away on navigation and
 * sign-out.
 */
export function useChatChannel(conversationId: string, onHint: () => void) {
  const [flags, setFlags] = useState(REALTIME_START);
  const [attempt, setAttempt] = useState(0);
  const hint = useRef(onHint);
  useEffect(() => {
    hint.current = onHint;
  }, [onHint]);

  useEffect(() => {
    const client = createClient();
    // After a manual reconnect, stay degraded until readiness is earned again.
    let current =
      attempt > 0 ? { ...REALTIME_START, failed: true } : REALTIME_START;
    let active = true;

    function apply(event: RealtimeEvent) {
      if (!active) return;
      const next = realtimeStep(current, event);
      const becameLive = !realtimeIsLive(current) && realtimeIsLive(next);
      current = next;
      setFlags(next);
      if (becameLive) hint.current();
    }

    const filter = `conversation_id=eq.${conversationId}`;
    // A unique name, so a remount never reuses a channel that is still closing.
    const channel = client
      .channel(`chat:${conversationId}:${crypto.randomUUID()}`, {
        // Requests the readiness signal; no Broadcast messages are sent.
        config: { broadcast: { replication_ready: true } },
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        () => hint.current(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter },
        () => hint.current(),
      )
      .on("system", {}, (payload: { extension?: string; status?: string }) =>
        apply({
          kind: "system",
          extension: payload.extension,
          status: payload.status,
        }),
      );

    const timer = setTimeout(
      () => apply({ kind: "timeout" }),
      READINESS_TIMEOUT_MS,
    );
    // A session restored from cookies doesn't reach the socket by itself, and
    // a join without the token counts as anonymous, which RLS refuses. So the
    // socket gets the signed-in user's token before joining.
    const subscribe = () => {
      if (!active) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") apply({ kind: "joined" });
        else apply({ kind: "disconnected" });
      });
    };
    client.realtime
      .setAuth()
      .then(subscribe, () => apply({ kind: "disconnected" }));

    const { data: auth } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") void client.removeChannel(channel);
      else if (event === "TOKEN_REFRESHED") hint.current();
    });

    return () => {
      active = false;
      clearTimeout(timer);
      auth.subscription.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [conversationId, attempt]);

  const reconnect = useCallback(() => setAttempt((value) => value + 1), []);

  return { status: realtimeStatus(flags), reconnect };
}
