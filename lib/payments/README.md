# B2.3 Xendit test checkout — provider verification pending

Angel selected Xendit on 25 October 2026. This replaces the PayMongo adapter while preserving historical records and the [financial rules](../../DECISIONS.md#7-payment-defaults-selected-for-the-demo). The migration merged in [PR #43](https://github.com/eloooong/rentify-app/pull/43). Core sandbox checkout/callback/refund checks passed; remaining external gates are listed below.

## Contract for Person A

HTTP routes, permissions, strict request bodies and DTO fields remain compatible. Use session cookies and same-origin mutations. Never send prices, participant identities, provider IDs or a success flag.

| Method / path                     | Request                                                    | Success                                                    |
| --------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/bookings/:id/checkout` | Strict `{policy_version:"demo-payments-v1"}` after consent | `{data:CheckoutStatus}`; 202 while creating, otherwise 200 |
| `GET /api/bookings/:id/checkout`  | Verified participant                                       | `{data:CheckoutStatus \| null}`                            |
| `POST /api/payments/webhook`      | Xendit callback-token-authenticated JSON                   | `{received:true}` after durable scheduling                 |
| `POST /api/payments/reconcile`    | Server bearer secret                                       | `{claimed,completed}`                                      |

[Runtime schema](validation.ts): attempt `id`, `booking_id`, state (`creating`, `open`, `paid`, `expired`, `refund_due`, `review`), integer-centavo `rental_amount`, `deposit_amount`, `total_amount`, `refund_due_amount`, `currency:"PHP"`, `method:"gcash"`, `test_mode:true`, `policy_version:"demo-payments-v1"`, `expires_at`, `consented_at`, nullable `checkout_url`. The version represents unchanged financial rules; provider identity is also persisted. Transaction history remains a separate contract.

Checkout requires an active, verified renter with a complete profile, an eligible accepted booking with its 30-minute payment window open, and an eligible owner/published listing. Show rent/deposit separately, preserve the quote, and obtain consent. PHP total must be 1–100,000; nonzero deposit must be at least PHP 1. Account limits remain unverified; provider rejection never changes a quote.

Only the eligible renter receives a checkout URL. Owners, outsiders, suspended actors, expired/closed bookings and legacy PayMongo attempts receive no capability. Participants retain private reads. Poll GET while creating; browser redirects never mark paid. Both return URLs point to `/checkout/<stored booking UUID>` on the configured HTTPS origin. The screen now names Xendit.

Responses remain private/no-store. Errors use `{error:{code,message,fields?}}`: sign-in 401, inaccessible/missing booking 404, validation/consent/amount 400, permissions/origin 403, closed checkout 409, oversized body 413, wrong content type 415, configuration/provider failures 503. Legacy attempts cannot restart through Xendit.

## Provider and persistence

Pinned API: `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/cancel`, `GET /v3/payments/:id` on `https://api.xendit.co`. Server Basic authentication accepts development keys only; payment resources use `api-version: 2024-11-11`. Sessions use `PAY` / `PAYMENT_LINK`, PH/PHP, GCash only, disabled payment saving, and separate rental/deposit items. No SDK is added.

Xendit uses PHP major units; adapters convert centavos exactly and reject sub-centavo amounts. Only HTTPS test checkout hosts `dev.xen.to` and `checkout-staging.xendit.co` are accepted. Completed sessions require authenticated captured-payment retrieval and matching business, payment/request IDs, GCash/PH/PHP, succeeded status, amount and capture time before persistence.

New attempts store `provider:"xendit"`. Additive migrations preserve old rows as `provider:"paymongo"`, retain RLS/grants, validate provider-specific IDs, and allocate captures under the correct gateway. Xendit workers exclude legacy attempts and refunds. Old open attempts display review without a link; nothing is relabeled or deleted.

Session creation has no documented idempotency guarantee. The worker persists its creation marker before its sole POST. After an uncertain result, it never creates another session: a matching authenticated callback can supply a candidate ID for provider retrieval. Otherwise operator review is needed. Repeated browser requests reuse the database attempt. [Refunds](REFUNDS.md) keep stable refund idempotency, bounded reads and a separate opt-in.

Synchronization still locks listing/booking/attempt, prevents duplicate receipts and allocations, and enforces terminal states and the server deadline. Late payments create refund obligations without reviving bookings. Closed sessions are cancelled and retrieved again to resolve races. The provider session may outlast the booking window; the database deadline stays authoritative.

## Webhooks

Configure **Payment Session – Completed** and **Payment Session – Expired** to `/api/payments/webhook`. Compare `x-callback-token` in constant time, validate the PH/PHP PAY envelope, and durably enqueue retrieval before acknowledgement. Posted amounts are never payment evidence. Refund reconciliation polls authenticated reads; refund callbacks are not required by this implementation.

Deduplicate merchant/event/session transitions and hash normalized identity without delivery timestamps or customer fields. Changed reference bindings are rejected. Preserve out-of-order/missed-delivery recovery. Raw billing/customer payloads are not stored; body limit remains 256 KiB.

## Server configuration

Save values in ignored local files or deployment secrets. See [`.env.example`](../../.env.example).

- `XENDIT_SECRET_KEY`: development secret with Money-in Read/Write and required refund access. Production keys are rejected.
- `XENDIT_WEBHOOK_TOKEN`: test dashboard callback verification token.
- `XENDIT_RETURN_ORIGIN`: actual HTTPS deployment/tunnel origin; fallback to canonical app origin only when HTTPS. No placeholder is selected automatically.
- `SUPABASE_SERVICE_ROLE_KEY`: privileged server-only database key.
- `PAYMENTS_WORKER_SECRET`: at least 32 random characters.
- `RENTIFY_PAYMENTS_ENABLED=true`: opt-in only after verification.
- `RENTIFY_REFUNDS_ENABLED=true`: separate refund opt-in after verification.

Check HTTPS configuration before persisting consent/attempt state. Genuine testing needs an HTTPS return origin, public HTTPS webhook and running worker. No hosted tunnel, scheduler or worker is provisioned automatically. Existing booking-expiry cron cannot make provider calls.

```sh
npm exec -- supabase migration up --local
npm run payments:worker
npm run payments:worker -- --loop
```

## Verification gates

Run lint, types, unit tests, formatting, build, database lint/SQL/access/concurrency checks, HTTP/browser journeys and generated-type drift checks. Unit transports and server-side database fixtures are synthetic; no public simulator exists.

On 25 October 2026, B verified the actual Xendit Test Mode account:

- Money-in Read/Write resolved the previous 403 responses. Refund reads returned 200; a nonexistent session returned the expected 404. Other key permissions stayed None. Secrets remain in ignored local configuration.
- Both Payment Session Completed and Expired callback URLs persisted after a dashboard reload. Unsigned HTTPS requests were rejected. Xendit's generic dashboard sample describes an Indonesian SAVE session and correctly returned 400; saving a URL is not proof of valid payment delivery.
- An accepted fixture booking opened hosted GCash checkout with PHP 2,550 rent and PHP 1,700 deposit. Xendit's eWallet Test Payment simulator completed the PHP 4,250 charge and returned to the booking checkout. One authenticated completed callback was durably recorded; the worker retrieved the capture and created exactly one receipt. The booking became paid and the browser displayed Payment received.
- Authenticated paid cancellation recorded the PHP 4,250 obligation. The refund worker submitted once, observed pending, then confirmed succeeded through authenticated reads. Private status reported 425,000 centavos refunded and zero outstanding.
- A separate genuine unpaid session was cancelled through the app. The worker retrieved Xendit status CANCELED and persisted checkout state expired without a receipt.

Payments/refunds were enabled in ignored local configuration for controlled Test Mode verification. A temporary Cloudflare Quick Tunnel supplies HTTPS; it works only while the tunnel and app process run. Replacing it requires updating both Xendit callbacks, the app/return origins, then rebuilding and restarting. Persistent hosting and scheduling remain unconfigured.

Partial-refund capability, genuine expired-event delivery, provider failure/unknown-outcome scenarios and durable hosted worker operation remain unverified. The additional PHP 100 sandbox request for partial-refund testing awaits hosted test authorization; the documented API simulation did not complete it. Keep B2.3/B2.4 unchecked until remaining gates pass. No live money, owner payout or deposit settlement is enabled.

Sources: [create](https://docs.xendit.co/apidocs/create-session), [retrieve](https://docs.xendit.co/apidocs/get-session), [cancel](https://docs.xendit.co/apidocs/cancel-session), [payment](https://docs.xendit.co/apidocs/get-payment), [GCash](https://docs.xendit.co/docs/gcash), [webhooks](https://docs.xendit.co/docs/handling-webhooks), [refund request](https://docs.xendit.co/apidocs/refund-payment-request), [official refund SDK](https://github.com/xendit/xendit-node/blob/master/docs/Refund.md).
