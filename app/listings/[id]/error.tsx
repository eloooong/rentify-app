"use client";

import { Button } from "@/components/ui/button";

// Shown when the listing could not be loaded (provider or network failure).
// A missing or unpublished listing uses not-found.tsx instead.
export default function ListingError({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 py-16 sm:px-6"
    >
      <h1 className="text-2xl font-semibold text-fg">
        We couldn&apos;t load this listing
      </h1>
      <p>Please try again in a moment.</p>
      <Button onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
