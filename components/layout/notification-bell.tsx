"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchNotifications,
  onNotificationsChanged,
} from "@/components/notifications/notifications-api";
import { useNotificationChannel } from "@/components/notifications/use-notification-channel";
import { unreadBadge } from "@/lib/listings/chat";
import {
  NOTIFICATIONS_PATH,
  arrivalAnnouncement,
  newRefetchGate,
  notificationBellLabel,
  runSerially,
} from "@/lib/listings/notifications";
import { BellIcon } from "./icons";

type BellState = { count: number | null; degraded: boolean };

const BellContext = createContext<BellState>({ count: null, degraded: false });

/**
 * Holds the unread count for the header's bell. The header draws one bell per
 * breakpoint, so tab order matches what's on screen, and both read this one
 * count and channel. It lives as long as the header does: across page changes,
 * until sign-out re-renders the header without it.
 */
export function NotificationBellProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState({ key: 0, text: "" });
  const known = useRef<number | null>(null);
  const refreshedForSignIn = useRef(false);

  const gate = useRef(newRefetchGate());
  const refetch = useCallback(
    () =>
      runSerially(gate.current, async () => {
        const result = await fetchNotifications(
          { page: 1, unreadOnly: true },
          NOTIFICATIONS_PATH,
          1,
        );
        if (result.ok) {
          const text = arrivalAnnouncement(known.current, result.unreadCount);
          // A new key replaces the text, so the same words are read out again.
          if (text) setAnnouncement((last) => ({ key: last.key + 1, text }));
          known.current = result.unreadCount;
          setCount(result.unreadCount);
          setFailed(false);
          return;
        }
        setFailed(true);
        // Signed out elsewhere: redraw the header once, which removes the bell
        // and its channel if the server agrees.
        if (result.problem.kind === "sign_in" && !refreshedForSignIn.current) {
          refreshedForSignIn.current = true;
          router.refresh();
        }
      }),
    [router],
  );

  const { status } = useNotificationChannel(userId, refetch);
  useEffect(() => onNotificationsChanged(() => void refetch()), [refetch]);

  const state = useMemo(
    () => ({ count, degraded: failed || status === "degraded" }),
    [count, failed, status],
  );

  return (
    <BellContext value={state}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement.text && <p key={announcement.key}>{announcement.text}</p>}
      </div>
    </BellContext>
  );
}

/** A link to the center; its name says everything the badge and marker show. */
export function NotificationBell() {
  const { count, degraded } = use(BellContext);
  const pathname = usePathname();
  const active = pathname === NOTIFICATIONS_PATH;

  return (
    <Link
      href={NOTIFICATIONS_PATH}
      aria-label={notificationBellLabel(count, degraded)}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex size-11 items-center justify-center rounded-md hover:bg-surface-muted ${
        active ? "text-brand-strong" : "text-fg"
      }`}
    >
      <BellIcon />
      {count ? (
        <span
          aria-hidden
          className="absolute top-0.5 right-0 min-w-5 rounded-full bg-brand-strong px-1 text-center text-xs leading-5 font-semibold text-brand-foreground"
        >
          {unreadBadge(count)}
        </span>
      ) : null}
      {degraded && (
        <span
          aria-hidden
          title="Live updates are off, so this may be out of date."
          className="absolute bottom-0.5 left-0.5 size-4 rounded-full border border-border bg-surface-muted text-center text-[11px] leading-[14px] font-bold text-fg"
        >
          !
        </span>
      )}
    </Link>
  );
}
