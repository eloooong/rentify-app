# B3.1 booking email delivery

The local sandbox queues and captures transactional booking emails in Mailpit, using the [booking email copy](EMAIL-TEMPLATES.md). The existing [in-app contract](README.md) continues to deliver chat and booking alerts. Signup and password recovery use Supabase Auth mail.

## Run the local sandbox

1. Run `npm run db:start` and `npx supabase migration up --local` to start Supabase and apply pending migrations to the local database.
2. Run `npm run emails:local -- --loop` in a dedicated terminal. It checks for work every minute while running. Use `npm run emails:local` for a single pass.
3. Trigger a booking event and open the [local Mailpit inbox](http://127.0.0.1:54324). All captures go to `booking-capture@example.test`. Press Ctrl+C in the worker terminal to stop the loop.

Run `npm run test:emails:local` to exercise actual Mailpit capture, concurrent claims, reminder rules, stale booking suppression, retries and uncertain acceptance. Hosted email delivery still requires provider setup, a protected scheduler and rollout verification.

## Local templates and eligibility

| Event             | Recipients       | Eligibility at dispatch                                                      |
| ----------------- | ---------------- | ---------------------------------------------------------------------------- |
| New request       | Owner            | Booking is still `requested` and the request deadline has not passed         |
| Accepted request  | Renter           | Booking is still `accepted` and the payment window is open                   |
| Confirmed payment | Owner and renter | Booking is `paid` or `handed_over` with trusted payment confirmation         |
| Cancellation      | Owner and renter | Booking is `cancelled`. Use the same copy for paid and unpaid bookings       |
| Pickup reminder   | Owner and renter | Booking is `paid` and pickup is tomorrow in Manila                           |
| Return reminder   | Owner and renter | Booking is `handed_over` and the inclusive return date is tomorrow in Manila |

Chat stays in-app. The local sandbox starts reminders at **9:00 a.m. Asia/Manila on the calendar day before** pickup or return. Participants still agree on the actual transfer hours. The database computes the local date from its clock and derives the inclusive return date as the booking range's exclusive upper bound minus one day.

A worker can catch up later that same Manila day. At the next midnight it skips the stale reminder because “tomorrow” is no longer accurate. Same-day rentals get the pickup reminder only. Disputed, cancelled, completed, and already transferred bookings fall out of the relevant reminder filter. Inspection reminders and escalation timing belong to B3.3. Event emails expire after 24 hours, or at an earlier request or payment deadline.

## Delivery and retries

The database inserts a private delivery record in the same transaction as the trusted booking event. The worker discovers reminders separately. Unique event and reminder keys keep repeated scans safe. Queue rows store identifiers and timing metadata. They contain no email addresses or message bodies.

The local worker claims a bounded batch with a lease and an attempt token. The claim rechecks booking state, participant role, deadline and account eligibility. It records `skipped` if eligibility has changed. The token prevents an expired worker from overwriting a later result. Mailpit acceptance records `captured` with the capture ID. A confirmed rate limit retries after one and five minutes within the send window, with up to three attempts. A timeout or expired lease with uncertain acceptance goes to `needs_review`.

## Hosted proposal

Send with the same provider idempotency key for every attempt for that delivery. Record `accepted` when the provider accepts the message and `delivered` only after an authenticated delivery event. Deduplicate callback event IDs and correlate provider message IDs to queued deliveries. Track bounces and permanent provider rejection separately for operator review. Keep callback metadata minimal and restrict delivery records to trusted server roles.

For confirmed transient rejection, respect a longer provider retry delay within the send window. After an uncertain acceptance, reconcile first and retry only while the provider guarantees deduplication for the same key. Require documented idempotency scope and retention or a reliable status lookup before enabling those retries.

The existing [hosted test environment](../../supabase/TEST-ENVIRONMENT.md#running-and-monitoring-workers) uses Supabase Cron and `pg_net` for protected worker calls. Reuse that scheduling pattern with a dedicated email worker token in Vault, separate from payment credentials. The request carries no recipient or email content. Track queue age, attempts, skipped deliveries, and provider results in addition to cron job success. Pausing the email scheduler and disabling sends is the rollout stop procedure. [Supabase scheduling documentation](https://supabase.com/docs/guides/functions/schedule-functions)

## Sandbox and rollout

- Hosted testing uses the separate `rentify-test` project and a sandbox transport with no arbitrary external delivery. The worker must enforce a test project/origin guard and a server-side sink allowlist, then route every permitted message to a fixed capture inbox. Missing or mismatched sandbox configuration fails closed. Resolve actual recipient addresses only in an explicitly enabled delivery environment.
- Before enabling hosted sandbox sends, agree on the template set and reminder cadence, choose a provider or capture transport, confirm credentials and sender setup, and review the private schema and worker contract. Configure the worker only after the migration and access tests pass. Consider production sender, consent and retention rules in a separate rollout.

## Hosted acceptance checks

| Area                | Expected result                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing and privacy | Each role receives only the intended template. Booking links require sign-in and reject unrelated accounts. Messages and logs exclude chat text, contact details beyond the transport recipient, payment data, and evidence. |
| Sandbox isolation   | The test worker rejects a production project or missing sandbox settings. The capture transport receives only the fixed sink address. Auth confirmation and reset emails still use their own path.                           |
| Timing              | Manila midnight boundaries, inclusive return dates, same-day rentals, late payment, early return, cancellation, and scheduler catch-up all produce the expected send or skip.                                                |
| Concurrent workers  | Repeated scans and concurrent claims yield one delivery per key. A stale lease cannot overwrite the final state.                                                                                                             |
| Provider failures   | Confirmed transient rejection retries within the bound. Permanent rejection or bounce does not resend. Lost responses reconcile or enter review. Duplicate or out-of-order callbacks leave a consistent final status.        |
| Operations          | Worker lag and delivery errors are observable without logging addresses or message bodies. Pausing email leaves in-app notifications and payment jobs working.                                                               |
