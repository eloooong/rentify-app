import { ProviderError } from "./provider";
import type { RefundProvider, RefundSnapshot } from "./refund-provider";
import type { PaymentClient } from "./work";

class RefundReviewError extends Error {}
function checked<T>(result: { data: T; error: unknown }): T {
  const cause = result.error as { message?: string } | null;
  if (cause?.message === "refund_review") throw new RefundReviewError();
  if (cause?.message === "provider_invalid")
    throw new ProviderError("provider_invalid");
  if (result.error) throw new Error("Refund persistence failed.");
  return result.data;
}
export async function runRefundWork(
  admin: PaymentClient,
  provider: RefundProvider,
) {
  const jobs = checked(await admin.rpc("claim_refund_work")) ?? [];
  let completed = 0;
  for (const job of jobs) {
    const lease = job.lease_token;
    try {
      let snapshot: RefundSnapshot;
      if (job.provider_refund_id)
        snapshot = await provider.retrieve(job.provider_refund_id);
      else {
        const refunds = await provider.list(job.payment_id);
        const matching = refunds.filter((r) => r.reference === job.id);
        if (matching.length > 1) throw new ProviderError("provider_invalid");
        if (matching[0]) snapshot = matching[0];
        else if (job.creation_started_at) {
          // No match is not evidence that a timed-out POST failed. Retain the
          // reservation and continue read-only discovery, never another POST.
          checked(
            await admin.rpc("fail_refund_work", {
              p_refund: job.id,
              p_lease: lease,
              p_code: "refund_unknown",
            }),
          );
          continue;
        } else {
          const known =
            checked(
              await admin
                .from("refund_attempts")
                .select("id,provider_refund_id,state,amount")
                .eq("receipt_id", job.receipt_id),
            ) ?? [];
          if (
            refunds.some(
              (r) =>
                !known.some(
                  (f) =>
                    f.provider_refund_id === r.id &&
                    f.id === r.reference &&
                    f.state === r.status &&
                    f.amount === r.amount,
                ),
            )
          ) {
            checked(
              await admin.rpc("fail_refund_work", {
                p_refund: job.id,
                p_lease: lease,
                p_code: "refund_review",
              }),
            );
            continue;
          }
          checked(
            await admin.rpc("start_refund_creation", {
              p_refund: job.id,
              p_lease: lease,
            }),
          );
          snapshot = await provider.create(job);
        }
      }
      if (
        snapshot.reference !== job.id ||
        snapshot.payment_id !== job.payment_id ||
        snapshot.amount !== job.amount ||
        (job.provider_refund_id && snapshot.id !== job.provider_refund_id)
      )
        throw new ProviderError("provider_invalid");
      checked(
        await admin.rpc("sync_refund", {
          p_refund: job.id,
          p_lease: lease,
          p_snapshot: snapshot,
        }),
      );
      completed++;
    } catch (error) {
      checked(
        await admin.rpc("fail_refund_work", {
          p_refund: job.id,
          p_lease: lease,
          p_code:
            error instanceof RefundReviewError
              ? "refund_review"
              : error instanceof ProviderError
                ? error.code
                : "provider_unavailable",
        }),
      );
    }
  }
  return { claimed: jobs.length, completed };
}
