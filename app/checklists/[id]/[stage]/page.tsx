import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  checklistId,
  checklistSchema,
  stageSchema,
} from "@/lib/checklists/validation";
import { ChecklistForm } from "./checklist-form";

export const metadata = { title: "Rental checklist | Rentify" };

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ id: string; stage: string }>;
}) {
  const path = await params;
  const id = checklistId.safeParse(path.id);
  const stage = stageSchema.safeParse(path.stage);
  if (!id.success || !stage.success) notFound();
  await requireUser(`/checklists/${id.data}/${stage.data}`);
  const client = await createClient();
  const result = await client.rpc("get_condition_checklist", {
    p_booking: id.data,
    p_stage: stage.data,
  });
  if (result.error?.code === "P0001" && result.error.message === "not_found")
    notFound();
  const report = checklistSchema.safeParse(result.data);
  const title =
    stage.data === "handover" ? "Handover checklist" : "Return checklist";

  return (
    <>
      <header className="space-y-2">
        <nav
          aria-label="Checklist navigation"
          className="flex flex-wrap gap-4 text-sm text-primary underline underline-offset-4"
        >
          <Link href="/checklists">All checklists</Link>
          <Link href={`/bookings/${id.data}`}>Booking details</Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">
          The owner and renter each confirm once the device has changed hands.
        </p>
      </header>
      {report.success ? (
        <ChecklistForm initial={report.data} />
      ) : (
        <p role="alert">
          We couldn&apos;t load this checklist. Refresh to try again.
        </p>
      )}
    </>
  );
}
