import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const metadata = { title: "Rental checklists | Rentify" };

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .catch(1)
    .parse((await searchParams).page);
  const user = await requireUser(
    page > 1 ? `/checklists?page=${page}` : "/checklists",
  );
  const client = await createClient();
  const size = 20;
  const { data, error, count } = await client
    .from("bookings")
    .select("id,status,owner_id,listings(title)", { count: "exact" })
    .in("status", ["paid", "handed_over", "returned", "completed", "disputed"])
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * size, page * size - 1);

  return (
    <>
      <header className="space-y-2">
        <Link
          href="/account"
          className="text-sm text-primary underline underline-offset-4"
        >
          Your account
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          Rental checklists
        </h1>
        <p className="text-muted-foreground">
          Check the device, record its condition, and confirm when it changes
          hands.
        </p>
      </header>
      {error ? (
        <p role="alert">
          We couldn&apos;t load your checklists. Refresh to try again.
        </p>
      ) : data.length === 0 ? (
        <p>
          No checklists on this page. Checklists are available for paid rentals.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.map((booking) => (
            <li key={booking.id} className="space-y-3 p-4">
              <div>
                <p className="font-medium">
                  {booking.listings?.title ?? "Rental booking"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {booking.owner_id === user.id ? "Owner" : "Renter"} ·{" "}
                  {booking.status.replace("_", " ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary underline underline-offset-4">
                <Link href={`/checklists/${booking.id}/handover`}>
                  Handover checklist
                </Link>
                {booking.status !== "paid" && (
                  <Link href={`/checklists/${booking.id}/return`}>
                    Return checklist
                  </Link>
                )}
                <Link href={`/bookings/${booking.id}`}>Booking details</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!error && (page > 1 || (count ?? 0) > page * size) && (
        <nav
          aria-label="Checklist pages"
          className="flex flex-wrap gap-4 text-sm text-primary underline underline-offset-4"
        >
          {page > 1 && (
            <Link href={`/checklists?page=${page - 1}`}>Previous page</Link>
          )}
          {(count ?? 0) > page * size && page < 1000 && (
            <Link href={`/checklists?page=${page + 1}`}>Next page</Link>
          )}
        </nav>
      )}
    </>
  );
}
