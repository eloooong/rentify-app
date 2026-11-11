# Separate Rentify test environment

Created with Angel's approval on 25 October 2026. This is a fictional/sandbox environment; it does not authorize live money, owner payouts or deposit settlement.

| Resource              | Configuration                                                              |
| --------------------- | -------------------------------------------------------------------------- |
| App                   | https://rentify-test-blush.vercel.app                                      |
| Vercel project        | ARC Reactor / rentify-test, Hobby                                          |
| Database              | rentify-test, ref `oqtngsqpocmiezmszcid`, Singapore, quoted $0/month       |
| Supabase organization | Arc Reactor                                                                |
| Gateway               | Rentify PH Xendit Test Mode; development key only                          |
| Callbacks             | Payment Session Completed and Expired to the app's `/api/payments/webhook` |
| Workers               | Supabase Cron + pg_net, separate payment/refund POSTs every minute         |

The new database was bootstrapped from the merged migrations, without copying local data or touching the other connected projects. Management-tool migration timestamps were reconciled to the committed file versions after successful application. Future migrations must preserve that alignment. The history/scheduler migrations in this task are applied to isolated test/local databases for verification; their implementation PR still needs review before merge.

## Configuration and access

Vercel's **Production** environment holds the server secret for this separate Supabase project, the Xendit development key/callback token and an independently generated worker bearer token as sensitive variables. Preview/Development do not receive these secrets. Only the canonical app origin, Supabase project URL and publishable key use `NEXT_PUBLIC_` and Config visibility. New environment values require a redeployment.

Ignored `.env.staging.local` records operator configuration on B's machine; ordinary `.env.local` remains local Supabase with payment execution disabled. Never commit either file, copy hosted credentials into frontend code, print raw provider responses, or use the local-only seed/reset commands against hosting. Verification fixtures use a separate script with an exact project/origin guard and explicit fictional labels. Do not delete an unsettled financial fixture to hide its obligation.

Supabase Auth's Site URL and exact callback/recovery redirect allowlist match the HTTPS app; confirmation remains enabled and minimum password length is eight. Undeclared auth/service settings were preserved. Custom SMTP and ordinary email signup/recovery delivery have not been configured or verified; the payment checks use confirmed fictional test accounts.

## Running and monitoring workers

The app's existing `POST /api/payments/reconcile` and `/api/payments/refunds/reconcile` enforce the worker bearer token. They claim at most one leased job each; refunds require the separate execution flag. The minute interval suits the sandbox, not a high-volume backlog. Database booking expiry remains its own job.

Vault stores `rentify_test_app_origin` and `rentify_test_worker_token`. After checking HTTPS, callback configuration, development-key restrictions and the two authenticated endpoints, an operator activates [payment-scheduler.sql](ops/payment-scheduler.sql). That file contains no credentials and updates only the two named test jobs. No recurring Codex chat or workstation process is required.

Supabase's managed pg_net extension can expose its transient request queue to database-login roles. The queue therefore receives **only the scoped worker token**, never a Supabase server key or Xendit credential. Keep `net` and `vault` outside the Data API's exposed schemas. Real anonymous and authenticated API requests against `net.http_request_queue` are denied in the local access checks; do not add public SQL wrappers around it. Database/Vault access remains an operator privilege. [Supabase scheduling guidance](https://supabase.com/docs/guides/functions/schedule-functions).

Check actual HTTP results as well as Cron success: Cron can successfully enqueue an HTTP request whose destination later fails. Query only status/timing/count fields, not queue headers or decrypted Vault values:

```sql
select jobname, schedule, active
from cron.job where jobname in ('rentify-test-payments','rentify-test-refunds');
select status_code, timed_out, created
from net._http_response order by created desc limit 10;
select state, count(*) from public.checkout_attempts
where provider='xendit' group by state;
select state, count(*) from public.refund_attempts group by state;
```

Initial hosted verification observed consecutive minute executions for both jobs, HTTP 200 responses, no timeouts and an empty request queue. One-off operator checks may run `node --env-file=.env.staging.local supabase/scripts/payment-worker.mjs`; do not run a second unmonitored perpetual worker unnecessarily.

## Rollback and handoff

To stop new execution, set both Vercel payment flags false and redeploy. Disable only these test schedules, preserving the booking-expiry job and financial records:

```sql
select cron.unschedule('rentify-test-payments');
select cron.unschedule('rentify-test-refunds');
```

Do not discard unknown outcomes or reserved refunds. Inspect authenticated gateway evidence, pending/review work and audit records. Rotating the worker token requires updating Vercel and Vault together; retain normal lease fencing. If replacing the origin, update Vercel origins, Supabase Auth URLs, Vault origin and both Xendit callbacks before enabling again.

Person A owns booking-page paid cancellation/refund controls. Use the merged [refund contract](../lib/payments/REFUNDS.md); do not infer cancellation eligibility or refund success from browser state. The new [history contract](../lib/payments/HISTORY.md) supplies participant-only payment/refund records after its implementation PR merges. This task does not edit A's frontend files.

## Hosted edge-case results

- Genuine expired callbacks were durably received and processed for an ordinary session and one whose accepted create response was deliberately discarded. Each used one create POST. The unknown attempt initially retained `creation_unknown` with no session capability, then recovered through the genuine callback and provider read without a replacement charge.
- A separate PHP 100 hosted GCash payment completed and was cancelled. After its sole refund POST was accepted, the test transport discarded the response. The hosted worker discovered the matching reference, confirmed success and settled exactly PHP 100. Authenticated list/retrieval showed one refund, not a duplicate.
- The PHP 10,302 payment used the GCash failure value in Xendit's linked [simulation matrix](https://docs.xendit.co/docs/simulate-error-scenarios). No matching refund resource was returned. The full 1,030,200-centavo obligation remains in review and scheduled read-only discovery; no reservation was released or replacement POST sent merely because discovery was empty. Provider-confirmed FAILED and subsequent bounded retry acceptance remain unverified. This deliberately failed sandbox record is retained for operator investigation.

The fixture listing is paused after verification, and fictional accounts/financial audit records are retained. The failure scenario is not a successful refund and must not be hidden by cleanup. No live payment occurred.

## Hosted chat and notification rollout — 5 November 2026

Angel requested the first remaining B task: apply the merged chat/notification migration and verify hosted delivery/access. The existing free test project was paused; it was resumed through the Supabase dashboard and reported restoration complete before migration work. After the project became healthy, linking again restored the CLI connection. No reset, new migration, dependency change or frontend change was needed.

The CLI migration list showed every committed version aligned except `20261025155000`. The following command applied that sole pending migration unchanged and recorded its committed version/name in hosted migration history:

```sh
node node_modules/supabase/dist/supabase.js migration up --linked --project-ref oqtngsqpocmiezmszcid --yes
```

Hosted catalog checks confirmed RLS on conversations/messages/notifications and both messages and notifications in `supabase_realtime`. Six authenticated, unfiltered sockets (each of the owner, renter and admin-outsider subscribed to both tables) reached SUBSCRIBED, Postgres subscription readiness and database replication readiness before mutations. Every client called `await client.realtime.setAuth()` before joining.

Verification used fresh, confirmed fictional accounts and one fictional requested booking on the canonical HTTPS app. The operator script was kept under ignored `tmp/` and run with `node --env-file=.env.staging.local tmp/hosted-chat-rollout.mjs`; private fixture credentials and the machine-readable result remain ignored. Completed 5 November 2026 at 9:10 p.m. Asia/Manila (13:10 UTC). The hosted checks passed:

- Anonymous conversation/notification reads returned 401; an unrelated Origin returned 403 and an unsupported mutation content type returned 415. Both participants opened the same booking conversation; the admin-outsider received 404.
- A renter message returned 201 and reached both participants. An exact same-key retry returned 200 and the original message; a changed body returned 409. Direct message insertion was denied with 42501.
- Exactly one owner chat notification was created by the retry sequence. Its payload contained booking/conversation/message IDs only; the private event key was absent. Other users could not read or mark it through HTTP or table access.
- Recipient notification read UPDATE delivery and participant message read-receipt UPDATE delivery passed. Repeated read commands were idempotent.
- An owner reply reached the renter with a renter-only notification. Cancelling the unpaid fixture emitted booking-status alerts to both participants, and the closed booking retained chat access.
- The unrelated administrator's unfiltered message and notification sockets received zero events through the completed positive-delivery and read checks. Its HTTP lists were empty; direct message/notification selects revealed no fixture rows.

Fixture booking `83626fc2-092b-4418-9e32-73b58be27e12` is cancelled; listing is paused, accounts are suspended and the temporary admin role was removed. Chat/notification/audit evidence was retained. The script created no checkout, charge or refund. Existing payment/refund minute jobs remained active, and consecutive post-restore HTTP results were 200 without timeouts. The unresolved financial fixture was not altered.

B's hosted rollout gate is complete. A can use the hosted backend; A3.1's remaining browser/screen-reader checks and A3.2's bell/center remain separate. Email and scheduled reminders remain open. See the hosted review rollout below and the [Xendit acceptance evidence](../lib/payments/FAILED-REFUND-VERIFICATION.md). If containment is needed, stop using the chat UI while investigating; preserve messages/audit history and apply any schema correction through a new reviewed migration. Do not undo this migration by editing its committed file or dropping tables.

## Hosted review rollout

On 6 November 2026 (Asia/Manila), B applied `20261105134500_review_permissions.sql` from merged [PR #56](https://github.com/eloooong/rentify-app/pull/56) to `rentify-test` using `node node_modules/supabase/dist/supabase.js migration up --linked --project-ref oqtngsqpocmiezmszcid --yes`. This was the sole pending migration. The hosted migration history contains the committed version, review RLS is enabled, and client table access is denied. The anonymous role can call the narrow public review projection.

Hosted HTTPS and Auth verification used fictional owner, renter and admin-outsider accounts and a private draft listing with two isolated bookings. The completed fixture was inserted directly for verification because the normal completion flow is B3.3.

- Anonymous private reads returned 401, an admin outsider received 404 for reads and writes, and an incomplete booking rejected submission with 409. The API rejected a foreign Origin and a forged subject.
- Concurrent identical submissions returned 201 and 200 with the same review ID. Exactly one review and one audit row were created. A changed retry returned `review_exists`.
- The first review was publicly visible before the other participant submitted. Both directions and role-filtered rating summaries worked. Public responses exposed only the eight fields in the contract. Direct anonymous reads, anonymous eligibility RPC calls, and authenticated table updates were denied.

The fictional bookings, reviews, related audit and notification rows, draft listing and test accounts were removed. A post-run check found zero fixture accounts and listings, and the hosted review count returned to its pre-rollout value of zero. Person A can integrate against the [review contract](../lib/reviews/README.md).
