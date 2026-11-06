"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  checklistItems,
  checklistSchema,
  type Checklist,
} from "@/lib/checklists/validation";

export function ChecklistForm({ initial }: { initial: Checklist }) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const base = `/api/checklists/${report.booking_id}/${report.stage}`;
  const confirmed = report[`${report.role}_confirmed_at`];
  const both = report.owner_confirmed_at && report.renter_confirmed_at;

  async function send(url: string, init: RequestInit, success: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, init);
      const payload = await response.json();
      if (!response.ok) {
        setError(
          payload?.error?.message ??
            "Try again or refresh to check the current status.",
        );
        return;
      }
      setReport(checklistSchema.parse(payload.data));
      setMessage(success);
      if (init.body instanceof File) setPhoto(null);
    } catch {
      setError("Refresh to check whether your changes were saved.");
    } finally {
      setBusy(false);
    }
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const checks = Object.fromEntries(
      checklistItems.map(([id]) => [id, fields.get(id) === "on"]),
    );
    void send(
      base,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks, note: fields.get("note") }),
      },
      "Your confirmation was saved.",
    );
  }

  return (
    <div className="space-y-6">
      <section
        aria-label="Confirmation status"
        className="rounded-lg border bg-card"
      >
        <p className="border-b p-4 font-medium">
          {both
            ? report.stage === "return"
              ? "Both confirmed the return"
              : "Both confirmed handover"
            : confirmed
              ? "Waiting for the other participant"
              : report.can_confirm
                ? "Ready for your confirmation"
                : "Confirmation is currently closed"}
        </p>
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {(["owner", "renter"] as const).map((side) => (
            <div key={side} className="min-w-0 space-y-2 p-4">
              <h2 className="font-medium capitalize">
                {side}
                {report.role === side && " (you)"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {report[`${side}_confirmed_at`]
                  ? "Confirmed"
                  : "Awaiting confirmation"}
              </p>
              {report[`${side}_note`] && (
                <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                  {report[`${side}_note`]}
                </p>
              )}
              {report[`${side}_photo`] && (
                <Link
                  href={`${base}/photos/${side}`}
                  className="inline-block text-sm text-primary underline underline-offset-4"
                >
                  View {side} photo
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>
      {report.stage === "return" && (
        <p className="text-sm text-muted-foreground">
          This confirmation records physical return. Condition approval and
          deposit settlement are separate steps.
        </p>
      )}
      {report.can_confirm && (
        <>
          {!report[`${report.role}_photo`] && (
            <section
              aria-labelledby="photo-title"
              className="space-y-3 rounded-lg border p-4"
            >
              <h2 id="photo-title" className="font-medium">
                Private evidence photo
              </h2>
              <p id="photo-help" className="text-sm text-muted-foreground">
                Optional. Both participants can view it. Choose one JPEG, PNG,
                or WebP photo up to 4 MiB. A saved photo cannot be replaced.
              </p>
              <label htmlFor="evidence" className="block text-sm font-medium">
                Choose a photo
              </label>
              <input
                id="evidence"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="photo-help"
                className="block max-w-full rounded border p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                disabled={busy}
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!photo || busy}
                onClick={() => {
                  if (photo)
                    void send(
                      `${base}/photos/${report.role}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": photo.type },
                        body: photo,
                      },
                      "Your private photo was saved.",
                    );
                }}
              >
                Save photo
              </Button>
            </section>
          )}
          <form onSubmit={confirm} className="space-y-4 rounded-lg border p-4">
            <fieldset disabled={busy} className="space-y-3">
              <legend className="mb-2 font-medium">Before you confirm</legend>
              {checklistItems.map(([id, label]) => (
                <label
                  key={id}
                  className="flex min-h-10 items-start gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name={id}
                    required
                    className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                  />
                  {label}
                </label>
              ))}
              <label
                htmlFor="condition-note"
                className="block text-sm font-medium"
              >
                Condition notes (optional)
              </label>
              <textarea
                id="condition-note"
                name="note"
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              />
            </fieldset>
            {photo && (
              <p className="text-sm text-muted-foreground">
                Save your selected photo or clear it before confirming.
              </p>
            )}
            <Button type="submit" disabled={busy || !!photo}>
              {report.stage === "return"
                ? "Confirm return"
                : "Confirm handover"}
            </Button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
      {report.stage === "handover" && both && (
        <Link
          href={`/checklists/${report.booking_id}/return`}
          className="text-sm text-primary underline underline-offset-4"
        >
          Open return checklist
        </Link>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => void send(base, {}, "Checklist refreshed.")}
      >
        Refresh status
      </Button>
    </div>
  );
}
