"use client";

import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

// Shown when reviews could not be loaded (provider or network failure). An
// unknown member uses not-found.tsx instead.
export default function ReviewsError({ retry }: { retry: () => void }) {
  return (
    <PageState
      alert
      title={<>We couldn&apos;t load these reviews</>}
      actions={<Button onClick={retry}>Try again</Button>}
    >
      <p>Please try again in a moment.</p>
    </PageState>
  );
}
