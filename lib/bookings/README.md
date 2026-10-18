# Booking API contract — B2.2

Person B owns booking commands, migrations and generated types. Person B approved the demo rules in [DECISIONS.md](../../DECISIONS.md), sections 1–6. Person A integrates after this handoff merges. Payment, handover, settlement and paid cancellation stay gated by later dependencies and section 7's pending decisions.

## HTTP endpoints

Use same-origin requests with existing Supabase session cookies. Private routes verify the email-confirmed identity; mutations require an active account and completed profile. Suspended participants retain history reads. Every response, including public availability/errors, uses `Cache-Control: private, no-store, max-age=0`.

| Method / path                    | Input                                                                                         | Success                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/bookings`             | Strict JSON `{listing_id,pickup_date,return_date,request_key}`                                | `201 {data:Booking,replayed:false}`; identical retry `200` with `replayed:true` |
| `GET /api/bookings`              | Optional `role=all\|owner\|renter`, `status`, `page` (1–10000), `pageSize` (1–50; default 20) | `{data:Booking[],pagination:{page,pageSize,total}}`                             |
| `GET /api/bookings/:id`          | Booking UUID                                                                                  | `{data:Booking}` for participants; generic 404 for outsiders                    |
| `POST /api/bookings/:id/actions` | `{action:"accept"}` or `{action:"decline"\|"cancel",reason:string}`                           | `{data:Booking}`                                                                |
| `GET /api/bookings/availability` | Required `listingId` UUID, `from`, `to` ISO dates                                             | Public `{data:BookingAvailability}`                                             |

Dates use `YYYY-MM-DD`. Generate `request_key` with `crypto.randomUUID()` once per intended request; preserve it across network retries. Reusing it with another listing/dates returns 409. An identical retry returns the original quote with its current status, even after listing prices change. A fresh request needs a fresh key. Never submit prices, identities, status or extra fields.

Mutations require `Content-Type: application/json`, exact `Origin` matching `NEXT_PUBLIC_APP_URL`, and at most 32 KiB streamed body. Reasons are trimmed, 3–500 characters, without control characters. Unknown fields/query parameters return 400. A page beyond the last result returns an empty array with the correct total.

Runtime schemas and exported `Booking`, `BookingPage`, `BookingAvailability` types: [validation.ts](validation.ts). Generated RPC signatures: [database.types.ts](../supabase/database.types.ts).

## Booking DTO and quote

Every `Booking` includes:

- UUIDs: `id`, `listing_id`, `owner_id`, `renter_id`; participant-only information.
- Dates/duration: `pickup_date`, `return_date`, `rental_days` (1–30, both dates inclusive).
- Money: `daily_price_amount`, `rental_amount`, `deposit_amount`, `total_amount`, `currency`.
- State: `status`, `policy_version`, `request_expires_at`, `payment_expires_at`, `accepted_at`.
- History/UI: `closed_by`, `status_reason`, `is_expired`, `allowed_actions`, `created_at`, `updated_at`.

Amounts are integer minor units: `10000` means PHP 100.00. The server snapshots the listing daily price and displayed deposit: `rental_amount = daily_price_amount * rental_days`, `total_amount = rental_amount + deposit_amount`. This quote does not collect money or settle deposit custody. Clients cannot edit dates, participants or quotes. New commands use `policy_version="demo-booking-v1"`. Timestamps include an offset; nullable fields return `null`.

Older rows without a request key remain readable without invented quotes/deadlines. Daily price/policy/deadline fields may be null; actions are empty and commands return `legacy_booking`. A separately reviewed migration is needed before making them actionable.

Example: 20–22 November means 3 days and PostgreSQL range `[2026-11-20,2026-11-23)`. A reservation starting 22 November conflicts; starting 23 November is adjacent. One listing represents one physical device.

## Actions and clock rules

Calendar boundaries use `Asia/Manila`. Requests need at least 24 hours before **00:00 on the pickup date**, pickup no later than Manila today + 90 days, and 1–30 inclusive days. Request expiry is the earlier of creation + 24 hours or pickup midnight − 2 hours. Acceptance starts a 30-minute payment deadline. Repeated acceptance preserves the original deadline.

| Current status          | Actor / action                                                              | Result                     |
| ----------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `requested`             | Owner accepts before expiry, eligible renter and published/available device | `accepted`; reserves dates |
| `requested`             | Owner declines with reason                                                  | `declined`                 |
| `requested`             | Requesting renter cancels with reason                                       | `cancelled`                |
| `accepted`              | Owner or renter cancels before payment deadline, with reason                | `cancelled`                |
| `requested`, `accepted` | Trusted expiry at/after deadline                                            | `expired`                  |

Repeated decline/cancel succeeds only for the same actor and trimmed reason; changed retries return `idempotency_conflict`. Terminal bookings cannot reopen. `allowed_actions` is a current-actor UI hint revalidated under database locks. Past deadline means `is_expired:true` and no actions, even if stored status awaits expiry. Reads do not mutate; failed commands roll back their entire transaction, including lazy cleanup.

`requested` does not reserve against other renters. Reserving statuses are `accepted`, `paid`, `handed_over`, `returned`, `disputed`. Exclusion constraints prevent competing acceptances from both committing. The same renter cannot create overlapping open requests/reservations for one device. Commands lock the listing before booking rows and expire due holds before successful writes. Future payment/webhook commands must follow the same lock order and deadline checks.

An overdue `handed_over` device or any unresolved `disputed` booking blocks **all new acceptances**, including dates outside the original range. Calendar passage never proves return, completion or deposit release.

## Public availability

Only published listings with eligible owners are visible. `from >= Manila today`, `to >= from`, `to <= today + 119 days`. The returned `BookingAvailability` contains:

```ts
{
  listing_id: string;
  from: string;
  to: string;
  timezone: "Asia/Manila";
  earliest_pickup_date: string;
  latest_pickup_date: string;
  max_rental_days: 30;
  device_available: boolean;
  blocked_ranges: {
    from: string;
    to: string;
  }
  [];
}
```

Blocked ranges are inclusive and clipped to the query window. They contain no booking IDs, identities, statuses, reasons or payment data. Due accepted holds are omitted; the next successful write expires them before enforcing exclusions. Physical unavailability blocks the whole window without exposing its reason. Earliest/latest dates separately restrict requests; an empty blocked array alone does not authorize an out-of-window request. Availability may change before acceptance.

## Database permissions and expiry

Authenticated entry points: `request_booking(uuid,date,date,uuid)`, `act_on_booking(uuid,text,text)`, `get_booking(uuid)`, `list_my_bookings(text,booking_status,integer,integer)`. Public entry point: `booking_availability(uuid,date,date)`. Ordinary clients still cannot insert/update/delete booking rows. RLS permits participant-only reads. Definer functions pin an empty search path; private helpers have no client execution grants.

The migration enables `pg_cron` and schedules `rentify-booking-expiry` every minute: `select public.expire_booking_holds(100);`. It processes up to 100 listing parents, skips locked parents, prevents concurrent job runs with an advisory lock, and audits expiry once. The bounded function is executable by the service role; there is no HTTP trigger. Successful commands also clean stale holds, so scheduler delay cannot extend deadlines. No HTTP credentials are stored in cron.

Verify `pg_cron` availability/preloading before hosted deployment. Local Supabase and CI test actual scheduled execution. Hosted migration, installation and monitoring remain deployment tasks. See Supabase's [installation](https://supabase.com/docs/guides/cron/install) and [scheduling guide](https://supabase.com/docs/guides/cron/quickstart).

## Error contract

Errors: `{error:{code,message,fields?}}`; `fields` appears for Zod validation. SQL, raw constraints and other participants' data are never echoed. Branch on stable codes and display the human message.

| HTTP      | Codes                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400       | `validation`, `invalid_body`, `invalid_json`, `invalid_dates`, `invalid_query`, `invalid_action`, `self_booking`, `unsupported_currency`, `price_limit`                                          |
| 401       | `sign_in`                                                                                                                                                                                        |
| 403       | `origin`, `profile_required`, `forbidden`                                                                                                                                                        |
| 404       | `not_found`                                                                                                                                                                                      |
| 409       | `duplicate_request`, `idempotency_conflict`, `booking_conflict`, `booking_expired`, `invalid_transition`, `unavailable_listing`, `device_unavailable`, `legacy_booking`, `dependencies`, `retry` |
| 413 / 415 | `too_large` / `content_type`                                                                                                                                                                     |
| 503       | `unavailable`                                                                                                                                                                                    |

`retry` covers serialization/deadlock/lock/statement timeouts. Retry transient failures with the same key/details; business conflicts require refreshed state or different dates.

## Verification and remaining work

```sh
# Preserve development data; never edit applied migrations.
npm exec -- supabase migration up --local
npm run db:lint
npm run db:test
npm run db:test:bookings
npm run db:types
# Start the app at its configured local origin, then:
npm run test:bookings:http
```

The SQL suite has 240 checks across six files. Booking tests use real Auth, independent PostgreSQL transactions, concurrent retries/acceptances, and actual scheduled expiry. HTTP tests use real SSR cookies for sessions, origin checks, rejected price/identity injection, strict bodies, quote/retry/list/action contracts and date-only availability. Optional `RENTIFY_TEST_BASE_URL` must be a local HTTP origin matching app configuration. Fixtures clean only their exact accounts/listings/uploads/bookings/audit IDs; existing development data is preserved.

B2.2's ordinary actions expose no paid/handover/return/completion/dispute command. Merged B2.3's [test payment contract](../payments/README.md) adds checkout, trusted provider confirmation and reconciliation. B2.4's separate [paid cancellation/refund contract](../payments/REFUNDS.md) adds a dedicated cancellation endpoint and private refund status; paid cancellation is not added to this contract's ordinary `allowed_actions`. B2.4 integration waits for its merge/handoff. Actual PayMongo checkout/refund verification remains pending and both execution flags stay disabled. No public payment simulator, payout, automatic completion or deposit settlement is enabled.
