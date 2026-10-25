# Transaction history contract — implementation ready for review

Person B owns this read API. Person A may integrate after its implementation PR merges. This does not add payment, refund, payout or deposit-settlement commands.

`GET /api/payments/history` uses verified session cookies and returns private, no-store JSON. Only bookings in which the caller is the renter or owner contribute rows, including after suspension. No caller-supplied user ID is accepted. Anonymous/unverified HTTP callers receive 401; malformed filters receive 400. Direct RPC access also requires an authenticated identity.

## Query

All filters are optional: `type=payment|refund`, `role=all|renter|owner` (default all), `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `page=1..10000` (default 1), `pageSize=1..50` (default 20). Unknown or repeated parameters are rejected. If both dates are present, from must be on or before to. Dates are inclusive calendar dates in Asia/Manila and filter `occurred_at`, not rental dates. Missing date bounds are open-ended.

## Response

```ts
type Transaction = {
  id: string; // payment:<receipt UUID> or refund:<attempt UUID>; no provider ID
  booking_id: string;
  listing_id: string;
  role: "renter" | "owner";
  type: "payment" | "refund";
  state:
    | "captured"
    | "review"
    | "queued"
    | "submitting"
    | "pending"
    | "processing"
    | "succeeded"
    | "failed";
  amount: number; // positive integer minor units; never a signed cash-flow total
  currency: string;
  provider: "paymongo" | "xendit";
  test_mode: true;
  occurred_at: string; // provider capture time, or refund request creation time
  updated_at: string; // receipt recorded time, or current refund update time
  rental_amount: number | null;
  deposit_amount: number | null;
};
type History = {
  data: Transaction[];
  pagination: { page: number; pageSize: number; total: number };
  timezone: "Asia/Manila";
};
```

One payment row represents one captured receipt, including a late/duplicate capture or a capture requiring review. It is not duplicated into rent and deposit transactions. The breakdown is present only when the receipt matches the saved checkout total, currency and method; it is null for mismatches and refund rows. `review` is not booking confirmation. A later refund does not erase or relabel the capture. There are no rows for unpaid checkout attempts or unimplemented payouts.

Each refund attempt is a separate row, including pending, failed and review attempts. Only `succeeded` establishes a confirmed refund; never count pending/failed attempts as money returned or sum every displayed amount as revenue. Owner access is booking visibility, not evidence of an owner payout. This API deliberately supplies no balance/net-earnings total.

Rows sort by occurred_at descending, then type and internal UUID descending for deterministic ties. Pagination totals use the same participant and filter predicates as the page. New transactions can shift offset pages; this is a current history view, not a frozen bank statement. Provider references, checkout URLs, raw payloads, worker errors, participant contact data and secrets are omitted. Reads work while payment execution flags are false and cover historical PayMongo and new Xendit test receipts.

RPC: `list_payment_history(p_type text default null, p_role text default 'all', p_from date default null, p_to date default null, p_page integer default 1, p_page_size integer default 20) returns jsonb`. The database repeats validation and participant checks. Ledger tables retain their existing deny-all client access; there is no new table or broad grant.
