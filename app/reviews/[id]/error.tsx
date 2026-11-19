"use client";

import { Button } from "@/components/ui/button";

// Shown when reviews could not be loaded (provider or network failure). An
// unknown member uses the default not-found page instead.
export default function ReviewsError({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 py-16 sm:px-6"
    >
      <h1 className="text-2xl font-semibold text-fg">
        We couldn&apos;t load these reviews
      </h1>
      <p>Please try again in a moment.</p>
      <Button onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
