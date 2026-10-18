"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { interpretApiError, type ApiProblem } from "@/lib/listings/editor";
import {
  deleteSteps,
  listingActions,
  statusChangeBody,
  type ManagedListing,
} from "@/lib/listings/manage";
import { apiRequest } from "./api-request";

const RETURN_TO = "/owner/listings";

class StepError extends Error {
  constructor(public problem: ApiProblem) {
    super(problem.message);
  }
}

async function call(method: string, url: string, body?: unknown) {
  const response = await apiRequest(method, url, body);
  if (!response.ok)
    throw new StepError(
      interpretApiError(response.status, response.json, RETURN_TO),
    );
}

export function MyListingActions({ listing }: { listing: ManagedListing }) {
  const router = useRouter();
  const actions = listingActions(listing);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const base = `/api/catalog/listings/${listing.id}`;

  async function run(label: string, work: () => Promise<void>) {
    setProblem(null);
    setBusy(label);
    try {
      await work();
      router.refresh();
    } catch (error) {
      setProblem(
        error instanceof StepError
          ? error.problem
          : {
              message:
                "We couldn't reach Rentify. Check your connection and try again.",
            },
      );
    } finally {
      setBusy(null);
    }
  }

  const changeStatus = (status: "published" | "paused") =>
    run(status === "published" ? "Publishing…" : "Pausing…", () =>
      call("PATCH", base, statusChangeBody(listing, status)),
    );

  const remove = () =>
    run("Deleting…", async () => {
      setConfirmOpen(false);
      for (const step of deleteSteps(listing)) {
        if (step.kind === "draft")
          await call("PATCH", base, statusChangeBody(listing, "draft"));
        else if (step.kind === "photo")
          await call("DELETE", `${base}/photos/${step.photoId}`);
        else await call("DELETE", base);
      }
    });

  const disabled = busy !== null;
  const photoCount = listing.photos.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.edit.allowed && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/owner/listings/${listing.id}/edit`}>
              Edit<span className="sr-only"> {listing.title}</span>
            </Link>
          </Button>
        )}
        {listing.status !== "published" && listing.status !== "hidden" && (
          <Button
            size="sm"
            onClick={() => changeStatus("published")}
            disabled={disabled || !actions.publish.allowed}
            aria-describedby={
              actions.publish.reason ? `publish-${listing.id}` : undefined
            }
          >
            Publish<span className="sr-only"> {listing.title}</span>
          </Button>
        )}
        {actions.pause.allowed && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => changeStatus("paused")}
            disabled={disabled}
          >
            Pause<span className="sr-only"> {listing.title}</span>
          </Button>
        )}
        {listing.status !== "hidden" && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={disabled || !actions.remove.allowed}
            aria-describedby={
              actions.remove.reason ? `remove-${listing.id}` : undefined
            }
          >
            Delete<span className="sr-only"> {listing.title}</span>
          </Button>
        )}
      </div>

      {actions.publish.reason && listing.status !== "hidden" && (
        <p
          id={`publish-${listing.id}`}
          className="text-sm text-muted-foreground"
        >
          {actions.publish.reason}
        </p>
      )}
      {actions.remove.reason && listing.status !== "hidden" && (
        <p
          id={`remove-${listing.id}`}
          className="text-sm text-muted-foreground"
        >
          {actions.remove.reason}
        </p>
      )}

      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground empty:hidden"
      >
        {busy ?? ""}
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this listing?</DialogTitle>
            <DialogDescription>
              &ldquo;{listing.title}&rdquo; will be removed permanently
              {photoCount > 0
                ? `, along with its ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`
                : ""}
              .{" "}
              {listing.status === "published" &&
                "Renters will no longer see it. "}
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep listing</Button>
            </DialogClose>
            <Button variant="destructive" onClick={remove}>
              Delete listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
