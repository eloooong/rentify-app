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
