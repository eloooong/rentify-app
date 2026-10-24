"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { apiRequest } from "@/components/listings/api-request";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Booking } from "@/lib/bookings/validation";
import type { BookingProblem } from "@/lib/listings/booking-dates";
import { formatManilaTime } from "@/lib/listings/booking-status";
import {
  PAYMENT_POLICY_VERSION,
  PAYMENT_RULES,
  POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
  checkoutView,
  interpretCheckoutError,
  safeCheckoutUrl,
} from "@/lib/listings/checkout";
import { formatMoney } from "@/lib/listings/format";
import type { CheckoutStatus } from "@/lib/payments/validation";

type Props = {
  booking: Pick<
    Booking,
    "id" | "status" | "is_expired" | "payment_expires_at" | "currency"
  >;
  total: number;
  initialCheckout: CheckoutStatus | null;
};

/**
 * Consent, processing, hand-off to PayMongo's hosted page and the result
 * states (A2.3). Every state comes from GET /api/bookings/:id/checkout;
 * returning from the provider proves nothing by itself.
 */
export function CheckoutFlow({ booking, total, initialCheckout }: Props) {
  const router = useRouter();
  const consentId = useId();
  const returnTo = `/checkout/${booking.id}`;
  const endpoint = `/api/bookings/${booking.id}/checkout`;
  const [checkout, setCheckout] = useState(initialCheckout);
  const [consent, setConsent] = useState(false);
  const [consentProblem, setConsentProblem] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<BookingProblem | null>(null);
  const [polls, setPolls] = useState(0);

  const view = checkoutView(booking, checkout);
  const money = (amount: number) => formatMoney(amount, booking.currency);
  const waiting =
    view.kind === "creating" || (view.kind === "open" && !view.url);

  // While PayMongo's session is being created, poll for its link.
  useEffect(() => {
    if (!waiting || polls >= POLL_ATTEMPTS) return;
    const timer = setTimeout(async () => {
      const result = await apiRequest("GET", endpoint).catch(() => null);
      if (result?.ok) setCheckout(result.json?.data ?? null);
      setPolls((count) => count + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [waiting, polls, endpoint]);

  async function refreshStatus() {
    setPending(true);
    setProblem(null);
    try {
      const result = await apiRequest("GET", endpoint);
      if (!result.ok) {
        setProblem(
          interpretCheckoutError(result.status, result.json, returnTo),
        );
        return;
      }
      setCheckout(result.json?.data ?? null);
      setPolls(0);
      router.refresh();
    } catch {
      setProblem(interpretCheckoutError(0, null, returnTo));
    } finally {
      setPending(false);
    }
  }

  async function start() {
    if (!consent) {
      setConsentProblem(true);
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      const result = await apiRequest("POST", endpoint, {
        policy_version: PAYMENT_POLICY_VERSION,
      });
      if (result.ok && result.json?.data) {
        setCheckout(result.json.data);
        setPolls(0);
        return;
      }
      const next = interpretCheckoutError(result.status, result.json, returnTo);
      setProblem(next);
      if (next.refresh) router.refresh();
    } catch {
      setProblem(interpretCheckoutError(0, null, returnTo));
    } finally {
      setPending(false);
    }
  }

  const problemAlert = problem && (
    <div role="alert" className="text-sm text-destructive">
      <p>{problem.message}</p>
      {problem.action && (
        <Link
          href={problem.action.href}
          className="font-medium text-fg underline underline-offset-4"
        >
          {problem.action.label}
        </Link>
      )}
    </div>
  );
  const bookingLink = (
    <Link
      href={`/bookings/${booking.id}`}
      className="w-fit text-sm font-medium text-fg underline underline-offset-4 hover:text-brand-strong"
    >
      Back to the booking
    </Link>
  );
  const deadline = booking.payment_expires_at
    ? `${formatManilaTime(booking.payment_expires_at)} (Manila time)`
    : null;

  if (view.kind === "start")
    return (
      <div className="flex flex-col gap-4">
        {deadline && (
          <p className="rounded-md bg-surface-tint p-3 text-sm">
            Pay by <span className="font-semibold text-fg">{deadline}</span> or
            the dates are released.
          </p>
        )}
        <section
          aria-labelledby="rules-heading"
          className="flex flex-col gap-2"
        >
          <h2 id="rules-heading" className="text-lg font-semibold text-fg">
            Payment and refund rules
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {PAYMENT_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
        <div className="flex items-start gap-3">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            aria-invalid={consentProblem && !consent}
            aria-describedby={
              consentProblem && !consent ? `${consentId}-error` : undefined
            }
            onChange={(event) => {
              setConsent(event.target.checked);
              setConsentProblem(false);
            }}
            className="mt-1 size-4 accent-brand-strong"
          />
          <label htmlFor={consentId} className="text-sm">
            I&apos;ve read the payment and refund rules and agree to them.
          </label>
        </div>
        {consentProblem && !consent && (
          <p id={`${consentId}-error`} className="text-sm text-destructive">
            Tick the box to agree to the rules before paying.
          </p>
        )}
        {problemAlert}
        <Button
          type="button"
          className="w-full sm:w-fit"
          disabled={pending}
          onClick={() => void start()}
        >
          {pending
            ? "Starting checkout…"
            : `Continue to GCash test payment · ${money(total)}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          You&apos;ll pay on PayMongo&apos;s page. Come back here afterwards to
          see the result.
        </p>
      </div>
    );

  if (waiting)
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="rounded-md bg-surface-muted p-3 text-sm">
          {polls < POLL_ATTEMPTS
            ? "Setting up your test checkout… This usually takes a few seconds."
            : "Checkout is taking longer than usual. Don't start another payment. Check again in a moment."}
        </p>
        {polls >= POLL_ATTEMPTS && (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={pending}
            onClick={() => void refreshStatus()}
          >
            {pending ? "Checking…" : "Check again"}
          </Button>
        )}
        {problemAlert}
      </div>
    );

  if (view.kind === "open") {
    const url = safeCheckoutUrl(view.url);
    return (
      <div className="flex flex-col gap-3">
        {deadline && (
          <p className="text-sm">
            Pay by <span className="font-semibold text-fg">{deadline}</span>.
          </p>
        )}
        {url ? (
          <a
            href={url}
            rel="noopener noreferrer"
            className={buttonVariants({ className: "w-full sm:w-fit" })}
          >
            Pay {money(total)} with GCash (test)
          </a>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            The checkout link looks wrong, so we&apos;re not showing it. Check
            again in a moment.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={pending}
          onClick={() => void refreshStatus()}
        >
          {pending ? "Checking…" : "I've paid. Check the status"}
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          Payment is confirmed only when PayMongo tells Rentify, which can take
          a minute. Don&apos;t pay twice.
        </p>
        {problemAlert}
      </div>
    );
  }

  const outcome = {
    paid: {
      title: "Payment received",
      body: "Your booking is confirmed. Meet at the pickup area on the pickup date.",
      tone: "bg-surface-tint",
    },
    expired: {
      title: "Payment window closed",
      body: "The 30 minutes to pay ran out, so the dates were released. Nothing was charged. You can send a new request.",
      tone: "bg-surface-muted",
    },
    refund_due: {
      title:
        view.kind === "refund_due" && view.amount === 0
          ? "Payment refunded"
          : "Refund owed",
      body:
        view.kind === "refund_due" && view.amount > 0
          ? `Your payment reached Rentify after the booking had closed. A refund of ${money(view.amount)} is recorded and will go back to your GCash account. It isn't complete yet.`
          : "Your payment reached Rentify after the booking had closed. The refund for it has been processed.",
      tone: "bg-surface-muted",
    },
    review: {
      title: "We're checking this payment",
      body: "Something about this payment needs a manual check. Don't pay again. We'll update the booking when the check is done.",
      tone: "bg-surface-muted",
    },
    closed: {
      title:
        view.kind === "closed" && view.reason === "not_accepted"
          ? "Not ready for payment"
          : "This booking can't be paid",
      body:
        view.kind === "closed" && view.reason === "not_accepted"
          ? "The owner hasn't accepted this request yet. You can pay once they do."
          : "The booking is no longer waiting for payment. Nothing was charged.",
      tone: "bg-surface-muted",
    },
  }[view.kind];

  return (
    <div className="flex flex-col gap-3">
      <div role="status" className={`rounded-md p-4 ${outcome.tone}`}>
        <p className="text-base font-semibold text-fg">{outcome.title}</p>
        <p className="mt-1 text-sm">{outcome.body}</p>
      </div>
      {problemAlert}
      {bookingLink}
    </div>
  );
}
