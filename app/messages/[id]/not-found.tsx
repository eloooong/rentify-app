import Link from "next/link";
import { PageState } from "@/components/layout/page-state";
import { Button } from "@/components/ui/button";

export default function ConversationNotFound() {
  return (
    <PageState
      title={<>We couldn&apos;t find that conversation</>}
      actions={
        <Button asChild>
          <Link href="/messages">Go to your messages</Link>
        </Button>
      }
    >
      <p>
        It may belong to another account, or the link may be wrong. You can only
        see conversations for bookings you&apos;re part of.
      </p>
    </PageState>
  );
}
