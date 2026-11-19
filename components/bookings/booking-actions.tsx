"use client";

import { useState } from "react";
import { apiRequest } from "@/components/listings/api-request";
import { Button } from "@/components/ui/button";
import type { BookingProblem } from "@/lib/listings/booking-dates";
import {
  ACTION_COPY,
  interpretActionError,
  type BookingAction,
} from "@/lib/listings/booking-status";
import { BookingProblemAlert, ReasonDialog } from "./reason-dialog";
import { useRefreshFocus } from "./use-refresh-focus";

/**
 * Accept, decline and cancel buttons for the actions the server allows this
 * participant now. Decline and cancel ask for a reason, which the other
 * person sees. The page refreshes from the server after each action; the
 * result is announced and focus stays on the page when the button goes away.
 */
export function BookingActions({
  bookingId,
  actions,
  returnTo,
}: {
  bookingId: string;
  actions: BookingAction[];
  returnTo: string;
}) {
  const { root, refresh } = useRefreshFocus<HTMLDivElement>();
  const [open, setOpen] = useState<BookingAction | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<BookingProblem | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Stay mounted after the last action so its result can still be announced.
  if (actions.length === 0 && !done && !problem) return null;

  function start(action: BookingAction) {
    setOpen(action);
    setProblem(null);
    setDone(null);
  }

  async function submit(reason: string) {
    if (!open) return;
    setPending(true);
    try {
      const result = await apiRequest(
        "POST",
        `/api/bookings/${bookingId}/actions`,
        open !== "accept" ? { action: open, reason } : { action: open },
      );
      setOpen(null);
      if (!result.ok) {
        const next = interpretActionError(result.status, result.json, returnTo);
        setProblem(next);
        if (next.refresh) refresh();
        return;
      }
      setDone(ACTION_COPY[open].done);
      refresh();
    } catch {
      setOpen(null);
      setProblem(interpretActionError(0, null, returnTo));
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={root} className="flex flex-col gap-2">
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant={
                action === "accept"
                  ? "default"
                  : action === "decline"
                    ? "outline"
                    : "secondary"
              }
              disabled={pending}
              onClick={() => start(action)}
            >
              {ACTION_COPY[action].label}
            </Button>
          ))}
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Updating booking…" : (done ?? "")}
      </p>
      {problem && <BookingProblemAlert problem={problem} />}

      <ReasonDialog
        copy={open ? ACTION_COPY[open] : null}
        askReason={open !== "accept"}
        destructive={open !== "accept"}
        pending={pending}
        onClose={() => setOpen(null)}
        onConfirm={submit}
      />
    </div>
  );
}
