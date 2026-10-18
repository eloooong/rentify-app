import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PaymentProvider } from "./provider";
import { ProviderError } from "./provider";

export type PaymentClient = SupabaseClient<Database>;
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Payment persistence failed.");
  return result.data;
}
export async function runPaymentWork(
  admin: PaymentClient,
  provider: PaymentProvider,
  origin: string,
  attempt?: string,
) {
  // One bounded provider job per invocation; acquire its lease immediately before work.
  const jobs =
    checked(
      await admin.rpc("claim_payment_work", {
        ...(attempt ? { p_attempt: attempt } : {}),
        p_limit: 1,
      }),
    ) ?? [];
  let completed = 0;
  for (const job of jobs) {
    const lease = job.lease_token!;
    try {
      const closed = !checked(
        await admin.rpc("checkout_can_pay", { p_booking: job.booking_id }),
      );
      const id = job.session_id ?? job.candidate_session_id;
      if (!id && closed) {
        // A timed-out create may have succeeded. Only its webhook/provider lookup can resolve it.
        checked(
          await admin.rpc("fail_payment_work", {
            p_attempt: job.id,
            p_lease: lease,
            p_code: job.creation_started_at ? "creation_unknown" : "no_session",
          }),
        );
        continue;
      }
      if (!id)
        checked(
          await admin.rpc("start_checkout_creation", {
            p_attempt: job.id,
            p_lease: lease,
          }),
        );
      let snapshot = id
        ? await provider.retrieve(id)
        : await provider.create(job, origin);
      if (snapshot.reference !== job.id || (id && snapshot.session_id !== id))
        throw new ProviderError("provider_invalid");
      if (
        closed &&
        snapshot.status === "active" &&
        snapshot.payments.length === 0
      ) {
        // Expire can reject a pending/paid session; always retrieve after the attempt.
        try {
          await provider.expire(snapshot.session_id);
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error;
        }
        snapshot = await provider.retrieve(snapshot.session_id);
      }
      checked(
        await admin.rpc("sync_checkout", {
          p_attempt: job.id,
          p_lease: lease,
          p_snapshot: snapshot,
        }),
      );
      completed++;
    } catch (error) {
      checked(
        await admin.rpc("fail_payment_work", {
          p_attempt: job.id,
          p_lease: lease,
          p_code:
            error instanceof ProviderError
              ? error.code
              : "provider_unavailable",
        }),
      );
    }
  }
  return { claimed: jobs.length, completed };
}
