# B2.3 payment backend — test integration, external verification pending

Person B owns the payment API, provider adapter, migrations/types and reconciliation runner. [DECISIONS.md section 7](../../DECISIONS.md#7-payment-defaults-selected-for-the-demo) selects PayMongo Hosted Checkout v2 with GCash, fictional inventory, immutable rent/deposit quotes and test money only. Person B explicitly requested implementation with **no PayMongo account yet**. Local tests do not establish provider activation or end-to-end success.

## Contract for Person A

Use the existing session cookies and same-origin mutation rules. Never send prices, currency, renter/owner IDs, provider IDs or a payment-success flag. No frontend changes are included in B2.3.

| Method / path                     | Request                                                                                         | Success                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `POST /api/bookings/:id/checkout` | Strict JSON `{policy_version:"demo-payments-v1"}` after showing the rules and obtaining consent | `{data:CheckoutStatus}`; 202 while creation is pending, otherwise 200 |
| `GET /api/bookings/:id/checkout`  | Verified participant session                                                                    | `{data:CheckoutStatus \| null}`; null means no attempt yet            |
| `POST /api/payments/webhook`      | Provider's signed raw JSON body, not a browser call                                             | `{received:true}` only after durable inbox insertion                  |
| `POST /api/payments/reconcile`    | Server `Authorization: Bearer <PAYMENTS_WORKER_SECRET>`                                         | `{claimed,completed}`; one leased job per invocation                  |

Private routes verify the email-confirmed user. Starting checkout additionally requires an active renter/profile, an accepted booking with its 30-minute payment window open, eligible owner/published listing, physical availability and a supported quote. A complete policy-version acknowledgement is required. Consent time, actor and version are recorded; the original booking quote/terms are preserved. Participants may read history after suspension; only the active renter receives an open checkout URL. Owners/outsiders cannot obtain that payment capability. Suspended renters receive no URL.

Display rent and refundable deposit separately. The existing listing deposit is preserved, including zero. Combined amount must fit the payment integer range; total and a nonzero refundable deposit must be at least PHP 1.00, matching the documented refund-resource minimum. Actual GCash/account amount limits still require provider verification; provider rejection never silently changes a quote. The provider request has quantity-one rent/deposit lines, GCash only, no fee pass-through and no receipt email. No card/wallet credentials pass through Rentify.

```ts
type CheckoutStatus = {
  id: string; // attempt UUID, not a provider ID
  booking_id: string;
  state: "creating" | "open" | "paid" | "expired" | "refund_due" | "review";
  rental_amount: number;
  deposit_amount: number;
  total_amount: number;
  currency: "PHP";
  method: "gcash";
  test_mode: true;
  policy_version: "demo-payments-v1";
  expires_at: string;
  consented_at: string; // timestamps with offsets
  checkout_url: string | null;
  refund_due_amount: number;
};
```

[Runtime schemas and exported type](validation.ts). All money values are integer centavos. All API responses, including errors, are private/no-store. Missing/inaccessible bookings return a generic 404; no session is 401. Errors use `{error:{code,message,fields?}}`. Strict body/UUID validation is 400, wrong origin/permissions 403, oversized body 413, wrong content type 415. `payment_consent`/`payment_amount` are 400; `payment_closed` is 409; missing configuration is 503 `payments_unavailable`. Other booking eligibility errors follow the [booking contract](../bookings/README.md). Unknown provider/database failures are generic 503 responses without raw payloads or credentials.

For `creating`, show processing and poll GET; a repeat POST reuses the same database attempt. For `open`, offer the returned URL if non-null. The provider returns to the existing `/account` page for success/cancellation; neither redirect changes booking state. A's later checkout screen must read the API, not trust URL flags. `refund_due` means a financial obligation is recorded, **not** a completed refund. `review` requires operator investigation. A2.4's transaction-history UI still needs its later history contract; this endpoint is a per-booking summary.

## Server behavior and storage

The migration adds RLS-enabled `checkout_attempts`, `payment_receipts` and `payment_events`. Ordinary clients have no direct grants; deny-all RLS also protects against accidental grants. Authenticated entry points are `prepare_checkout(uuid,text)` and `get_checkout(uuid)`, with identity/participant checks inside definer functions and an empty search path. The internal payload helper and all worker/inbox/synchronization functions are inaccessible to clients. Service role has read grants and explicit worker-function grants. A [server-only client](../supabase/admin.ts) never accepts a browser-provided identity, URL or key.

There is one attempt per booking. Concurrent POSTs reuse it. Provider creation uses a stable `Idempotency-Key` derived from that attempt and the same fixed quote; a timeout does not cause a new attempt/key. No replacement session is created while the outcome is unknown. Creation-start markers survive crashes. A provider session is bound only after a secret-authenticated provider response matches the internal attempt reference. A signed event can queue a candidate session after a lost creation response; the worker retrieves and verifies it before applying money/status changes.

Receipts are unique by provider payment ID. A receipt may allocate rent and deposit once each in `payments`; summing receipt amounts and allocation rows together would double-count. `succeeded` allocation rows mean captured test funds, not earned income or payout eligibility. Incorrect amount/currency/method/time evidence is retained for review without creating a false quote allocation or marking a booking paid. Duplicate deliveries cannot duplicate receipts, allocations or audits. Unknown session references and unexpected alternative sessions are quarantined in the inbox for operator review, not treated as an authorized payment.

Synchronization locks the listing, then booking, then attempt. It rechecks eligibility/physical readiness and deadlines. Only a matching test payment confirmed while the server deadline is open can move `accepted -> paid`. If cancellation/expiry wins, the booking stays terminal and the receipt becomes `refund_due`. A delayed callback cannot revive it. B2.4 must implement fulfillment of this obligation; this handoff exposes no refund execution API. No handover, return, completion, deposit-release or owner-payout transition is added.

## Webhooks and reconciliation

Pinned wire format: `Paymongo-Signature: t=<unix-seconds>,te=<test-hmac>,li=` with HMAC-SHA256 over `timestamp + "." + raw body`, timing-safe comparison and a five-minute timestamp tolerance. Body limit: 256 KiB. Duplicate header keys, invalid signatures, changed raw bytes, live events, and unrecognized envelopes are rejected before financial work. Subscribe only to `checkout_session.payment.paid`.

The accepted event envelope is `{data:{id:"evt_...",type:"event",attributes:{type:"checkout_session.payment.paid",livemode:false,data:{id:"cs_...",type:"checkout_session",attributes:{reference_number:"<attempt UUID>",livemode:false,...}}}}}`. Full provider payloads, billing details and webhook secrets are not stored; the inbox keeps normalized IDs, a body hash and receipt state. Different content under the same event ID is rejected. The webhook persists a scheduling obligation before responding 200; persistence failures return 503. It does not set paid from the posted body.

The worker uses authenticated provider retrieval for known sessions even without a webhook. It leases one due attempt for 90 seconds, uses ten-second provider timeouts, and returns only aggregate counts. Scheduling a batch's leases before serial network calls is avoided. Booking cancellation/expiry triggers durable reconciliation scheduling in the same database transaction. Closed reservations cause provider-session expiry and a fresh read; a rejected expiry may indicate a payment in progress and must not cause a replacement charge. Active/unresolved sessions are retried; transient failures retain work and sanitized error codes. Stale worker tokens cannot apply a result.

If creation outcome is unknown and the booking has closed without any session reference, the attempt becomes `review`; do not create a new session after expiry. An authentic later event can wake verification of its candidate. If no event arrives, operator investigation using the provider's records is required; never declare an unknown payment absent or refunded. An attempt known to have never contacted the provider can close without a refund. A closed checkout cannot be replaced automatically; a still-unpaid renter can cancel and make a new booking request if needed. No admin repair UI is included. Durable obligations are preserved when the app/runner is offline.

## Configuration and operation

All new names have placeholders in [.env.example](../../.env.example). Save real values only in ignored `.env.local` or a deployment secret store. Never paste keys into chat, log them, commit them, or use `NEXT_PUBLIC_`:

- `RENTIFY_PAYMENTS_ENABLED=true`: explicit opt-in; absent/false disables provider checkout and webhooks.
- `PAYMONGO_SECRET_KEY`: test server key only; live/public keys are rejected.
- `PAYMONGO_WEBHOOK_SECRET`: signing secret for the test webhook endpoint, separate from the API key.
- `SUPABASE_SERVICE_ROLE_KEY`: privileged server-only Supabase credential for durable payment processing.
- `PAYMENTS_WORKER_SECRET`: random server-to-server bearer secret, at least 32 characters.

No new dependency is installed. With no PayMongo account, leave payments disabled. Authenticated status reads and database/unit tests still work; no public payment-simulation route exists.

After configuring a test account, an HTTPS webhook endpoint and the running app:

```sh
# One bounded reconciliation invocation; reads .env.local without printing keys.
npm run payments:worker
# Local operator loop, one job per pass with a five-second pause; Ctrl+C stops it.
npm run payments:worker -- --loop
```

The runner calls the app's protected endpoint and refuses redirects. Do not expose the worker secret to A's browser code. A hosted scheduler/worker must be configured separately for regular reconciliation and monitoring; **none is provisioned or running by this PR**. The database booking-expiry job remains active independently, but it cannot make provider HTTP calls. Before a hosted demo, verify runner uptime, due-work backlog, review/refund obligations and missed-webhook recovery. This setup is not a live-money deployment.

## Verification and handoff gates

```sh
npm exec -- supabase migration up --local
npm run db:lint
npm run db:test
npm run db:test:payments
npm test
# With the local app running at localhost:3000:
npm run test:payments:http
```

SQL tests cover grants/RLS/private functions. Real Auth tests exercise consent, concurrent attempt creation, private status, leased workers, duplicate events/receipts/allocations, live evidence rejection, amount mismatch, late expiry and payment/cancellation races. Unit tests inject a provider transport; they do not contact PayMongo. HTTP tests use actual SSR cookies for private reads, mass-assignment/origin rejection and forged webhook/worker denial. Scoped fixture cleanup removes only its own accounts/listings/uploads/bookings/payment/audit records, preserving development data.

**External checks still pending:** account/test GCash availability; exact v2 create/v1 retrieve/expire compatibility and idempotency behavior; actual signed webhook envelope/header; HTTPS round trip; full/partial test refunds; real worker/scheduler configuration. Official examples differ on event envelopes/signature simplification, so the pinned adapter must be checked against genuine test deliveries before claiming end-to-end integration. Do not weaken validation or switch to live mode to bypass an unsupported test feature. B2.3 stays unchecked in the project checklist until its acceptance gates are met; B2.4/refunds and B3.3/settlement stay separate.

Primary references: [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout), [test quick start](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start), [get session](https://docs.paymongo.com/reference/get_checkout_sessions), [expire session](https://docs.paymongo.com/reference/expire-a-checkout-session), [checkout lifecycle](https://docs.paymongo.com/docs/payment-channels-key-concepts), [detailed webhook verification](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management), [refund resource](https://docs.paymongo.com/reference/refund-resource).
