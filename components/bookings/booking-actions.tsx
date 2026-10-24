"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { apiRequest } from "@/components/listings/api-request";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookingProblem } from "@/lib/listings/booking-dates";
import {
  ACTION_COPY,
  interpretActionError,
  reasonError,
  type BookingAction,
} from "@/lib/listings/booking-status";

/**
 * Accept, decline and cancel buttons for the actions the server allows this
 * participant now. Decline and cancel ask for a reason, which the other
 * person sees. The page refreshes from the server after each action.
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
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState<BookingAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonProblem, setReasonProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<BookingProblem | null>(null);

  if (actions.length === 0) return null;

  function start(action: BookingAction) {
    setOpen(action);
    setReason("");
    setReasonProblem(null);
    setProblem(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open) return;
    const needsReason = open !== "accept";
    if (needsReason) {
      const invalid = reasonError(reason);
      setReasonProblem(invalid);
      if (invalid) return;
    }
    setPending(true);
    try {
      const result = await apiRequest(
        "POST",
        `/api/bookings/${bookingId}/actions`,
        needsReason
          ? { action: open, reason: reason.trim() }
          : { action: open },
      );
      setOpen(null);
      if (!result.ok) {
        const next = interpretActionError(result.status, result.json, returnTo);
        setProblem(next);
        if (next.refresh) router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setOpen(null);
      setProblem(interpretActionError(0, null, returnTo));
    } finally {
      setPending(false);
    }
  }

  const copy = open ? ACTION_COPY[open] : null;

  return (
    <div className="flex flex-col gap-2">
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

      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Updating booking…" : ""}
      </p>
      {problem && (
        <div role="alert" className="text-sm text-destructive">
          <p>{problem.message}</p>
          {problem.action && (
            <Link
              href={problem.action.href}
              className="font-medium text-fg underline underline-offset-4"
            >
              {problem.action.label}
            </Link>
          )}
        </div>
      )}

      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && !pending && setOpen(null)}
      >
        <DialogContent>
          {copy && (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
              </DialogHeader>
              {open !== "accept" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={reasonId}>Reason</Label>
                  <Input
                    id={reasonId}
                    value={reason}
                    maxLength={500}
                    autoComplete="off"
                    aria-invalid={Boolean(reasonProblem)}
                    aria-describedby={`${reasonId}-help`}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p
                    id={`${reasonId}-help`}
                    className={
                      reasonProblem
                        ? "text-sm text-destructive"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {reasonProblem ?? "3 to 500 characters, on one line."}
                  </p>
                </div>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={pending}>
                    Go back
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant={open === "accept" ? "default" : "destructive"}
                  disabled={pending}
                >
                  {pending ? "Saving…" : copy.confirm}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
