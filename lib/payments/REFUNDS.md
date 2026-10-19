# B2.4 paid cancellation and refunds — test mode, provider verification pending

Person B owns this backend. [Selected policies](../../DECISIONS.md#7-payment-defaults-selected-for-the-demo) remain unchanged. B2.3 merged in [PR #36](https://github.com/eloooong/rentify-app/pull/36). There is no PayMongo account yet; neither checkout nor refund execution is enabled locally. These contracts describe implemented, locally tested behavior, not a verified provider integration.

## Contract for Person A

Use verified session cookies, the canonical same-origin mutation rules and strict JSON. All responses/errors are private/no-store. Money is integer PHP centavos.

| Method / path                          | Request                                                                   | Success                                                  |
| -------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /api/bookings/:id/refunds`        | Participant session                                                       | `200 {data:RefundStatus}`                                |
| `POST /api/bookings/:id/cancellation`  | Strict `{reason:string}`; trimmed 3–500 characters, no control characters | `200 {data:{booking:Booking,refunds:RefundStatus}}`      |
| `POST /api/payments/refunds/reconcile` | Server-only worker bearer secret                                          | `200 {claimed,completed}`; at most one leased refund job |

The new cancellation endpoint is specifically for **paid** bookings. Existing unpaid accept/decline/cancel actions and their `allowed_actions` remain unchanged. Use `can_cancel_paid` from the refund endpoint for the paid cancellation control; the database rechecks this at submission. Do not infer permission from a client clock or booking status alone.

Either active, verified participant with a complete profile may cancel an eligible B2.3 paid booking before **00:00 Asia/Manila on the pickup date**, while still `paid`. A known matching capture and recorded `demo-payments-v1` consent are required. Cancellation after pickup begins, after handover, or for incompatible/legacy records returns `409 paid_cancellation_closed`; it does not issue a refund or record a dispute. A later issue/admin feature supplies manual issue handling. A paused listing or unavailable counterparty does not prevent an otherwise eligible participant from cancelling.

Cancellation releases the reservation and, in the **same transaction**, changes the applied receipt's disposition to `refund_due`, reserves its unrefunded amount, and records the actor/reason audit. Captured amount, original quote, payment consent and capture allocation rows remain historical. Repeating the same actor/reason returns the original result without duplicate work or audits, even after the cutoff; a different actor/reason gets `409 idempotency_conflict`.

Cancellation/status work even with the provider disabled: an obligation is recorded, not a promise that money has moved. Display “refund pending” until confirmed success. Do not offer arbitrary amounts, deposit release, a “mark refunded” button, or a second refund command.

```ts
type RefundStatus = {
  booking_id: string;
  currency: "PHP";
  test_mode: true;
  can_cancel_paid: boolean;
  refund_due_amount: number; // outstanding obligation, including reserved work
  refund_pending_amount: number; // queued, unknown, pending, processing or review reservations
  refunded_amount: number; // confirmed successful provider refunds only
  review_required: boolean;
  attempts: {
    id: string; // internal UUID; no provider IDs, secrets or private error details
    amount: number;
    state:
      | "queued"
      | "submitting"
      | "pending"
      | "processing"
      | "succeeded"
      | "failed"
      | "review";
    created_at: string;
    updated_at: string; // timestamps with offsets
  }[];
};
```

[Runtime schemas and exported type](refund-validation.ts). `refund_due_amount` already includes `refund_pending_amount`; do not add them. A review/unknown reservation is not confirmed success. `review_required` also marks exhausted retries or an outstanding amount with no processable attempt. The [checkout DTO](README.md) retains its existing fields/states; its `refund_due_amount` now subtracts successful refunds. Checkout `state:"refund_due"` records the reason for financial reconciliation and can remain after the outstanding amount reaches zero.

Errors use `{error:{code,message,fields?}}`: unverified/no session `401 sign_in`; outsider/missing booking `404 not_found`; invalid UUID/body/reason or extra fields `400 validation`; origin/profile/permissions `403`; cutoff/status `409 paid_cancellation_closed`; changed retry details `409 idempotency_conflict`; oversized JSON `413`; wrong content type `415`; unknown failures `503 unavailable`. The worker requires bearer authorization (`403`) plus both test enable flags and a test server key (`503` if missing/invalid). Participants can read history after suspension; suspended accounts cannot cancel. Never expose the privileged worker credential to the browser.

## Ledger and worker behavior

`refund_attempts` has deny-all RLS, no ordinary table grants and no service-role direct writes. Authenticated users have only `get_booking_refunds(uuid)` and `cancel_paid_booking(uuid,text)`. Private helper functions cannot be called by clients. Worker functions are granted only to `service_role` and use an empty search path. The trusted worker reads provider state; no posted webhook/browser payload can set refund success. B2.3's payment webhook subscription remains unchanged. Refund status is polled independently, so missed refund webhooks do not prevent reconciliation.

The payment receipt is the full-refund obligation; a trigger queues late/duplicate captures and backfills existing `refund_due` receipts. Paid cancellation uses that same path. Receipts with mismatched amount/currency/method remain in B2.3 review and are not automatically refunded. Each receipt has at most one unresolved refund attempt. Writers lock the receipt before its refund rows. Cancellation first locks listing, booking and checkout, consistently with B2.3 payment reconciliation. No refund worker takes those parent locks after taking a refund lock.

Queueing calculates captured amount minus **all successful and reserved nonfailed amounts**, under the receipt lock. The browser never chooses an amount. A known successful partial refund reduces the remaining obligation; a pending/unknown partial refund reserves its amount. B2.4 creates full remaining refunds only. The partial-ledger regression fixture is an explicitly isolated trusted simulation; this does not authorize a partial/deposit refund API. B3.3's both-party return/inspection remains required for deposit settlement. No provider payout or new fee is added.

Workers lease one job for 90 seconds, fence result writes, and mark creation durably **before** the provider POST. Creation includes a stable idempotency key and the nonpersonal marker `rentify-refund:<attempt UUID>` in provider notes. Before a first POST, the worker lists that payment's existing refunds and requires every entry to match the known ledger. An unexpected dashboard refund causes review. Known refund IDs are retrieved directly. List pagination is bounded at two pages of 100, with ten-second request timeouts; truncation/malformed evidence fails closed. There is no claim that the provider's idempotency retention has been verified.

After a timeout/crash, a creation marker without an ID causes **read-only discovery** by the unique notes marker. The worker never repeats that POST merely because a list is empty. Unknown outcomes reserve their amount, show review, and poll again each minute for discovery. Multiple matches, mismatched IDs/amounts/currency, live evidence, unrecognized existing refunds or provider evidence that regresses `processing` to `pending` are quarantined. The operator investigates provider records; this PR adds no admin repair API. An ambiguous creation must never be declared failed solely to free the reservation.

Only a provider-confirmed `failed` result releases that attempt's reservation. Queueing may then create a new UUID/key for the remaining amount after one minute. There are at most **three attempts per receipt**; exhausted retries retain the obligation for operator review. Successful/pending/processing/unknown outcomes never create an additional attempt. `pending`/`processing` are polled each minute and do not count as refunded. Confirmation writes and state-change audits are atomic; expired lease tokens cannot apply results. Captured rental/deposit allocations are not rewritten to erase the original charge. The refund ledger supplies the offset; do not sum captures and refunds as positive revenue.

New refund submission checks the documented GCash 180-day window and minimum 100 centavos. Window-expired or otherwise unsupported obligations remain visible for review. Actual provider/account limits and behavior are still unverified. Hosted scheduler uptime/backlog/review monitoring remains an operational gate.

## Configuration and verification

[Environment placeholders](../../.env.example) include separate `RENTIFY_REFUNDS_ENABLED=false`. Keep it false until account test refund support is verified. Submission requires **both** `RENTIFY_PAYMENTS_ENABLED=true` and `RENTIFY_REFUNDS_ENABLED=true`, a valid `sk_test_...` server key, server-only Supabase service key and worker bearer secret. No values were added to local secrets. No live key is accepted, no real payment is authorized, and no public simulator route exists.

The existing `npm run payments:worker` runner now invokes checkout reconciliation and, only when refund opt-in is true, the separate refund reconciliation endpoint. Each request has its own timeout; a checkout job cannot starve refund work. `--loop` repeats after five seconds. Neither this runner nor a hosted scheduler is started/provisioned by this change.

The adapter pins the current [create](https://docs.paymongo.com/reference/create-a-refund), [retrieve](https://docs.paymongo.com/reference/retrieve-a-refund) and [list](https://docs.paymongo.com/reference/list-all-refunds) reference endpoints at `/refunds`. The [refund guide](https://docs.paymongo.com/docs/payment-acceptance-refunds) still demonstrates `/v1/refunds`; this version discrepancy is an explicit external acceptance check. The [resource definition](https://docs.paymongo.com/reference/refund-resource) supplies minimum amount and outcome states. Check actual test POST/read/list compatibility, notes round trip, pagination, idempotency, full/partial refunds and pending/failure behavior before enabling execution. Never add a fallback that switches endpoint/version after an uncertain POST, and never switch to live mode to bypass missing test support.

```sh
npm exec -- supabase migration up --local
npm run db:types
npm run db:lint
npm run db:test
npm run db:test:payments
npm run db:test:refunds
npm test
# With the local app running:
npm run test:refunds:http
```

SQL checks cover grants/RLS/private helpers. Real Auth/RPC tests exercise participant denial, suspended actors, exact Manila cutoff, idempotent/concurrent cancellation, capped remaining amounts, lease fencing, pending/processing/success, bounded confirmed-failure retries, ambiguous recovery and late/duplicate capture obligations. Unit tests use injected provider transport only. HTTP tests use real SSR session cookies and isolated synthetic capture evidence to verify paid cancellation, read privacy, origin/extra-field rejection and worker denial. Scoped cleanup touches only its own namespace. These checks do not complete genuine PayMongo verification; B2.3/B2.4 stay unchecked until their handoff and external gates pass.
