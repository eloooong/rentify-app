# B3.1 email delivery proposal

This is a proposal for transactional booking emails, with [copy ready for review](EMAIL-TEMPLATES.md). The existing [in-app contract](README.md) continues to deliver chat and booking alerts. Email would use a separate server-side delivery path. Signup and password recovery remain Supabase Auth mail.

## Proposed first batch

| Event             | Recipients       | Eligibility at dispatch                                                      |
| ----------------- | ---------------- | ---------------------------------------------------------------------------- |
| New request       | Owner            | Booking is still `requested` and the request deadline has not passed         |
| Accepted request  | Renter           | Booking is still `accepted` and the payment window is open                   |
| Confirmed payment | Owner and renter | Booking is `paid` or `handed_over` with trusted payment confirmation         |
| Cancellation      | Owner and renter | Booking is `cancelled`. Use the same copy for paid and unpaid bookings       |
| Pickup reminder   | Owner and renter | Booking is `paid` and pickup is tomorrow in Manila                           |
| Return reminder   | Owner and renter | Booking is `handed_over` and the inclusive return date is tomorrow in Manila |

Chat remains in-app in this proposal. Start reminders at **9:00 a.m. Asia/Manila on the calendar day before** pickup or return. This is a proposed notification time. Participants still agree on the actual transfer hours. Compute the local date from the server clock, derive the inclusive return date as the booking range's exclusive upper bound minus one day, and convert the resulting local timestamp to UTC. Store the due time as a timestamp with time zone.

A scheduler outage may catch up later that same Manila day. At the next midnight, skip the stale reminder because “tomorrow” is no longer accurate. Same-day rentals get the pickup reminder only because handover opens on the pickup date under the checklist contract in PR #59. Disputed, cancelled, completed, and already transferred bookings fall out of the relevant reminder filter. Inspection reminders and escalation timing belong to B3.3. For event emails, propose a maximum age of 24 hours from the event, with earlier request and payment deadlines taking precedence.

## Delivery and retries

1. In a later migration, insert a private delivery record in the transaction that emits an eligible booking event. Schedule discovery for reminders separately. Use the trusted event ID, recipient UUID, and template key for event deduplication. For reminders use booking UUID, reminder kind, intended local date, and recipient UUID. Enforce both keys with unique constraints and make scanning repeatable. Store UUIDs and timing metadata rather than recipient addresses or message bodies in the queue.
2. A server worker claims a bounded batch with a lease and an attempt token. Before sending it rechecks the booking state, its role mapping, event or reminder deadline, and the recipient's active, verified account. Resolve the current verified email only on the server. If the booking or recipient is no longer eligible, record `skipped`. Use a fenced update so an expired worker cannot overwrite a later result.
3. Send with the same provider idempotency key for every attempt for that delivery. Record `accepted` when the provider accepts the message and `delivered` only after an authenticated delivery event. Deduplicate authenticated callback event IDs and correlate the provider message ID to the queued delivery. Track bounces and permanent provider rejection separately for operator review. Keep callback metadata minimal and restrict delivery records to trusted server roles.
4. For confirmed transient rejection, propose retrying after one minute and five minutes, up to three total attempts and only within the send window. Respect a longer provider retry delay within that window. For a timeout or crash with unknown acceptance, reconcile first and retry only while the provider guarantees deduplication for the same key. Otherwise record `needs_review`. Require the selected provider to document idempotency scope and retention or offer a reliable status lookup before enabling retry after uncertainty.

The existing [hosted test environment](../../supabase/TEST-ENVIRONMENT.md#running-and-monitoring-workers) uses Supabase Cron and `pg_net` for protected worker calls. Reuse that scheduling pattern with a dedicated email worker token in Vault, separate from payment credentials. The request carries no recipient or email content. Track queue age, attempts, skipped deliveries, and provider results in addition to cron job success. Pausing the email scheduler and disabling sends is the rollout stop procedure. [Supabase scheduling documentation](https://supabase.com/docs/guides/functions/schedule-functions)

## Sandbox and rollout

- Local development uses fictional accounts and an isolated capture inbox such as the existing local Mailpit. Exercise worker claims, retries, and callback processing with deterministic provider fixtures. Capture one rendered message per template.
- Hosted testing uses the separate `rentify-test` project and a sandbox transport with no arbitrary external delivery. The worker must enforce a test project/origin guard and a server-side sink allowlist, then route every permitted message to a fixed capture inbox. Missing or mismatched sandbox configuration fails closed. Resolve actual recipient addresses only in an explicitly enabled delivery environment.
- Before enabling hosted sandbox sends, agree on the template set and reminder cadence, choose a provider or capture transport, confirm credentials and sender setup, and review the private schema and worker contract. Configure the worker only after the migration and access tests pass. Consider production sender, consent and retention rules in a separate rollout.

## Acceptance checks

| Area                | Expected result                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing and privacy | Each role receives only the intended template. Booking links require sign-in and reject unrelated accounts. Messages and logs exclude chat text, contact details beyond the transport recipient, payment data, and evidence. |
| Sandbox isolation   | The test worker rejects a production project or missing sandbox settings. The capture transport receives only the fixed sink address. Auth confirmation and reset emails still use their own path.                           |
| Timing              | Manila midnight boundaries, inclusive return dates, same-day rentals, late payment, early return, cancellation, and scheduler catch-up all produce the expected send or skip.                                                |
| Concurrent workers  | Repeated scans and concurrent claims yield one delivery per key. A stale lease cannot overwrite the final state.                                                                                                             |
| Provider failures   | Confirmed transient rejection retries within the bound. Permanent rejection or bounce does not resend. Lost responses reconcile or enter review. Duplicate or out-of-order callbacks leave a consistent final status.        |
| Operations          | Worker lag and delivery errors are observable without logging addresses or message bodies. Pausing email leaves in-app notifications and payment jobs working.                                                               |
