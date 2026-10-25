"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
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
import { reasonError } from "@/lib/listings/booking-status";

/** The error shown after a booking change fails, with its next step. */
export function BookingProblemAlert({ problem }: { problem: BookingProblem }) {
  return (
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
  );
}

export type ReasonDialogCopy = {
  title: string;
  description: string;
  confirm: string;
};

/**
 * Confirmation dialog for booking changes. When `askReason` is set it asks
 * for a reason, checked like the server does, and passes it on trimmed. The
 * form remounts each time the dialog opens, so it starts empty.
 */
export function ReasonDialog({
  copy,
  askReason,
  destructive,
  pending,
  onClose,
  onConfirm,
}: {
  /** Null while the dialog is closed. */
  copy: ReasonDialogCopy | null;
  askReason: boolean;
  destructive: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  // Radix returns focus only to a DialogTrigger; these dialogs open from
  // plain buttons, so remember the button and focus it again on close.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog
      open={copy !== null}
      onOpenChange={(next) => !next && !pending && onClose()}
    >
      <DialogContent
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}
      >
        {copy && (
          <ReasonForm
            copy={copy}
            askReason={askReason}
            destructive={destructive}
            pending={pending}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  copy,
  askReason,
  destructive,
  pending,
  onConfirm,
}: {
  copy: ReasonDialogCopy;
  askReason: boolean;
  destructive: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [reasonProblem, setReasonProblem] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (askReason) {
      const invalid = reasonError(reason);
      setReasonProblem(invalid);
      if (invalid) return;
    }
    onConfirm(reason.trim());
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      {askReason && (
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
          variant={destructive ? "destructive" : "default"}
          disabled={pending}
        >
          {pending ? "Saving…" : copy.confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}
