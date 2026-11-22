import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

export default function ListingNotFound() {
  return (
    <PageState
      title={<>This listing isn&apos;t available</>}
      actions={
        <Button asChild>
          <Link href="/listings">Browse other devices</Link>
        </Button>
      }
    >
      <p>
        It may have been paused or removed by its owner, or the link may be
        wrong.
      </p>
    </PageState>
  );
}
