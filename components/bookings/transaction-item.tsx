import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatManilaTime } from "@/lib/listings/booking-status";
import type { HistoryItem } from "@/lib/listings/bookings";
import { formatMoney } from "@/lib/listings/format";
import { transactionView, type TransactionTone } from "@/lib/listings/history";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<TransactionTone, string> = {
  active: "bg-secondary text-secondary-foreground",
  pending: "bg-surface-tint text-brand-strong",
  problem: "bg-destructive/10 text-destructive",
  closed: "border-border bg-transparent text-muted-foreground",
};

/** One payment or refund attempt, linking to its booking. */
export function TransactionItem({ item }: { item: HistoryItem }) {
  const view = transactionView(item);
  const money = (amount: number) => formatMoney(amount, item.currency);
  const title = item.listingTitle ?? "Listing unavailable";
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">{view.typeLabel}</span>
          <Badge className={cn(TONE_CLASS[view.tone])}>{view.stateLabel}</Badge>
        </div>
        <span className="text-lg font-semibold text-fg">
          {money(item.amount)}
        </span>
      </div>
      <h2 className="font-medium text-fg">
        <Link
          href={`/bookings/${item.booking_id}`}
          className="rounded-sm underline-offset-4 hover:text-brand-strong hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {title}
          <span className="sr-only">, view booking</span>
        </Link>
      </h2>
      <p className="text-sm text-muted-foreground">
        {view.roleLabel} · {formatManilaTime(item.occurred_at)}
        {view.detail && <> · {view.detail}</>}
      </p>
      {view.breakdown ? (
        <p className="text-sm">
          Rent {money(view.breakdown.rent)} · Deposit{" "}
          {money(view.breakdown.deposit)}
        </p>
      ) : (
        item.type === "payment" && (
          <p className="text-sm text-muted-foreground">
            No rent and deposit breakdown, because this payment doesn&apos;t
            match its checkout.
          </p>
        )
      )}
      <p className="text-sm">{view.note}</p>
    </li>
  );
}
