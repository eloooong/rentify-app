"use client";

import { useState } from "react";
import { apiRequest } from "@/components/listings/api-request";
import { Button } from "@/components/ui/button";
import type { BookingProblem } from "@/lib/listings/booking-dates";
import type { BookingRole } from "@/lib/listings/booking-status";
import { interpretRefundError, paidCancelCopy } from "@/lib/listings/refunds";
import { BookingProblemAlert, ReasonDialog } from "./reason-dialog";
import { useRefreshFocus } from "./use-refresh-focus";

/**
 * "Cancel and refund" for a paid booking, shown only while B's refund status
 * says this participant may cancel. The database rechecks the cutoff and
 * records the full refund in the same step; the page then refreshes. The
 * page keeps this mounted when the button goes away, so an error explaining
 * a refused cancellation stays visible after that refresh.
 */
export function PaidCancellation({
  available,
  bookingId,
  role,
  total,
  returnTo,
}: {
  available: boolean;
  bookingId: string;
  role: BookingRole;
  total: number;
  returnTo: string;
}) {
  const { root, refresh } = useRefreshFocus<HTMLDivElement>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<BookingProblem | null>(null);
  const [done, setDone] = useState(false);
  const copy = paidCancelCopy(role, total);

  async function submit(reason: string) {
    setPending(true);
    try {
      const result = await apiRequest(
        "POST",
        `/api/bookings/${bookingId}/cancellation`,
        { reason },
      );
      setOpen(false);
      if (!result.ok) {
        const next = interpretRefundError(result.status, result.json, returnTo);
        setProblem(next);
        if (next.refresh) refresh();
        return;
      }
      setDone(true);
      refresh();
    } catch {
      setOpen(false);
      setProblem(interpretRefundError(0, null, returnTo));
    } finally {
      setPending(false);
    }
  }

  // Stay mounted after cancelling so the result can still be announced.
  if (!available && !problem && !done) return null;

  return (
    <div ref={root} className="flex flex-col gap-2">
      {available && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-fit"
          disabled={pending}
          onClick={() => {
            setOpen(true);
            setProblem(null);
            setDone(false);
          }}
        >
          {copy.label}
        </Button>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {pending
          ? "Cancelling booking…"
          : done
            ? "Booking cancelled. The refund status is shown on this page."
            : ""}
      </p>
      {problem && <BookingProblemAlert problem={problem} />}

      <ReasonDialog
        copy={open ? copy : null}
        askReason
        destructive
        pending={pending}
        onClose={() => setOpen(false)}
        onConfirm={submit}
      />
    </div>
  );
}
