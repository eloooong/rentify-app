# Rentify product decisions

**Status: demo booking and payment defaults selected under Person B (Angel)'s authority — 18 October 2026.** Sections 1–6 were approved directly; Person B delegated section 7's payment choices in this chat. B2.1/B2.2 are merged. B2.3/B2.4 implementation and provider verification remain pending. Choices are not completed behavior. Planning PDFs do not override this record; live rentals, charges, deposit custody and payouts remain unauthorized.

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
| `paid`                            | `cancelled`   | Later B2.4 command under section 7's pre-pickup/pre-handover rule, with reason and durable refund obligation              |
| `paid`                            | `handed_over` | Server after both parties confirm handover and the required checklist in the later checklist feature                      |
| `handed_over`                     | `returned`    | Server after both parties confirm physical return; this does not approve condition or release money                       |
| `returned`                        | `completed`   | Both parties approve the return inspection and the later settlement workflow is satisfied                                 |
| `paid`, `handed_over`, `returned` | `disputed`    | Participant records an issue; server preserves evidence and blocks automatic settlement                                   |

Only implement each transition when its payment/checklist/settlement dependency exists. The existing enum is vocabulary, not authorization. `declined`, `expired`, `cancelled` and `completed` are terminal for ordinary users. No participant can edit booking identities, quoted amounts or dates directly, erase history, or reopen a terminal booking.

The end of a rental date does not automatically prove handover, return or completion. Do not auto-complete or auto-release a deposit in B2.1/B2.2. Section 7 selects paid cancellation rules; the B2.4 implementation and later dispute resolution dependencies remain required.

## 7. Payment defaults selected for the demo

**Authority:** on 18 October 2026, Person B (Angel) delegated gateway, deposit and refund choices in this chat: “you decide.” These defaults are adopted for the fictional/test demo. Person A's separate approval is not recorded. Documentation does not prove this project's account is configured; no live payments or owner transfers are authorized.

### Gateway and amounts

Choose **PayMongo Hosted Checkout v2, test mode, GCash only** for the first integration. [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout) supports backend session creation and recommends v2. Payment entry stays on the provider's page. Keep credentials server-side and reject live keys/resources. Cards, QR Ph, other wallets, installments, authorization holds and split payments are outside this first slice.

GCash fits the booking horizon: the current [refund guide](https://docs.paymongo.com/docs/payment-acceptance-refunds) documents partial refunds and a 180-day window for GCash, versus 60 days for cards. Rentify's 90-day pickup horizon plus 30-day inclusive rental allows return as late as today + 119 days. Any additional payment method must support the booking and inspection refund period; do not promise deposit refunds beyond its supported window.

Use one checkout session per accepted booking, with rent and refundable deposit as separate line items in one combined **test payment**. Reuse the active session on retries; do not create a replacement while its outcome is unknown. Charge the immutable quote, never client-supplied amounts. Display these payment/refund rules before checkout and record the renter's consent with a payment-policy version, without overwriting the booking's original quote/terms. Incompatible older records require review rather than silent changes. Turn fee pass-through off. No platform/cancellation fee is added; provider fees are an operator expense under this demo policy.

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

The current [refund guide](https://docs.paymongo.com/docs/payment-acceptance-refunds) includes a test-key example, and the [verification checklist](https://docs.paymongo.com/docs/payment-acceptance-go-live-checklist) calls for test refunds. An [older official guide](https://developers.paymongo.com/v1/docs/refunding-transactions) says refunds require live transactions. Therefore actual full/partial test refunds remain **account-level acceptance checks**. If unavailable, disable gateway refund actions and exercise the policy through an explicitly labeled isolated simulator; never enable live mode to work around the limitation. [Refund resources](https://docs.paymongo.com/reference/refund-resource) distinguish pending/processing/succeeded/failed results.

### Deadlines and payment confirmation

Keep the existing 30-minute acceptance-to-payment deadline. Only the requesting renter may start checkout while verified/active with a complete profile and an eligible accepted booking. Under the existing listing-before-booking lock order, the server validates reservation status, deadline, participants, listing eligibility, physical readiness, currency and quote before finalizing payment.

Require a verified provider result matching internally stored session/payment/booking references, test mode, currency and exact amount. Never trust redirects or client success flags. Transition `accepted -> paid` only while the server deadline is open and the provider reports payment before that deadline. If confirmation reaches the server after the deadline, or cancellation/expiry already won the race, preserve the terminal booking and refund the reconciled payment. Even payment just before the deadline cannot resurrect an expired booking; this intentionally favors an unambiguous reservation over late fulfillment.

On cancellation/expiry, durably enqueue provider-session closure and reconciliation. [Checkout lifecycle documentation](https://docs.paymongo.com/docs/payment-channels-key-concepts) says sessions do not expire automatically; expiry can fail for ongoing/paid payments and has no webhook. A timer/expired QR code cannot close checkout. Retry/reconcile failures, prevent replacement charges, and refund any resulting late payment without extending the database reservation silently.

Verify the raw-body signature before processing; require the test signature and reject live events. Deduplicate event and payment IDs and make ledger/status/audit changes atomic. The detailed [webhook setup guide](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management) specifies timestamp plus raw-body HMAC-SHA256 and separate test/live signatures. Some overview examples simplify this and show different payload envelopes. Pin and verify actual test deliveries for the selected API; do not accept weak fallback formats. Reconcile missed deliveries through authenticated provider reads. Acknowledge safe receipt only after processing or its retry obligation is durably recorded.

### Remaining implementation gates

- **Selected:** gateway/method, immediate test charge, existing deposit snapshot, fee treatment, pre-pickup full refund, late-payment handling and no automatic deductions/releases.
- **Not configured:** no PayMongo setting was found in standard local environment files. Account ownership, test keys, enabled GCash, HTTPS webhook delivery and actual refund behavior remain unverified. Never paste secrets into chat or commits.
- **Next B work:** B2.3 implements the adapter, ledger, checkout, signed webhooks and reconciliation; B2.4 implements refunds. Deterministic tests can proceed without credentials, but mocks do not complete external verification.
- **A wait:** real checkout waits for B's published API contract and merged backend. A2.1/A2.2 may use merged B2.2 APIs now. A retains listing/chat/frontend ownership.
- **Still pending before live use:** marketplace/custody approval, payout arrangements, dispute authority/evidence/appeals, retention/privacy and deployment readiness. Demo defaults do not settle live policies.

## 8. Implementation handoff and acceptance examples

B implements the approved booking rules through B2.1/B2.2 in a new task branch, adds migrations and generated types, and publishes exact API fields, errors, status transitions, access rules and date examples. A integrates only after that contract merges; A can keep building its listing editor/management meanwhile.

Required booking regression checks include: one-day and three-day totals; rejection of backwards/too-soon/overlong dates; adjacent versus overlapping reservations; self-booking and duplicate requests; exactly one winner under concurrent acceptance; stale holds; deadline boundary checks; immutable quotes after listing price changes; denied participant/outsider actions; and an overdue/disputed device remaining unavailable beyond its original dates.

B2.3/B2.4 checks must cover exact totals, concurrent checkout retries, invalid signatures/live events, duplicate/out-of-order/missed events, cancellation/payment races, late-payment refunds, full/partial refund retries, failed refunds and outsider denial. Verify actual GCash test checkout, signed delivery, session expiry and refunds before claiming the external integration works. Publish exact API/ledger/error contracts before A connects checkout.

**Decision record:** sections 1–6 approved directly by Person B (Angel); section 7 selected under Person B's explicit delegation on 18 October 2026. Person A's separate approval is not recorded. B2.1/B2.2 are merged; B2.3/B2.4 remain unimplemented. Controls stay gated by dependencies and verification. Section 7 supersedes older policy-pending notes for these demo choices; the [B2.2 contract](lib/bookings/README.md) remains the boundary of implemented behavior. Reviewed policy changes must preserve existing booking snapshots.
