"use client";

import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

// Shown when a page in this section fails to load (provider or network
// failure). Missing records use the nearest not-found.tsx instead.
export default function MessagesError({ retry }: { retry: () => void }) {
  return (
    <PageState
      alert
      title={<>We couldn&apos;t load your messages</>}
      actions={
        <>
          <Button onClick={retry}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/bookings">Go to your bookings</Link>
          </Button>
        </>
      }
    >
      <p>Please try again in a moment.</p>
    </PageState>
  );
}
