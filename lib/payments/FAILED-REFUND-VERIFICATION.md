# Xendit failed-refund verification — 5 November 2026

This record covers the separate `rentify-test` Supabase project and `https://rentify-test-blush.vercel.app`, using Rentify PH Xendit Test Mode, GCash and PHP only. It does not authorize live money, owner payouts or deposit settlement. The existing production refund adapter, worker and database commands were used without application or migration changes.

## Scenario and original unknown outcome

The official [error-simulation guide](https://docs.xendit.co/docs/simulate-error-scenarios) links the [simulation matrix](https://airtable.com/embed/appYc7UnQq5CmKe0G/shrkMfdd1IkvYDH58). Its Refunds tab lists GCash PHP 10,302 as general refund unavailability and PHP 20,302 as refund unavailability caused by payment-channel settlement constraints. Both use a successful payment with the specified amount followed by a refund.

The original PHP 10,302 fixture was rechecked through authenticated payment retrieval, filtered refund listing and independent matching against the unfiltered sandbox list. Its payment is succeeded, the sole generation-one refund attempt remains in review with a durable creation marker and no provider refund ID, and both lists still contain no match. The full 1,030,200-centavo obligation remains reserved with read-only discovery. No replacement POST, released reservation, synthetic provider failure or cleanup of this financial history was used.

A fresh fictional owner/renter, paused-after-cancellation listing and one-day booking were used for the distinct PHP 20,302 scenario. The quote contained 2,030,200 centavos of rent and zero deposit. The renter consented through the authenticated hosted checkout API, and Xendit's hosted eWallet Test Payment simulator completed the payment. Authenticated provider reconciliation recorded the exact succeeded capture before paid cancellation reserved the full refund.

## Observed failure and retry behavior

The first two submissions were instrumented and returned HTTP 200 with distinct `rfd-...` resources initially PENDING. The normal hosted minute worker submitted generation three and recorded its distinct PENDING resource. Authenticated refund list and individual GET requests subsequently agreed on FAILED with `REFUND_TEMPORARILY_UNAVAILABLE`, exact PHP amount, payment-request identity and the ledger attempt's UUID reference. Raw response bodies, credentials and transport correlation details stay in ignored local operator files.

- Generation one was created at 9:24 p.m. Asia/Manila. After an authenticated FAILED read, the worker recorded failure and queued generation two with a new UUID/key and a one-minute deadline. An early worker invocation claimed zero jobs and issued no POST.
- Two concurrent workers processing generation two claimed one job in total and made exactly one refund POST. The provider returned a second distinct resource, later confirmed FAILED through list and individual reads.
- Generation three used a third UUID/key and also progressed PENDING to provider-confirmed FAILED. All three database attempts are failed, have distinct provider IDs and have no next-check deadline. A further targeted worker call claimed zero jobs and made no POST; no fourth attempt exists.
- Final private status is `refund_due_amount=2030200`, `refund_pending_amount=0`, `refunded_amount=0`, `review_required=true`. The booked reservation remains cancelled and the captured amount is unchanged. Exhaustion clears active refund work without erasing the outstanding obligation.

| Generation | Provider resource                          | Final state                             |
| ---------- | ------------------------------------------ | --------------------------------------- |
| 1          | `rfd-8b6ef53c-ac53-41f6-952b-9d021a33e81d` | FAILED / REFUND_TEMPORARILY_UNAVAILABLE |
| 2          | `rfd-6ca03453-c97f-4684-989c-2c8d5cb6dc50` | FAILED / REFUND_TEMPORARILY_UNAVAILABLE |
| 3          | `rfd-e5022b0d-d35c-44de-a672-f813bcdc6806` | FAILED / REFUND_TEMPORARILY_UNAVAILABLE |

The fictional booking is `8ff5413e-cf51-4734-a122-eb169ba1d4bd`. Final ledger/provider comparison was completed on 5 November 2026, Asia/Manila; operator timestamps remain UTC in the ignored evidence files. The original PHP 10,302 fixture was independently rechecked afterward and still has exactly one reserved unknown attempt.

The amount-specific simulator consistently exercises failure; this scenario does not claim a later successful refund. Existing full/partial success and unknown-response recovery evidence remains in the [payment contract](README.md#verification-gates) and [hosted environment record](../../supabase/TEST-ENVIRONMENT.md).

## Validation and handoff

The ignored operator harness has an exact hosted project/origin guard, requires a development key and retains durable fixture state. It invokes the production worker with claims scoped to this fixture; it does not alter due times, forge provider snapshots, reset hosting or expose a simulator route. Normal hosted minute workers remain active. The fictional listing is paused and both fixture accounts are suspended. Financial, notification and audit records are preserved. No financial fixture was deleted or declared repaid.

`npm ci --no-audit --no-fund` passed. The focused adapter/worker command `npm exec -- vitest run lib/payments/refund-provider.test.ts lib/payments/refund-work.test.ts` passed all 21 tests. `npm run db:test:refunds` could not start because the local Docker Linux engine was stopped; no local database assertion ran. The actual hosted checks above are separate evidence. Repository changes for this task are documentation only; no new application build or schema migration is required.

Review this evidence before closing B2.3/B2.4/A2.3 acceptance. Original unknown outcomes and deliberately exhausted sandbox obligations remain operator-review records, not successful repayments. Multi-page provider pagination and idempotency retention were not exercised by this small fixture; the application never relies on repeating an uncertain POST. Broader release, custody and dispute policies remain separate gates.
