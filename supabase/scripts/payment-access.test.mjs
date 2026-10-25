import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "Xendit namespace validation and legacy PayMongo worker isolation",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(async ({ admin, clients, fixtures }) => {
      const [owner, renter] = clients;
      const booking = data(
        await renter.rpc("request_booking", {
          p_listing: fixtures.listings[0].id,
          p_pickup: day(12),
          p_return: day(14),
          p_request_key: randomUUID(),
        }),
      ).booking;
      data(
        await owner.rpc("act_on_booking", {
          p_booking: booking.id,
          p_action: "accept",
        }),
      );
      const a = data(
        await renter.rpc("prepare_checkout", {
          p_booking: booking.id,
          p_policy: "demo-payments-v1",
        }),
      );
      const job = data(
        await admin.rpc("claim_payment_work", { p_attempt: a.id, p_limit: 1 }),
      )[0];
      assert.equal(job.provider, "xendit");
      const snapshot = {
        session_id: `ps-${randomUUID().replaceAll("-", "").slice(0, 24)}`,
        reference: a.id,
        checkout_url: "https://dev.xen.to/isolated",
        status: "active",
        livemode: false,
        payments: [],
      };
      const sync = (value) =>
        admin.rpc("sync_checkout", {
          p_attempt: a.id,
          p_lease: job.lease_token,
          p_snapshot: value,
        });
      assert.equal(
        (await sync({ ...snapshot, session_id: "cs_wrongprovider" })).error
          ?.message,
        "provider_invalid",
      );
      assert.ok(
        (
          await sync({
            ...snapshot,
            checkout_url: "https://checkout.xendit.co/sessions/live",
          })
        ).error,
      );
      assert.equal(data(await sync(snapshot)), "open");
      sql(
        `update public.checkout_attempts set provider='paymongo',session_id='cs_${a.id.replaceAll("-", "")}',checkout_url='https://checkout.paymongo.com/legacy',next_check_at=clock_timestamp() where id='${a.id}';`,
      );
      assert.equal(
        data(
          await admin.rpc("claim_payment_work", {
            p_attempt: a.id,
            p_limit: 1,
          }),
        ).length,
        0,
      );
      const history = data(
        await renter.rpc("get_checkout", { p_booking: booking.id }),
      );
      assert.equal(history.checkout_url, null);
      assert.equal(history.state, "review");
      assert.equal(
        (
          await renter.rpc("prepare_checkout", {
            p_booking: booking.id,
            p_policy: "demo-payments-v1",
          })
        ).error?.message,
        "legacy_booking",
      );
      const event = `xevt_${randomUUID().replaceAll("-", "").repeat(2)}`;
      try {
        data(
          await admin.rpc("enqueue_payment_event", {
            p_event: event,
            p_session: snapshot.session_id,
            p_reference: a.id,
            p_hash: "b".repeat(64),
          }),
        );
        assert.equal(
          data(
            await admin
              .from("checkout_attempts")
              .select("candidate_session_id")
              .eq("id", a.id)
              .single(),
          ).candidate_session_id,
          null,
        );
      } finally {
        sql(`delete from public.payment_events where event_id='${event}';`);
      }
      // A historical PayMongo refund obligation must never reach the Xendit worker.
      const receipt = data(
        await admin
          .from("payment_receipts")
          .select("id")
          .eq("attempt_id", a.id),
      );
      assert.equal(receipt.length, 0);
      sql(
        `insert into public.payment_receipts(attempt_id,payment_id,amount,currency,method,paid_at,disposition,reason) values('${a.id}','pay_${a.id.replaceAll("-", "")}',100,'PHP','gcash',clock_timestamp(),'refund_due','legacy_fixture');`,
      );
      const legacyReceipt = data(
        await admin
          .from("payment_receipts")
          .select("id")
          .eq("attempt_id", a.id)
          .single(),
      );
      const refund = data(
        await admin
          .from("refund_attempts")
          .select("id")
          .eq("receipt_id", legacyReceipt.id)
          .single(),
      );
      assert.equal(
        data(await admin.rpc("claim_refund_work", { p_refund: refund.id }))
          .length,
        0,
      );
    });
  },
);

test(
  "real checkout consent, private status, leased provider truth, duplicate receipts and terminal races",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, connection }) => {
        const [owner, renter, , outsider] = clients;
        async function accepted(offset) {
          const requested = data(
            await renter.rpc("request_booking", {
              p_listing: fixtures.listings[0].id,
              p_pickup: day(offset),
              p_return: day(offset + 2),
              p_request_key: randomUUID(),
            }),
          ).booking;
          data(
            await owner.rpc("act_on_booking", {
              p_booking: requested.id,
              p_action: "accept",
            }),
          );
          return requested.id;
        }
        const prepare = (id, client = renter, policy = "demo-payments-v1") =>
          client.rpc("prepare_checkout", { p_booking: id, p_policy: policy });
        async function claim(id) {
          const jobs = data(
            await admin.rpc("claim_payment_work", {
              p_attempt: id,
              p_limit: 1,
            }),
          );
          assert.equal(jobs.length, 1);
          return jobs[0];
        }
        function snapshot(
          job,
          paid = false,
          suffix = randomUUID().replaceAll("-", ""),
        ) {
          return {
            session_id: job.session_id ?? `ps-${suffix.slice(0, 24)}`,
            reference: job.id,
            checkout_url: `https://dev.xen.to/${suffix}`,
            status: "active",
            livemode: false,
            payments: paid
              ? [
                  {
                    id: `py-${suffix.slice(0, 8)}-${suffix.slice(8, 12)}-${suffix.slice(12, 16)}-${suffix.slice(16, 20)}-${suffix.slice(20)}`,
                    amount: job.total_amount,
                    currency: "PHP",
                    method: "gcash",
                    paid_at: new Date().toISOString(),
                  },
                ]
              : [],
          };
        }
        async function sync(job, value) {
          return admin.rpc("sync_checkout", {
            p_attempt: job.id,
            p_lease: job.lease_token,
            p_snapshot: value,
          });
        }
        const id = await accepted(7);
        assert.equal((await prepare(id, owner)).error?.message, "not_found");
        assert.equal((await prepare(id, outsider)).error?.message, "not_found");
        assert.equal(
          (await prepare(id, renter, "other")).error?.message,
          "payment_consent",
        );
        const parallel = (await Promise.all([prepare(id), prepare(id)])).map(
          data,
        );
        assert.equal(parallel[0].id, parallel[1].id);
        const attempt = parallel[0];
        assert.equal(attempt.total_amount, 425000);
        assert.equal(attempt.checkout_url, null);
        assert.equal(
          (await outsider.rpc("get_checkout", { p_booking: id })).error
            ?.message,
          "not_found",
        );
        assert.equal(
          (await renter.from("checkout_attempts").select("*")).error?.code,
          "42501",
        );
        assert.equal(
          (await renter.from("payment_receipts").select("*")).error?.code,
          "42501",
        );
        assert.equal(
          (await renter.rpc("claim_payment_work", { p_attempt: attempt.id }))
            .error?.code,
          "42501",
        );
        assert.equal(
          (
            await renter.rpc("sync_checkout", {
              p_attempt: attempt.id,
              p_lease: randomUUID(),
              p_snapshot: {},
            })
          ).error?.code,
          "42501",
        );
        assert.equal(
          (
            await connection
              .publicClient()
              .rpc("get_checkout", { p_booking: id })
          ).error?.code,
          "42501",
        );
        let job = await claim(attempt.id);
        assert.equal(
          data(await admin.rpc("claim_payment_work", { p_attempt: attempt.id }))
            .length,
          0,
          "Lease prevents another worker claim",
        );
        const first = snapshot(job);
        data(await sync(job, first));
        assert.equal(
          data(await owner.rpc("get_checkout", { p_booking: id })).checkout_url,
          null,
          "Owner cannot see renter checkout capability",
        );
        assert.equal(
          data(await renter.rpc("get_checkout", { p_booking: id }))
            .checkout_url,
          first.checkout_url,
        );
        data(
          await admin
            .from("listings")
            .update({ status: "paused" })
            .eq("id", fixtures.listings[0].id),
        );
        assert.equal(
          data(await renter.rpc("get_checkout", { p_booking: id }))
            .checkout_url,
          null,
          "Paused listing hides an existing payment capability",
        );
        assert.equal(
          data(await admin.rpc("checkout_can_pay", { p_booking: id })),
          false,
        );
        assert.equal((await prepare(id)).error?.message, "unavailable_listing");
        data(
          await admin
            .from("listings")
            .update({ status: "published" })
            .eq("id", fixtures.listings[0].id),
        );
        data(
          await admin
            .from("profiles")
            .update({ account_status: "suspended" })
            .eq("id", users[1].id),
        );
        assert.equal(
          data(await renter.rpc("get_checkout", { p_booking: id }))
            .checkout_url,
          null,
          "Suspended renter keeps history without a payment capability",
        );
        data(
          await admin
            .from("profiles")
            .update({ account_status: "active" })
            .eq("id", users[1].id),
        );
        const event = `xevt_${randomUUID().replaceAll("-", "").repeat(2)}`;
        const enqueue = (hash = "a".repeat(64)) =>
          admin.rpc("enqueue_payment_event", {
            p_event: event,
            p_session: first.session_id,
            p_reference: attempt.id,
            p_hash: hash,
          });
        assert.equal(data(await enqueue()), true);
        assert.equal(data(await enqueue()), false);
        assert.equal(
          (await enqueue("b".repeat(64))).error?.message,
          "event_conflict",
        );
        job = await claim(attempt.id);
        const paid = { ...first, payments: snapshot(job, true).payments };
        assert.equal(
          (await sync(job, { ...paid, livemode: true })).error?.message,
          "provider_invalid",
        );
        assert.equal(
          (await sync({ ...job, lease_token: randomUUID() }, paid)).error
            ?.message,
          "payment_lease",
        );
        assert.equal(data(await sync(job, paid)), "paid");
        assert.equal(
          data(await renter.rpc("get_booking", { p_booking: id })).status,
          "paid",
        );
        assert.equal(
          data(await admin.from("payments").select("*").eq("booking_id", id))
            .length,
          2,
          "One provider capture allocated once to rent and deposit",
        );
        const again = `xevt_${randomUUID().replaceAll("-", "").repeat(2)}`;
        data(
          await admin.rpc("enqueue_payment_event", {
            p_event: again,
            p_session: first.session_id,
            p_reference: attempt.id,
            p_hash: "c".repeat(64),
          }),
        );
        assert.equal(data(await sync(await claim(attempt.id), paid)), "paid");
        assert.equal(
          data(
            await admin
              .from("payment_receipts")
              .select("*")
              .eq("attempt_id", attempt.id),
          ).length,
          1,
        );
        assert.equal(
          data(await admin.from("payments").select("*").eq("booking_id", id))
            .length,
          2,
        );
        assert.equal(
          data(
            await admin
              .from("audit_log")
              .select("*")
              .eq("target_table", "payment_receipts")
              .eq("action", "payment.applied"),
          ).filter((row) => row.details.attempt_id === attempt.id).length,
          1,
        );

        const cancelId = await accepted(15);
        const cancelled = data(await prepare(cancelId));
        job = await claim(cancelled.id);
        const cancelSession = snapshot(job);
        data(await sync(job, cancelSession));
        data(
          await renter.rpc("act_on_booking", {
            p_booking: cancelId,
            p_action: "cancel",
            p_reason: "Changed plans",
          }),
        );
        assert.ok(
          data(
            await admin
              .from("checkout_attempts")
              .select("next_check_at")
              .eq("id", cancelled.id)
              .single(),
          ).next_check_at,
          "Cancellation durably wakes checkout reconciliation",
        );
        const late = {
          ...cancelSession,
          payments: snapshot(job, true).payments,
        };
        assert.equal(
          data(await sync(await claim(cancelled.id), late)),
          "refund_due",
        );
        assert.equal(
          data(await renter.rpc("get_booking", { p_booking: cancelId })).status,
          "cancelled",
        );
        assert.equal(
          data(await renter.rpc("get_checkout", { p_booking: cancelId }))
            .refund_due_amount,
          425000,
        );

        const expiryId = await accepted(24);
        const expiring = data(await prepare(expiryId));
        job = await claim(expiring.id);
        sql(
          `update public.bookings set payment_expires_at=clock_timestamp()-interval '1 second' where id='${expiryId}';`,
        );
        assert.equal(data(await sync(job, snapshot(job, true))), "refund_due");
        assert.equal(
          data(await renter.rpc("get_booking", { p_booking: expiryId })).status,
          "expired",
          "Expiry wins even if callback says paid",
        );
        const mismatchId = await accepted(35);
        const mismatch = data(await prepare(mismatchId));
        job = await claim(mismatch.id);
        const wrong = snapshot(job, true);
        wrong.payments[0].amount = 1;
        assert.equal(data(await sync(job, wrong)), "review");
        assert.equal(
          data(await renter.rpc("get_booking", { p_booking: mismatchId }))
            .status,
          "accepted",
        );
        assert.equal(
          data(
            await admin
              .from("payments")
              .select("id")
              .eq("booking_id", mismatchId),
          ).length,
          0,
        );
        assert.equal((await prepare(id)).error?.message, "payment_closed");
        const raceId = await accepted(50);
        const racing = data(await prepare(raceId));
        job = await claim(racing.id);
        const raced = await Promise.all([
          sync(job, snapshot(job, true)),
          renter.rpc("act_on_booking", {
            p_booking: raceId,
            p_action: "cancel",
            p_reason: "Changed plans",
          }),
        ]);
        const raceBooking = data(
          await renter.rpc("get_booking", { p_booking: raceId }),
        );
        if (raceBooking.status === "paid") {
          assert.equal(raced[1].error?.message, "invalid_transition");
          assert.equal(data(raced[0]), "paid");
        } else {
          assert.equal(raceBooking.status, "cancelled");
          assert.equal(data(raced[0]), "refund_due");
          assert.equal(raced[1].error, null);
        }
        assert.equal(
          data(
            await admin
              .from("payment_receipts")
              .select("id")
              .eq("attempt_id", racing.id),
          ).length,
          1,
        );
        assert.equal(
          data(
            await admin
              .from("checkout_attempts")
              .select("renter_id")
              .eq("id", attempt.id)
              .single(),
          ).renter_id,
          users[1].id,
        );
      },
    );
  },
);
