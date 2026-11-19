"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Refreshes the page after a booking change and keeps keyboard focus on the
 * page. The button that started the change often disappears once the server
 * re-renders (an accepted request has no Accept button), which would drop
 * focus to <body>. When that happens, focus moves to the `[data-booking-focus]`
 * heading inside the nearest `[data-booking-scope]`, or to <main>.
 */
export function useRefreshFocus<T extends HTMLElement>() {
  const router = useRouter();
  const root = useRef<T>(null);
  const [refreshing, startRefresh] = useTransition();
  const refocus = useRef(false);

  useEffect(() => {
    if (refreshing || !refocus.current) return;
    refocus.current = false;
    const active = document.activeElement;
    // Leave focus alone if it is still somewhere useful. Inside a closing
    // dialog counts as lost: its opener may be gone by the time it closes.
    if (
      active &&
      active !== document.body &&
      !active.closest('[role="dialog"]')
    )
      return;
    const scope = root.current?.closest("[data-booking-scope]");
    const target =
      scope?.querySelector<HTMLElement>("[data-booking-focus]") ??
      document.getElementById("main-content");
    target?.focus();
  }, [refreshing]);

  function refresh() {
    refocus.current = true;
    startRefresh(() => router.refresh());
  }

  return { root, refresh };
}
