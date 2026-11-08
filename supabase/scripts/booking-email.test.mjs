import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  captureBookingEmail,
  captureOrigin,
  captureRecipient,
  runBookingEmailBatch,
} from "../../lib/notifications/email-worker.mjs";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "booking event capture, reminder dates, deduplication and retry fencing",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(async ({ admin, clients, fixtures, users }) => {
      const [owner, renter] = clients;
      const request = async (listing, offset) =>
        data(
          await renter.rpc("request_booking", {
            p_listing: fixtures.listings[listing].id,
            p_pickup: day(offset),
            p_return: day(offset + 1),
            p_request_key: randomUUID(),
          }),
        ).booking;
      const booking = await request(0, 12);
      const rows = (id) =>
        JSON.parse(
          sql(`select coalesce(json_agg(o order by template,recipient_id),'[]')
      from public.booking_email_outbox o where booking_id='${id}'`),
        );
      const listInbox = async (id) => {
        const response = await fetch(
          captureOrigin + "/api/v1/message/" + encodeURIComponent(id),
        );
        assert.equal(response.status, 200);
        return response.json();
      };
      assert.equal(rows(booking.id).length, 1);
      assert.equal(rows(booking.id)[0].recipient_id, users[0].id);
      assert.equal(
        (await owner.rpc("claim_booking_email")).error?.code,
        "42501",
      );
      assert.equal(
        (await renter.from("booking_email_outbox").select("id")).error?.code,
        "42501",
      );

      const concurrent = await Promise.all([
        runBookingEmailBatch(admin),
        runBookingEmailBatch(admin),
      ]);
      assert(concurrent.some((result) => result.captured > 0));
      const [requestJob] = rows(booking.id);
      assert.equal(requestJob.state, "captured");
      assert.equal(requestJob.attempts, 1);
      const message = await listInbox(requestJob.capture_id);
      assert.equal(message.Subject, "New rental request on Rentify");
      assert.equal(message.To[0].Address, captureRecipient);
      assert.match(
        message.Text,
        new RegExp("http://localhost:3000/bookings/" + booking.id),
      );
      assert(!message.Text.includes(users[0].email));

      data(
        await owner.rpc("act_on_booking", {
          p_booking: booking.id,
          p_action: "accept",
        }),
      );
      assert.equal(
        rows(booking.id).find((row) => row.template === "booking_accepted_v1")
          .recipient_id,
        users[1].id,
      );
      const rejected = await captureBookingEmail(
        {},
        async () => new Response("", { status: 429 }),
      );
      assert.equal(rejected.state, "retry");
      const acceptedJob = () =>
        rows(booking.id).find((row) => row.template === "booking_accepted_v1");
      for (let attempt = 1; attempt <= 3; attempt++) {
        await runBookingEmailBatch(admin, async () => rejected);
        const job = acceptedJob();
        assert.equal(job.attempts, attempt);
        assert.equal(job.state, attempt === 3 ? "failed" : "queued");
        if (attempt < 3) {
          assert(
            Date.parse(job.due_at) >
              Date.now() + (attempt === 1 ? 45000 : 270000),
          );
          sql(
            `update public.booking_email_outbox set due_at=now()-interval '1 second' where id='${job.id}'`,
          );
        }
      }
      assert.equal(
        (
          await captureBookingEmail({}, async () => {
            throw new Error("lost response");
          })
        ).state,
        "needs_review",
      );

      const stale = await request(1, 16);
      data(
        await renter.rpc("act_on_booking", {
          p_booking: stale.id,
          p_action: "cancel",
          p_reason: "Fictional cancellation",
        }),
      );
      await runBookingEmailBatch(admin);
      const staleRows = rows(stale.id);
      assert.equal(
        staleRows.find((row) => row.template === "booking_requested_v1").state,
        "skipped",
      );
      assert.equal(
        staleRows.filter(
          (row) =>
            row.template === "booking_cancelled_v1" && row.state === "captured",
        ).length,
        2,
      );

      const pickup = await request(2, 21);
      const returned = await request(3, 23);
      // Synthetic dates/statuses isolate notification tests from payment and handover.
      sql(`update public.bookings set status='paid', rental_period='[${day(1)},${day(3)})', request_key=null where id='${pickup.id}';
         update public.bookings set status='handed_over', rental_period='[${day(-1)},${day(2)})', request_key=null where id='${returned.id}';`);
      const hour = Number(
        sql(
          "select extract(hour from clock_timestamp() at time zone 'Asia/Manila')",
        ),
      );
      await Promise.all([
        runBookingEmailBatch(admin),
        runBookingEmailBatch(admin),
      ]);
      const pickupRows = rows(pickup.id);
      assert.equal(
        pickupRows.filter(
          (row) =>
            row.template === "booking_paid_v1" && row.state === "captured",
        ).length,
        2,
      );
      const reminderRows = [
        ...pickupRows.filter(
          (row) => row.template === "booking_pickup_reminder_v1",
        ),
        ...rows(returned.id).filter(
          (row) => row.template === "booking_return_reminder_v1",
        ),
      ];
      assert.equal(reminderRows.length, hour >= 9 ? 4 : 0);
      for (const job of reminderRows) {
        assert.equal(job.state, "captured");
        assert.equal(job.attempts, 1);
        const received = await listInbox(job.capture_id);
        assert.match(received.Subject, /tomorrow/);
      }

      const ambiguous = await request(0, 28);
      const claims = data(await admin.rpc("claim_booking_email"));
      assert.equal(claims[0].booking_id, ambiguous.id);
      const lease = claims[0];
      assert.equal(
        data(
          await admin.rpc("finish_booking_email", {
            p_id: lease.id,
            p_token: randomUUID(),
            p_result: "needs_review",
          }),
        ),
        false,
      );
      sql(
        `update public.booking_email_outbox set lease_until=now()-interval '1 second' where id='${lease.id}'`,
      );
      await runBookingEmailBatch(admin);
      assert.equal(rows(ambiguous.id)[0].state, "needs_review");
      assert.equal(rows(ambiguous.id)[0].attempts, 1);
    });
  },
);
