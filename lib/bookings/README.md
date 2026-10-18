# Booking database contract — B2.1

Person B owns this contract, migrations and generated types. The demo rules in [DECISIONS.md](../../DECISIONS.md), sections 1–6, were approved by Person B on 18 October 2026. Payment/gateway/refund/deposit settlement decisions remain pending.

## Implemented in this handoff

One listing represents one physical device. The existing `bookings` table retains its owner/listing foreign key, self-booking check, currency/amount constraints and status enum. The new migration adds:

| Field / constraint                | Behavior                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `rental_period`                   | PostgreSQL `daterange`; store `[pickup_date, return_date + 1 day)`                        |
| `rental_days`                     | Generated, non-null integer; 1–30 inclusive rental days. Clients cannot supply or edit it |
| `bookings_reserved_dates_excl`    | No overlapping ranges for one listing when both rows reserve dates                        |
| `bookings_renter_open_dates_excl` | No overlapping open requests/reservations for the same renter and listing                 |
| `bookings_participant_read`       | Authenticated owner/renter may read their own bookings only                               |

**Reserving statuses:** `accepted`, `paid`, `handed_over`, `returned`, `disputed`.

**Open statuses for duplicate-request protection:** the reserving statuses plus `requested`.

`requested` does not reserve the device against other renters. `declined`, `expired`, `cancelled`, and `completed` do not reserve dates or prevent another request. An expired deadline alone does not release a row still marked `accepted`: B2.2 must explicitly change its status. No time-dependent predicate is used in the exclusion constraints.

Example: pickup 20 November / return 22 November is `[2026-11-20,2026-11-23)` with `rental_days = 3`. Another reservation starting 22 November conflicts; one starting 23 November is adjacent and allowed by the range constraint. Existing reservations for another device do not conflict.

## Access and integration gate for Person A

Only `SELECT` is granted to ordinary authenticated clients. Anonymous users cannot read the table. RLS filters bookings by the verified session's user ID matching `owner_id` or `renter_id`; public listing visibility does not expose bookings. Participants retain read access to their history if a listing is paused or an account is suspended. No browser admin privilege or public availability surface is enabled.

Use the existing typed request-scoped Supabase client to read a participant's bookings. Do not use a privileged key or expose unrestricted rows to the browser. `lib/supabase/database.types.ts` is generated from the migrated database; its insert/update shape rejects manually assigned `rental_days`.

**No ordinary client may insert, update or delete bookings. There is no booking mutation RPC or HTTP endpoint in B2.1.** The database concurrency tests use trusted isolated fixture writes; they are not an authorized client acceptance API. Person A can prepare clearly labeled booking mocks but must wait for B2.2's action/response/error contract before connecting real booking controls.

## Errors for the later command layer

| SQLSTATE | Meaning                                                                                    |
| -------- | ------------------------------------------------------------------------------------------ |
| `23P01`  | Reservation overlap or duplicate open request; use the constraint name to distinguish them |
| `23514`  | Invalid duration/self-booking or another check violation                                   |
| `23503`  | Missing or inconsistent listing/owner reference                                            |
| `42501`  | Grant/RLS denial; never treat as successful mutation                                       |

B2.2 must map these to stable application errors without leaking SQL, other renters' identities or raw constraint details. The database guarantees competing overlapping reservations cannot both commit. A preliminary UI availability query does not replace the write-time constraint.

## Still required in B2.2 and later phases

- Verified active identity, completed profile and published/active listing checks for request/accept commands.
- Server-controlled immutable dates, identity and price/deposit snapshots; integer totals; 24-hour advance notice, 90-day horizon and status-transition permissions.
- Owner response/payment deadlines, explicit expiry, cancellation reasons and retry/idempotency behavior.
- A **separate physical-readiness check** blocking all new acceptances for overdue/unreturned or disputed devices, including dates beyond the existing range. B2.1's range constraint only covers the stored dates.
- Privacy-safe public availability exposing dates without booking IDs or participant details.
- Payment, handover/checklist, return, settlement and dispute dependencies before enabling their transitions. No payment/return/completion simulation is exposed by B2.1.

Until those commands exist, keep booking mutations disabled. Trusted backend/maintenance access still bypasses RLS, so it must enforce the approved command policies; structural duration, ownership and overlap constraints apply to its writes too.

## Apply and verify locally

```sh
# Apply the new migration without resetting existing development data.
npm exec -- supabase migration up --local
npm run db:lint
npm run db:test
npm run db:test:bookings
npm run db:types
```

The migration validates existing rows and installs `btree_gist` in the extensions schema. Existing overlong bookings or overlapping reserved/duplicate-open rows will cause the migration to fail atomically; it does not erase or silently cancel them. Review such data before applying. Do not edit an applied migration or use a whole-database reset merely to add B2.1.

SQL tests cover durations, all reserving/non-reserving statuses, same-device versus different-device ranges, duplicate requests, self-booking, owner consistency, generated-column protection, participant reads and denied writes, including accidental-grant defense. Fixtures roll back.

`db:test:bookings` first tests real Auth/HTTP access: owner/renter reads, outsider/anonymous denial and forbidden client creation/update/delete. It then uses real independent PostgreSQL sessions in the local Docker stack: hold the first transaction open and observe the competing transaction's database lock wait before committing. It verifies exactly one overlapping acceptance wins, the loser remains requested, adjacent/different-device reservations succeed independently, and duplicate concurrent requests cannot both be created. Only its isolated fixture IDs/accounts/uploads are removed; existing users, listings, bookings and Storage objects are preserved. Database CI runs this check after the SQL suite.

References: PostgreSQL 17 [range constraints](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT) and [btree_gist](https://www.postgresql.org/docs/17/btree-gist.html).
