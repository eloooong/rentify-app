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

/** Same limit as the chat channel, which allows for a cold start. */
const READINESS_TIMEOUT_MS = 30_000;

/** While live updates are down, HTTP keeps the view roughly current. */
const DEGRADED_POLL_MS = 30_000;

/**
 * Keeps one view of the signed-in user's notifications current, following
 * lib/notifications/README.md. Events carry nothing the page uses: `refetch`
 * only re-reads the API. It also runs on first load, when the channel becomes
 * ready, after a token refresh, when the tab comes back and, while degraded,
 * on a timer. The channel goes away with the component and on sign-out, and a
 * failure here never breaks the page around it.
 */
export function useNotificationChannel(userId: string, refetch: () => void) {
  const [flags, setFlags] = useState(REALTIME_START);
  const [attempt, setAttempt] = useState(0);
  const hint = useRef(refetch);
  useEffect(() => {
    hint.current = refetch;
  }, [refetch]);

  useEffect(() => {
    // After a manual reconnect, stay degraded until readiness is earned again.
    let current =
      attempt > 0 ? { ...REALTIME_START, failed: true } : REALTIME_START;
    let active = true;
    let teardown = () => {};

    function apply(event: RealtimeEvent) {
      if (!active) return;
      const next = realtimeStep(current, event);
      const becameLive = !realtimeIsLive(current) && realtimeIsLive(next);
      current = next;
      setFlags(next);
      if (becameLive) hint.current();
    }

    async function start() {
      const client = createClient();
      const filter = `user_id=eq.${userId}`;
      // A unique name, so a remount never reuses a channel that is still closing.
      const channel = client
        .channel(`notifications:${userId}:${crypto.randomUUID()}`, {
          // Requests the readiness signal; no Broadcast messages are sent.
          config: { broadcast: { replication_ready: true } },
        })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter },
          () => hint.current(),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter },
          () => hint.current(),
        )
        .on("system", {}, (payload: { extension?: string; status?: string }) =>
          apply({
            kind: "system",
            extension: payload.extension,
            status: payload.status,
          }),
        );

      const { data: auth } = client.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") void client.removeChannel(channel);
        else if (event === "TOKEN_REFRESHED") hint.current();
      });
      teardown = () => {
        auth.subscription.unsubscribe();
        void client.removeChannel(channel);
      };

      // A session restored from cookies doesn't reach the socket by itself, and
      // a join without the token counts as anonymous, which RLS refuses. So the
      // socket gets the signed-in user's token before joining.
      await client.realtime.setAuth();
      if (!active) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") apply({ kind: "joined" });
        else apply({ kind: "disconnected" });
      });
    }

    const timer = setTimeout(
      () => apply({ kind: "timeout" }),
      READINESS_TIMEOUT_MS,
    );
    start().catch(() => apply({ kind: "disconnected" }));

    return () => {
      active = false;
      clearTimeout(timer);
      teardown();
    };
  }, [userId, attempt]);

  const status = realtimeStatus(flags);

  // Declared after the channel, so its listeners are registered before the
  // first fetch, as the contract requires.
  useEffect(() => {
    refetch();
    function onVisibility() {
      if (document.visibilityState === "visible") refetch();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refetch]);

  useEffect(() => {
    if (status !== "degraded") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, DEGRADED_POLL_MS);
    return () => clearInterval(timer);
  }, [refetch, status]);

  const reconnect = useCallback(() => setAttempt((value) => value + 1), []);

  return { status, reconnect };
}
