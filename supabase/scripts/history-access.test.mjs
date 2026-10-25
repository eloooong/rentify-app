import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "participant history preserves captures, refund attempts, privacy, Manila dates and stable pages",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, connection }) => {
        const [owner, renter, , outsider] = clients;
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
        const attempt = data(
          await renter.rpc("prepare_checkout", {
            p_booking: booking.id,
            p_policy: "demo-payments-v1",
          }),
        );
        const job = data(
          await admin.rpc("claim_payment_work", {
            p_attempt: attempt.id,
            p_limit: 1,
          }),
        )[0];
        const captures = [425000, 430000, 425000].map((amount) => ({
          id: `py-${randomUUID()}`,
          amount,
          currency: "PHP",
          method: "gcash",
          paid_at: new Date().toISOString(),
        }));
        // Isolated trusted synthetic captures/refunds for read-model verification only.
        data(
          await admin.rpc("sync_checkout", {
            p_attempt: attempt.id,
            p_lease: job.lease_token,
            p_snapshot: {
              session_id: `ps-${randomUUID().replaceAll("-", "").slice(0, 24)}`,
              reference: attempt.id,
              checkout_url: "https://dev.xen.to/fixture",
              status: "active",
              livemode: false,
              payments: [captures[0]],
            },
          }),
        );
        sql(`insert into public.payment_receipts(attempt_id,payment_id,amount,currency,method,paid_at,disposition,reason) values
      ('${attempt.id}','${captures[1].id}',430000,'PHP','gcash',clock_timestamp(),'review','provider_mismatch'),
      ('${attempt.id}','${captures[2].id}',425000,'PHP','gcash',clock_timestamp(),'refund_due','reservation_closed');`);
        const receipt = JSON.parse(
          sql(
            `select row_to_json(r) from public.payment_receipts r where attempt_id='${attempt.id}' and disposition='refund_due'`,
          ),
        );
        const refund = JSON.parse(
          sql(
            `select row_to_json(f) from public.refund_attempts f where receipt_id='${receipt.id}'`,
          ),
        );
        const second = randomUUID(),
          third = randomUUID();
        const date = day(-2),
          next = day(-1);
        sql(`update public.refund_attempts set state='failed',next_check_at=null where id='${refund.id}';
      insert into public.refund_attempts(id,receipt_id,amount,generation,state,next_check_at,created_at) values
        ('${second}','${receipt.id}',10000,2,'succeeded',null,'${date}T00:00:00+08:00'),
        ('${third}','${receipt.id}',415000,3,'pending',null,'${date}T23:59:59.999+08:00');
      update public.payment_receipts set paid_at='${date}T00:00:00+08:00' where payment_id='${captures[0].id}';
      update public.payment_receipts set paid_at='${date}T23:59:59.999+08:00' where payment_id='${captures[1].id}';
      update public.payment_receipts set paid_at='${next}T00:00:00+08:00' where payment_id='${captures[2].id}';`);
        const history = async (client, options = {}) =>
          data(await client.rpc("list_payment_history", options));
        const all = await history(renter);
        assert.equal(all.pagination.total, 6);
        assert.equal(all.data.length, 6);
        assert.equal(all.timezone, "Asia/Manila");
        assert.ok(
          all.data.every(
            (row) =>
              row.role === "renter" &&
              row.booking_id === booking.id &&
              row.test_mode,
          ),
        );
        const payments = all.data.filter((row) => row.type === "payment");
        assert.equal(
          payments.length,
          3,
          "One capture is one row, not two allocations",
        );
        assert.equal(
          payments.filter((row) => row.state === "review").length,
          1,
        );
        assert.equal(
          payments.find((row) => row.state === "review").rental_amount,
          null,
        );
        assert.equal(
          payments.find((row) => row.state === "captured").deposit_amount,
          170000,
        );
        const refunds = all.data.filter((row) => row.type === "refund");
        assert.deepEqual(refunds.map((row) => row.state).sort(), [
          "failed",
          "pending",
          "succeeded",
        ]);
        assert.equal(
          refunds
            .filter((row) => row.state === "succeeded")
            .reduce((n, row) => n + row.amount, 0),
          10000,
        );
        assert.ok(
          refunds.every(
            (row) => row.rental_amount === null && row.deposit_amount === null,
          ),
        );
        for (const key of [
          "payment_id",
          "session_id",
          "checkout_url",
          "provider_refund_id",
          "last_error_code",
          "email",
          "phone",
          "renter_id",
          "owner_id",
        ])
          assert.ok(
            all.data.every((row) => !(key in row)),
            `Private field ${key} absent`,
          );
        assert.equal((await history(owner)).pagination.total, 6);
        assert.ok(
          (await history(owner)).data.every((row) => row.role === "owner"),
        );
        assert.equal((await history(outsider)).pagination.total, 0);
        assert.equal(
          (await history(renter, { p_role: "owner" })).pagination.total,
          0,
        );
        assert.equal(
          (await history(owner, { p_role: "renter" })).pagination.total,
          0,
        );
        assert.equal(
          (await history(renter, { p_type: "refund" })).pagination.total,
          3,
        );
        assert.equal(
          (
            await history(renter, {
              p_type: "payment",
              p_from: date,
              p_to: date,
            })
          ).pagination.total,
          2,
          "Manila end date is inclusive, next midnight excluded",
        );
        assert.equal(
          (
            await history(renter, {
              p_type: "refund",
              p_from: date,
              p_to: date,
            })
          ).pagination.total,
          2,
        );
        const page1 = await history(renter, { p_page: 1, p_page_size: 2 });
        const page2 = await history(renter, { p_page: 2, p_page_size: 2 });
        assert.deepEqual(
          page1.data,
          (await history(renter, { p_page: 1, p_page_size: 2 })).data,
        );
        assert.equal(
          new Set([...page1.data, ...page2.data].map((row) => row.id)).size,
          4,
        );
        assert.equal(page2.pagination.total, 6);
        assert.deepEqual((await history(renter, { p_page: 10000 })).data, []);
        for (const options of [
          { p_type: "payout" },
          { p_role: "admin" },
          { p_role: null },
          { p_page: 0 },
          { p_page_size: 51 },
          { p_from: next, p_to: date },
          { p_from: "infinity" },
        ])
          assert.equal(
            (await renter.rpc("list_payment_history", options)).error?.message,
            "invalid_query",
          );
        assert.equal(
          (await connection.publicClient().rpc("list_payment_history")).error
            ?.code,
          "42501",
        );
        for (const table of ["payment_receipts", "refund_attempts", "payments"])
          assert.equal(
            (await renter.from(table).select("*")).error?.code,
            "42501",
          );
        // Managed pg_net grants SQL login roles access; never expose net through PostgREST.
        for (const client of [renter, connection.publicClient()])
          assert.equal(
            (
              await client
                .schema("net")
                .from("http_request_queue")
                .select("headers")
            ).error?.code,
            "PGRST106",
          );
        sql(
          `update public.profiles set account_status='suspended' where id='${users[1].id}'`,
        );
        assert.equal(
          (await history(renter)).pagination.total,
          6,
          "Suspension does not erase private financial history",
        );
        sql(
          `update public.checkout_attempts set provider='paymongo',session_id='cs_legacyHistory',checkout_url='https://checkout.paymongo.com/legacy' where id='${attempt.id}'`,
        );
        assert.ok(
          (await history(renter)).data.every(
            (row) => row.provider === "paymongo",
          ),
          "Historical provider retained without a capability link",
        );
      },
    );
  },
);
