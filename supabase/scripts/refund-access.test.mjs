import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "real paid cancellation, privacy, full/remaining refunds, leases, retries and races",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, connection }) => {
        const [owner, renter, , outsider] = clients;
        let offset = 4;
        async function paid() {
          const b = data(
            await renter.rpc("request_booking", {
              p_listing: fixtures.listings[0].id,
              p_pickup: day(offset),
              p_return: day(offset + 2),
              p_request_key: randomUUID(),
            }),
          ).booking;
          offset += 5;
          data(
            await owner.rpc("act_on_booking", {
              p_booking: b.id,
              p_action: "accept",
            }),
          );
          const a = data(
            await renter.rpc("prepare_checkout", {
              p_booking: b.id,
              p_policy: "demo-payments-v1",
            }),
          );
          const job = data(
            await admin.rpc("claim_payment_work", {
              p_attempt: a.id,
              p_limit: 1,
            }),
          )[0];
          const suffix = randomUUID().replaceAll("-", "");
          const snapshot = {
            session_id: `cs_${suffix}`,
            reference: a.id,
            checkout_url: `https://checkout.paymongo.com/${suffix}`,
            status: "active",
            livemode: false,
            payments: [
              {
                id: `pay_${suffix}`,
                amount: a.total_amount,
                currency: "PHP",
                method: "gcash",
                paid_at: new Date().toISOString(),
              },
            ],
          };
          assert.equal(
            data(
              await admin.rpc("sync_checkout", {
                p_attempt: a.id,
                p_lease: job.lease_token,
                p_snapshot: snapshot,
              }),
            ),
            "paid",
          );
          return {
            booking: b.id,
            attempt: a.id,
            snapshot,
            payment: `pay_${suffix}`,
          };
        }
        const status = async (id, client = renter) =>
          data(await client.rpc("get_booking_refunds", { p_booking: id }));
        const cancel = (id, client = renter, reason = "Changed plans") =>
          client.rpc("cancel_paid_booking", {
            p_booking: id,
            p_reason: reason,
          });
        async function claim(id) {
          const jobs = data(
            await admin.rpc("claim_refund_work", { p_refund: id }),
          );
          assert.equal(jobs.length, 1);
          return jobs[0];
        }
        const start = (job) =>
          admin.rpc("start_refund_creation", {
            p_refund: job.id,
            p_lease: job.lease_token,
          });
        function result(job, state = "succeeded") {
          return {
            id: `ref_${job.id.replaceAll("-", "")}`,
            payment_id: job.payment_id,
            amount: job.amount,
            currency: "PHP",
            livemode: false,
            status: state,
            reference: job.id,
          };
        }
        const sync = (job, snapshot) =>
          admin.rpc("sync_refund", {
            p_refund: job.id,
            p_lease: job.lease_token,
            p_snapshot: snapshot,
          });
        const due = (id) =>
          sql(
            `update public.refund_attempts set next_check_at=clock_timestamp()-interval '1 second' where id='${id}';`,
          );

        const first = await paid();
        assert.equal(
          sql(
            `select public.paid_cancellation_allowed(b,'${users[1].id}',lower(b.rental_period)::timestamp at time zone 'Asia/Manila') from public.bookings b where id='${first.booking}';`,
          ),
          "f",
          "Exact Manila midnight is closed",
        );
        assert.equal(
          sql(
            `select public.paid_cancellation_allowed(b,'${users[1].id}',(lower(b.rental_period)::timestamp at time zone 'Asia/Manila')-interval '1 microsecond') from public.bookings b where id='${first.booking}';`,
          ),
          "t",
          "The instant before the cutoff is eligible",
        );
        assert.equal((await status(first.booking)).can_cancel_paid, true);
        assert.equal(
          (
            await outsider.rpc("get_booking_refunds", {
              p_booking: first.booking,
            })
          ).error?.message,
          "not_found",
        );
        assert.equal(
          (await cancel(first.booking, outsider)).error?.message,
          "not_found",
        );
        assert.equal(
          (await cancel(first.booking, renter, "x")).error?.message,
          "invalid_action",
        );
        assert.equal(
          (await renter.from("refund_attempts").select("*")).error?.code,
          "42501",
        );
        assert.equal(
          (await renter.rpc("claim_refund_work")).error?.code,
          "42501",
        );
        assert.equal(
          (
            await connection
              .publicClient()
              .rpc("get_booking_refunds", { p_booking: first.booking })
          ).error?.code,
          "42501",
        );
        assert.equal(
          (
            await renter.rpc("sync_refund", {
              p_refund: randomUUID(),
              p_lease: randomUUID(),
              p_snapshot: {},
            })
          ).error?.code,
          "42501",
        );
        data(
          await admin
            .from("profiles")
            .update({ account_status: "suspended" })
            .eq("id", users[1].id),
        );
        assert.equal(
          (await cancel(first.booking)).error?.message,
          "profile_required",
        );
        assert.equal((await status(first.booking)).can_cancel_paid, false);
        data(
          await admin
            .from("profiles")
            .update({ account_status: "active" })
            .eq("id", users[1].id),
        );

        const race = await Promise.all([
          cancel(first.booking),
          cancel(first.booking),
        ]);
        assert.equal(
          data(race[0]).refunds.attempts[0].id,
          data(race[1]).refunds.attempts[0].id,
        );
        assert.equal(
          (await cancel(first.booking, owner)).error?.message,
          "idempotency_conflict",
        );
        assert.equal(
          (await cancel(first.booking, renter, "Different reason")).error
            ?.message,
          "idempotency_conflict",
        );
        let summary = await status(first.booking);
        assert.equal(summary.refund_due_amount, 425000);
        assert.equal(summary.refund_pending_amount, 425000);
        assert.equal(summary.refunded_amount, 0);
        assert.equal(summary.attempts.length, 1);
        assert.equal(summary.can_cancel_paid, false);
        assert.equal(summary.review_required, false);
        assert.equal(
          data(await owner.rpc("get_booking", { p_booking: first.booking }))
            .status,
          "cancelled",
        );
        const audits = data(
          await admin
            .from("audit_log")
            .select("id")
            .eq("target_id", first.booking)
            .eq("action", "booking.paid_cancelled"),
        );
        assert.equal(audits.length, 1);
        let job = await claim(summary.attempts[0].id);
        assert.equal(
          data(await admin.rpc("claim_refund_work", { p_refund: job.id }))
            .length,
          0,
          "Live lease prevents a second worker",
        );
        assert.equal(
          (await start({ ...job, lease_token: randomUUID() })).error?.message,
          "refund_lease",
        );
        data(await start(job));
        assert.equal(
          (await sync(job, { ...result(job), livemode: true })).error?.message,
          "provider_invalid",
        );
        assert.equal(
          (await sync(job, { ...result(job), amount: 425001 })).error?.message,
          "provider_invalid",
        );
        assert.equal(
          (await sync(job, { ...result(job), payment_id: "pay_wrong" })).error
            ?.message,
          "provider_invalid",
        );
        assert.equal(data(await sync(job, result(job, "pending"))), "pending");
        summary = await status(first.booking);
        assert.equal(
          summary.refunded_amount,
          0,
          "Submission does not prove success",
        );
        assert.equal(summary.refund_due_amount, 425000);
        due(job.id);
        job = await claim(job.id);
        assert.equal(
          data(await sync(job, result(job, "processing"))),
          "processing",
        );
        due(job.id);
        job = await claim(job.id);
        assert.equal(
          (await sync(job, result(job, "pending"))).error?.message,
          "provider_invalid",
          "No processing regression",
        );
        assert.equal(data(await sync(job, result(job))), "succeeded");
        assert.equal(
          (await sync(job, result(job))).error?.message,
          "refund_lease",
          "Replay cannot duplicate a successful refund",
        );
        summary = await status(first.booking);
        assert.equal(summary.refund_due_amount, 0);
        assert.equal(summary.refund_pending_amount, 0);
        assert.equal(summary.refunded_amount, 425000);
        assert.equal(
          data(await renter.rpc("get_checkout", { p_booking: first.booking }))
            .refund_due_amount,
          0,
        );
        assert.equal(
          data(
            await admin
              .from("payments")
              .select("id")
              .eq("booking_id", first.booking),
          ).length,
          2,
          "Captured allocations remain historical; refund ledger is separate",
        );

        const retry = await paid();
        summary = data(await cancel(retry.booking, owner)).refunds;
        for (let generation = 1; generation <= 3; generation++) {
          const item = summary.attempts.at(-1);
          due(item.id);
          job = await claim(item.id);
          data(await start(job));
          assert.equal(data(await sync(job, result(job, "failed"))), "failed");
          summary = await status(retry.booking);
          assert.equal(summary.refunded_amount, 0);
          assert.equal(summary.refund_due_amount, 425000);
          assert.equal(summary.attempts.length, Math.min(generation + 1, 3));
        }
        assert.equal(summary.refund_pending_amount, 0);
        assert.equal(
          summary.review_required,
          true,
          "Exhausted retries keep the obligation visible for review",
        );

        const unknown = await paid();
        summary = data(await cancel(unknown.booking)).refunds;
        job = await claim(summary.attempts[0].id);
        data(await start(job));
        sql(
          `update public.refund_attempts set lease_until=clock_timestamp()-interval '1 second' where id='${job.id}';`,
        );
        const newLease = await claim(job.id);
        assert.ok(newLease.creation_started_at);
        assert.equal(
          (await sync(job, result(job))).error?.message,
          "refund_lease",
        );
        data(
          await admin.rpc("fail_refund_work", {
            p_refund: job.id,
            p_lease: newLease.lease_token,
            p_code: "refund_unknown",
          }),
        );
        summary = await status(unknown.booking);
        assert.equal(summary.review_required, true);
        assert.equal(summary.refund_pending_amount, 425000);
        assert.equal(summary.attempts.length, 1);
        due(job.id);
        job = await claim(job.id);
        assert.equal(
          data(await sync(job, result(job))),
          "succeeded",
          "Read-only discovery can settle unknown creation",
        );

        const partial = await paid();
        summary = data(await cancel(partial.booking)).refunds;
        // Trusted isolated fixture models an already confirmed partial refund. No
        // browser can choose this amount; deposit settlement remains a later feature.
        sql(`update public.refund_attempts set amount=10000,state='succeeded',next_check_at=null where id='${summary.attempts[0].id}';
      select public.queue_receipt_refund(receipt_id) from public.refund_attempts where id='${summary.attempts[0].id}';`);
        summary = await status(partial.booking);
        assert.equal(summary.refunded_amount, 10000);
        assert.equal(summary.refund_due_amount, 415000);
        assert.equal(summary.refund_pending_amount, 415000);
        assert.equal(summary.attempts.length, 2);
        assert.equal(
          summary.attempts[1].amount,
          415000,
          "Never refund more than the unrefunded capture",
        );

        const today = await paid();
        sql(
          `update public.bookings set rental_period=daterange('${day(0)}','${day(3)}','[)') where id='${today.booking}';`,
        );
        assert.equal((await status(today.booking)).can_cancel_paid, false);
        assert.equal(
          (await cancel(today.booking)).error?.message,
          "paid_cancellation_closed",
        );
        assert.equal((await status(today.booking)).attempts.length, 0);
        const handed = await paid();
        sql(
          `update public.bookings set status='handed_over' where id='${handed.booking}';`,
        );
        assert.equal(
          (await cancel(handed.booking)).error?.message,
          "paid_cancellation_closed",
        );

        const late = await paid();
        // Reconcile a distinct capture after paid cancellation: queue a separate
        // obligation without reopening the cancelled reservation.
        data(await cancel(late.booking));
        sql(
          `update public.checkout_attempts set next_check_at=clock_timestamp() where id='${late.attempt}';`,
        );
        const lateJob = data(
          await admin.rpc("claim_payment_work", {
            p_attempt: late.attempt,
            p_limit: 1,
          }),
        )[0];
        const lateSnapshot = structuredClone(late.snapshot);
        lateSnapshot.payments[0].id = `pay_${randomUUID().replaceAll("-", "")}`;
        assert.equal(
          data(
            await admin.rpc("sync_checkout", {
              p_attempt: late.attempt,
              p_lease: lateJob.lease_token,
              p_snapshot: lateSnapshot,
            }),
          ),
          "refund_due",
        );
        summary = await status(late.booking);
        assert.equal(summary.refund_due_amount, 850000);
        assert.equal(summary.attempts.length, 2);
        assert.equal(
          data(await renter.rpc("get_booking", { p_booking: late.booking }))
            .status,
          "cancelled",
        );

        const competing = await paid();
        const cancelled = await Promise.all([
          cancel(competing.booking),
          cancel(competing.booking, owner),
        ]);
        assert.equal(cancelled.filter((r) => !r.error).length, 1);
        assert.equal((await status(competing.booking)).attempts.length, 1);

        data(
          await admin
            .from("listings")
            .update({ deposit_amount: 0 })
            .eq("id", fixtures.listings[0].id),
        );
        const zeroDeposit = await paid();
        data(
          await admin
            .from("profiles")
            .update({ account_status: "suspended" })
            .eq("id", users[1].id),
        );
        const zeroRefund = data(
          await cancel(zeroDeposit.booking, owner),
        ).refunds;
        assert.equal(
          zeroRefund.refund_due_amount,
          255000,
          "Zero deposits do not create a deposit refund",
        );
        assert.equal(
          zeroRefund.attempts[0].amount,
          255000,
          "An eligible owner can cancel despite a suspended counterparty",
        );
        job = await claim(zeroRefund.attempts[0].id);
        sql(
          `update public.payment_receipts set paid_at=clock_timestamp()-interval '181 days' where id='${job.receipt_id}';`,
        );
        assert.equal(
          (await start(job)).error?.message,
          "refund_review",
          "A queued refund cannot start beyond the provider window",
        );
        data(
          await admin.rpc("fail_refund_work", {
            p_refund: job.id,
            p_lease: job.lease_token,
            p_code: "refund_review",
          }),
        );
        assert.equal((await status(zeroDeposit.booking)).review_required, true);
        assert.equal((await status(zeroDeposit.booking)).refunded_amount, 0);
      },
    );
  },
);
