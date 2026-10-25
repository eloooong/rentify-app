# Rentify product decisions

**Status: demo booking and payment defaults selected under Person B (Angel)'s authority — 18 October 2026.** Sections 1–6 were approved directly; Person B delegated section 7's payment choices in this chat. B2.1/B2.2 and B2.3 backend are merged. B2.4 is implemented in [PR #38](https://github.com/eloooong/rentify-app/pull/38) (`codex/cancellation-refunds`), pending review/merge; actual checkout/refund provider verification remains pending. Planning PDFs do not override this record; live rentals, charges, deposit custody and payouts remain unauthorized.

## 1. First release

**Agreed for the demo:** build a local/staging course demo first, using fictional inventory and test payments only. Use PHP and `Asia/Manila` for booking dates. Store timestamps in UTC and display them in Manila time. This does not authorize real rentals, charges, deposits or payouts.

One listing represents **one physical device**. Multi-unit inventory, hourly rentals, extensions, discounts and platform fees are outside the first booking demo. Only published listings from active owners accept new requests. Owners can pause a listing to stop new requests; pausing never cancels an existing reservation or removes the participants' access to it.

## 2. Dates and rental days

**Agreed for the demo:** the renter chooses a pickup date and a return date. **Both dates are charged and reserved.** A same-date rental costs one day. The next booking can start the following calendar day; there is no same-day turnover in the first release.

Example: pickup **20 November**, return **22 November** means **three rental days**. The database stores `[2026-11-20,2026-11-23)`, with an exclusive upper bound. A booking starting 22 November conflicts; one starting 23 November does not, subject to the device being returned and cleared.

| Rule                       | Agreed default                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Minimum / maximum duration | 1 / 30 calendar days, inclusive                                                                                        |
| Advance notice             | Request at least 24 hours before 00:00 Manila time on the pickup date                                                  |
| Booking horizon            | Pickup no more than 90 calendar days after today's Manila date                                                         |
| Pickup / return hours      | Agreed by the participants within the selected dates; the demo does not promise a fixed hour or compute hourly charges |
| Date edits / extensions    | No direct edits after requesting; before payment, cancel and submit a new request                                      |

The notice rule is evaluated by the server clock. For example, at 10:00 on 18 November, 19 November is too soon (only 14 hours until its midnight); 20 November is eligible. Use calendar-date arithmetic, not elapsed milliseconds, to count rental days.

## 3. Requests, reservation and expiry

**Agreed for the demo:** a request is an expression of interest. It does **not** reserve the device. Different renters may request overlapping dates; only one overlapping reservation can be accepted.

| Stage       | Agreed rule                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requested` | Owner can accept or decline; renter can cancel. Expires at the earlier of creation + 24 hours or two hours before the pickup date begins          |
| `accepted`  | Immediately reserves the dates. Renter has 30 minutes from acceptance to complete test payment; no new payment attempt starts after that deadline |
| `paid`      | Dates remain reserved after trusted payment confirmation; clients cannot set this status                                                          |
| Expiry      | Server/database time controls deadlines. At `now >= expires_at`, the pending action is too late; a background job marks the booking `expired`     |

Acceptance must happen before request expiry. These cutoffs leave the full 30-minute payment window before the pickup date starts. The later payment integration must define late/in-flight payment reconciliation before enabling any real or gateway-backed payment flow; a late callback cannot silently revive an expired reservation.

Do not rely on the expiry job running on time. Acceptance/payment commands must check deadlines themselves. A stale accepted reservation keeps blocking until it is explicitly expired; the acceptance transaction can expire relevant stale holds before retrying the reservation. Merely hiding a stale booking in the UI does not release it.

Leave other renters' overlapping requests pending unless the owner declines them, they expire or their renter cancels. An attempt to accept one while the dates are reserved returns a conflict and leaves the request unchanged. A renter cannot create duplicate overlapping open requests/reservations for the same listing.

## 4. Availability and concurrent requests

**Agreed for the demo:** the statuses below define a date reservation. Enforce overlap protection inside PostgreSQL, including concurrent acceptance attempts; a frontend availability check is only a preview.

| Blocks overlapping dates                                  | Does not block dates                                         |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `accepted`, `paid`, `handed_over`, `returned`, `disputed` | `requested`, `declined`, `expired`, `cancelled`, `completed` |

For two requests competing for the same dates, at most one acceptance may succeed. The other receives a clear conflict without a partial status/payment change. Bookings for different listings do not conflict.

**Physical availability is a separate check:** an overdue, unreturned device or an unresolved dispute blocks **all new acceptances**, even outside the original date range. Existing future reservations remain recorded; they must not be silently cancelled or handed over while the device is unavailable. Resolve the return/dispute and confirm readiness before reopening reservations. A disputed booking must not release the device merely because its original dates passed.

## 5. Price and deposit snapshot

**Agreed for the demo:** the server reads the listing price, currency and deposit when creating the request. Store that quote with the booking and keep it through its request/acceptance deadlines. Later listing price edits affect new requests only. An owner who does not want to honor an existing quote can decline the unpaid request; they cannot increase its total silently.

- `rental_days = return_date - pickup_date + 1`.
- `rental_amount = daily_price_amount × rental_days`, computed in integer centavos.
- Snapshot the listing's `deposit_amount` separately. Show rental and deposit as separate lines, then the combined quoted amount. A deposit is not rental income.
- Reject invalid or overflowing amounts. Never trust a total, owner ID, currency or payment status submitted by a client.
- No hidden charges, automatic late fees or platform fees in the first demo.

Example only: PHP 850/day for 20–22 November gives **PHP 2,550 rent**. If that listing has a PHP 1,700 demo deposit, show a **PHP 4,250 combined quote**. This does not set a universal deposit. Section 7 selects test-only collection/refund behavior; provider verification and settlement implementation remain pending.

## 6. Identity, access and transitions

**Agreed for the demo:** requesting and accepting require a verified signed-in user, an active account and a completed profile. An owner cannot book their own listing. The server derives the renter from the verified session and the owner from the listing.

Participants may read their own bookings. Public availability exposes unavailable dates only, never another renter's identity, phone, booking ID or payment details. Owners cannot change a renter's payment status; renters cannot approve themselves. Privileged access is server-enforced and audited.

| From                              | To            | Who / condition                                                                                                           |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `requested`                       | `accepted`    | Listing owner; request not expired, device available, reservation inserted atomically                                     |
| `requested`                       | `declined`    | Listing owner                                                                                                             |
| `requested`                       | `cancelled`   | Requesting renter                                                                                                         |
| `requested`, `accepted`           | `expired`     | Trusted server; applicable deadline reached                                                                               |
| `accepted`                        | `cancelled`   | Renter or owner before payment; record actor and reason                                                                   |
| `accepted`                        | `paid`        | Trusted payment confirmation within the agreed payment flow; demo simulation is server-only and unavailable in production |
| `paid`                            | `cancelled`   | B2.4 command under section 7's pre-pickup/pre-handover rule, with reason and durable refund obligation                    |
| `paid`                            | `handed_over` | Server after both parties confirm handover and the required checklist in the later checklist feature                      |
| `handed_over`                     | `returned`    | Server after both parties confirm physical return; this does not approve condition or release money                       |
| `returned`                        | `completed`   | Both parties approve the return inspection and the later settlement workflow is satisfied                                 |
| `paid`, `handed_over`, `returned` | `disputed`    | Participant records an issue; server preserves evidence and blocks automatic settlement                                   |

Only implement each transition when its payment/checklist/settlement dependency exists. The existing enum is vocabulary, not authorization. `declined`, `expired`, `cancelled` and `completed` are terminal for ordinary users. No participant can edit booking identities, quoted amounts or dates directly, erase history, or reopen a terminal booking.

The end of a rental date does not automatically prove handover, return or completion. Do not auto-complete or auto-release a deposit in B2.1/B2.2. Section 7 selects paid cancellation rules; the B2.4 implementation and later dispute resolution dependencies remain required.

## 7. Payment defaults selected for the demo

**Authority:** on 18 October 2026, Person B (Angel) delegated gateway, deposit and refund choices in this chat: “you decide.” These defaults are adopted for the fictional/test demo. Person A's separate approval is not recorded. Documentation does not prove this project's account is configured; no live payments or owner transfers are authorized.

### Gateway and amounts

**Updated choice, 25 October 2026:** Angel explicitly selected **Xendit** and requested implementation. This supersedes the original PayMongo choice. Use Xendit Payment Session hosted checkout (`PAY`, `PAYMENT_LINK`) in Test Mode, restricted to GCash/PHP/Philippines, with payment-method saving disabled. Payment entry stays on the provider page. Live money, cards, other wallets, holds and split payments remain outside this slice. [Session API](https://docs.xendit.co/apidocs/create-session).

The [GCash guide](https://docs.xendit.co/docs/gcash) documents PHP 1–100,000 payments, partial refunds and a 180-day refund window. The booking horizon still fits that documented window, subject to account verification. Store centavos and convert to PHP major units only at the gateway boundary. Verify account-specific permissions, limits and refunds before enabling execution.

Use one checkout session per accepted booking, with rent and refundable deposit as separate line items in one combined **test payment**. Reuse the recorded session. Xendit has no documented session-create idempotency guarantee: send one create POST per attempt and preserve its creation marker; discover an unknown result through authenticated reads after a matching callback. Never send a replacement POST while its outcome is unknown. Charge the immutable quote, never client-supplied amounts. Display these payment/refund rules before checkout and record the renter's consent with a payment-policy version, without overwriting the booking's original quote/terms. Incompatible older records require review rather than silent changes. Do not add a fee line, platform split or fee pass-through. No platform/cancellation fee is added; provider fees are an operator expense under this demo policy.

Use the existing listing's nonnegative integer `deposit_amount` snapshot; the catalog default is zero unless the owner sets one. No new percentage, forced repricing or seed changes. Collect rent plus deposit immediately in test money, without a hold/capture workflow. Validate the selected provider's actual amount limits at checkout; never silently change the quote.

Record rent/deposit allocations separately against the same provider payment without double-counting it. A deposit is not rental revenue. This bookkeeping is not escrow or a protected marketplace wallet. Actual custody, merchant eligibility, payout structure and provider approval remain pending before live use. No owner payouts or automatic split transfers are enabled.

### Refund and cancellation rules

| Situation                                                                                                       | Demo rule                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Before confirmed payment                                                                                        | Existing B2.2 decline/cancel/expiry rules; no refund of money not collected                                             |
| Paid, before 00:00 Manila on pickup date, and no handover                                                       | Either participant may cancel with a reason; refund 100% of unrefunded rent and deposit, without a cancellation fee     |
| Pickup date has begun, or handover occurred                                                                     | No self-service cancellation/refund; record an issue for manual review without automatic penalties or forfeiture        |
| Physical return and condition approved by both participants                                                     | Refund the remaining deposit only, after the checklist/settlement dependency is implemented                             |
| Duplicate charge, payment for a cancelled/expired booking, or confirmation too late to finalize the reservation | Reconcile the provider payment and refund its unrefunded amount; never revive a terminal booking or charge again        |
| Failed or unknown refund                                                                                        | Keep the financial obligation visible, retain its reference and retry/reconcile safely; submission alone is not success |

Refund to the original payment method in integer centavos. The total of confirmed and reserved pending refunds must not exceed the amount actually collected. The server controls eligibility and amount; participants cannot supply arbitrary refunds or mark them successful. Do not promise instant arrival. B2.4 must implement paid cancellation and refund permissions, race protection, retries and auditing before enabling these controls.

Zero deposits need no refund. After the later return feature exists, both parties must confirm physical return and approve condition before requesting deposit repayment. No timeout-based release, unilateral owner deduction, damage/late fee or forfeiture for silence. Unresolved issues require manual review. Inspection reminders/escalation must account for the provider's refund deadline; live dispute settlement remains a separate decision. B3.3 implements this lifecycle; B2.3 cannot infer return from dates.

Xendit documents GCash full and partial refunds within 180 days. Verify actual test-account behavior, stable reference/idempotency handling and pending/success/failure outcomes before enabling execution. [GCash capabilities](https://docs.xendit.co/docs/gcash), [refund requests](https://docs.xendit.co/apidocs/refund-payment-request). If test refunds are unavailable, retain obligations and keep provider execution disabled; do not switch to live money.

### Deadlines and payment confirmation

Keep the existing 30-minute acceptance-to-payment deadline. Only the requesting renter may start checkout while verified/active with a complete profile and an eligible accepted booking. Under the existing listing-before-booking lock order, the server validates reservation status, deadline, participants, listing eligibility, physical readiness, currency and quote before finalizing payment.

Require a verified provider result matching internally stored session/payment/booking references, test mode, currency and exact amount. Never trust redirects or client success flags. Transition `accepted -> paid` only while the server deadline is open and the provider reports payment before that deadline. If confirmation reaches the server after the deadline, or cancellation/expiry already won the race, preserve the terminal booking and refund the reconciled payment. Even payment just before the deadline cannot resurrect an expired booking; this intentionally favors an unambiguous reservation over late fulfillment.

On cancellation/expiry, durably enqueue Xendit session cancellation and reconciliation. Session expiry does not extend the database reservation. Cancellation can race with payment; always retrieve again, preserve terminal bookings and refund late captures. Never issue a replacement charge while an earlier outcome remains unknown. [Session lifecycle](https://docs.xendit.co/docs/payment-sessions-overview).

Authenticate Xendit callbacks with the secret `x-callback-token`, validate resource identity and expected event shape, and deduplicate merchant/session transitions. Persist a durable retrieval obligation before acknowledgement. Authenticated provider reads, not posted amounts or browser flags, determine financial state. Production keys are rejected and only test checkout hosts are allowed. [Webhook handling](https://docs.xendit.co/docs/handling-webhooks).

### Remaining implementation gates

- **Selected:** gateway/method, immediate test charge, existing deposit snapshot, fee treatment, pre-pickup full refund, late-payment handling and no automatic deductions/releases.
- **External setup:** Xendit Test Mode account/development key exist, but session/refund probes returned 403. Required permissions, callback token, HTTPS delivery/return origin and genuine provider behavior remain pending. Secrets stay in ignored local files.
- **Implementation:** original checkout/refund backends merged in PR #36/#38. PR #43 now migrates new attempts to Xendit while retaining old provider history. Both execution flags remain disabled until the external acceptance checks pass.
- **A wait:** booking/checkout/refund contracts are merged; PR #43 adds the Xendit implementation and minimal provider wording for review. Actual payment/refund use waits for account setup and verification. A retains frontend ownership.
- **Still pending before live use:** marketplace/custody approval, payout arrangements, dispute authority/evidence/appeals, retention/privacy and deployment readiness. Demo defaults do not settle live policies.

## 8. Implementation handoff and acceptance examples

B implements the approved booking rules through B2.1/B2.2 in a new task branch, adds migrations and generated types, and publishes exact API fields, errors, status transitions, access rules and date examples. A integrates only after that contract merges; A can keep building its listing editor/management meanwhile.

Required booking regression checks include: one-day and three-day totals; rejection of backwards/too-soon/overlong dates; adjacent versus overlapping reservations; self-booking and duplicate requests; exactly one winner under concurrent acceptance; stale holds; deadline boundary checks; immutable quotes after listing price changes; denied participant/outsider actions; and an overdue/disputed device remaining unavailable beyond its original dates.

B2.3/B2.4 checks must cover exact totals, concurrent checkout retries, invalid callback tokens and production evidence, duplicate/out-of-order/missed events, cancellation/payment races, late-payment refunds, full/partial refund retries, failed refunds and outsider denial. Verify actual GCash test checkout, authenticated callback delivery, session expiry and refunds before claiming the external integration works. Publish exact API/ledger/error contracts before A connects checkout.

**Decision record:** sections 1–6 approved directly by Person B (Angel); section 7 selected under Person B's explicit delegation on 18 October 2026. Person A's separate approval is not recorded. B2.1/B2.2 and B2.3 backend are merged; B2.4 backend is merged; Xendit migration and external provider checks remain pending in PR #43. Controls stay gated by dependencies and verification. Section 7 supersedes older policy-pending notes; the [booking](lib/bookings/README.md), [payment](lib/payments/README.md) and [refund](lib/payments/REFUNDS.md) contracts distinguish implemented behavior from external verification. Reviewed policy changes must preserve existing booking snapshots.

### Xendit verification status — 25 October 2026

The adapter/schema migration is being implemented in PR #43; execution remains disabled. A development key is present locally, but read-only session/refund probes returned `403 REQUEST_FORBIDDEN_ERROR`. API permissions, webhook delivery, an HTTPS return origin, actual GCash payments and full/partial refunds remain unverified. Existing PayMongo records retain their identity and are excluded from Xendit workers; legacy obligations require provider-specific review. The consent policy version describes the unchanged financial rules, with provider identity stored on new attempts.
