import { Badge } from "@/components/ui/badge";
import { formatManilaTime } from "@/lib/listings/booking-status";
import { formatMoney } from "@/lib/listings/format";
import type { RefundView } from "@/lib/listings/refunds";
import { cn } from "@/lib/utils";

const HEADLINE_CLASS: Record<RefundView["headline"], string> = {
  "Refund pending": "bg-surface-tint text-brand-strong",
  "Refund needs review": "bg-destructive/10 text-destructive",
  Refunded: "bg-secondary text-secondary-foreground",
};

/**
 * Refund amounts and each refund attempt for a booking. "Pending" covers
 * every recorded refund the payment provider hasn't confirmed yet.
 */
export function RefundStatusPanel({ view }: { view: RefundView }) {
  const money = (amount: number) => formatMoney(amount, "PHP");
  return (
    <section
      aria-labelledby="refund-heading"
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="refund-heading" className="text-lg font-semibold text-fg">
          Refund
        </h2>
        <Badge className={cn(HEADLINE_CLASS[view.headline])}>
          {view.headline}
        </Badge>
      </div>
      <p>{view.summary}</p>
      <dl className="divide-y divide-border rounded-lg border border-border text-sm">
        <div className="flex justify-between gap-4 px-4 py-2">
          <dt className="text-muted-foreground">Pending</dt>
          <dd className="font-medium text-fg">{money(view.pendingAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-2">
          <dt className="text-muted-foreground">Refunded</dt>
          <dd className="font-medium text-fg">{money(view.refundedAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-2">
          <dt className="text-muted-foreground">Total refund</dt>
          <dd className="font-medium text-fg">{money(view.totalAmount)}</dd>
        </div>
      </dl>
      {view.attempts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-fg">Refund attempts</h3>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {view.attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2"
              >
                <span className="font-medium text-fg">
                  {money(attempt.amount)} · {attempt.label}
                </span>
                <span className="text-muted-foreground">
                  Updated {formatManilaTime(attempt.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Test mode: no real money moves. Times are in Manila time.
      </p>
    </section>
  );
}
