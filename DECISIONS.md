# Rentify product decisions

**Status: demo booking defaults approved by Person B (Angel) — 18 October 2026.** Person B confirmed sections 1–6 in this chat and authorized B2.1. Approval records the intended behavior; it does not mean every rule is implemented. B2.1 adds structural database safeguards; B2.2 and later phases implement the remaining commands and dependencies. Section 7 stays pending. Record later changes here so both developers follow the same rules. Planning PDFs and demo prices do not override this record.

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

Example only: PHP 850/day for 20–22 November gives **PHP 2,550 rent**. If that listing has a PHP 1,700 demo deposit, show a **PHP 4,250 combined quote**. This example does not set a universal deposit or authorize collecting it. Deposit collection/hold/release mechanics remain pending gateway verification.

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
| `paid`                            | `handed_over` | Server after both parties confirm handover and the required checklist in the later checklist feature                      |
| `handed_over`                     | `returned`    | Server after both parties confirm physical return; this does not approve condition or release money                       |
| `returned`                        | `completed`   | Both parties approve the return inspection and the later settlement workflow is satisfied                                 |
| `paid`, `handed_over`, `returned` | `disputed`    | Participant records an issue; server preserves evidence and blocks automatic settlement                                   |

Only implement each transition when its payment/checklist/settlement dependency exists. The existing enum is vocabulary, not authorization. `declined`, `expired`, `cancelled` and `completed` are terminal for ordinary users. No participant can edit booking identities, quoted amounts or dates directly, erase history, or reopen a terminal booking.

The end of a rental date does not automatically prove handover, return or completion. Do not auto-complete or auto-release a deposit in B2.1/B2.2. Dispute resolution and paid cancellation transitions require the pending rules below.

## 7. Decisions still pending before money movement

| Topic                                   | Current decision                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment gateway                         | Pending: verify supported PHP test mode, webhook signatures, idempotency, refunds, authorization/hold windows and payout capabilities           |
| Deposit amount / custody                | Pending: decide limits and who holds it; do not describe the app as an escrow service                                                           |
| Cancellation after payment / refunds    | Pending: agree owner/renter cancellation rules, deadlines, amounts and provider fees before implementing B2.3/B2.4                              |
| No-show / late return / damage          | Pending: agree evidence and handling; do not invent automatic deductions or penalties                                                           |
| Inspection deadline / automatic release | Pending: no automatic release while unsettled                                                                                                   |
| Disputes                                | Pending: define admin authority, evidence, response times, appeals and money settlement; never auto-release funds during a dispute              |
| Live pilot / privacy / retention        | Pending: decide release readiness, permitted identity checks, data access and retention before collecting real user evidence or running rentals |

Until those decisions are agreed, use fictional/test data and keep live payment, payout, refund and deposit-release operations disabled. Never store card details. This document records demo product behavior; it is not a legal agreement or evidence of provider capabilities.

## 8. Implementation handoff and acceptance examples

B implements the approved booking rules through B2.1/B2.2 in a new task branch, adds migrations and generated types, and publishes exact API fields, errors, status transitions, access rules and date examples. A integrates only after that contract merges; A can keep building its listing editor/management meanwhile.

Required checks include: one-day and three-day totals; rejection of backwards/too-soon/overlong dates; adjacent versus overlapping reservations; self-booking and duplicate requests; exactly one winner under concurrent acceptance; stale holds; deadline boundary checks; immutable quotes after listing price changes; denied participant/outsider actions; and an overdue/disputed device remaining unavailable beyond its original dates.

**Decision record:** sections 1–6 approved for the demo by Person B (Angel) on 18 October 2026 in this chat; Person A's separate approval is not recorded. B2.1/B2.2 are authorized. Section 7 remains pending, and payment/checklist/settlement transitions stay gated by their actual dependencies. See the [booking implementation boundary](lib/bookings/README.md). Changing an agreed policy later requires a reviewed change, with existing booking snapshots preserved.
