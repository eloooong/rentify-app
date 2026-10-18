import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "real Auth RPC commands preserve quotes, serialize retries/acceptance, and enforce booking policies",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(async ({ admin, clients, users, fixtures }) => {
      const [owner, renter, other, outsider] = clients;
      const listing = fixtures.listings[0].id;
      const request = (client, offset, key = randomUUID()) =>
        client.rpc("request_booking", {
          p_listing: listing,
          p_pickup: day(offset),
          p_return: day(offset + 2),
          p_request_key: key,
        });
      const act = (client, id, action, reason) =>
        client.rpc("act_on_booking", {
          p_booking: id,
          p_action: action,
          ...(reason ? { p_reason: reason } : {}),
        });
      const key = randomUUID();
      const concurrent = await Promise.all([
        request(renter, 7, key),
        request(renter, 7, key),
      ]);
      const results = concurrent.map(data);
      assert.equal(results[0].booking.id, results[1].booking.id);
      assert.deepEqual(results.map((row) => row.replayed).sort(), [
        false,
        true,
      ]);
      const first = results[0].booking;
      assert.equal(first.rental_days, 3);
      assert.equal(first.rental_amount, 255000);
      assert.equal(first.deposit_amount, 170000);
      assert.equal(first.total_amount, 425000);
      assert.equal(first.renter_id, users[1].id);
      assert.deepEqual(first.allowed_actions, ["cancel"]);
      data(
        await admin
          .from("listings")
          .update({ daily_price_amount: 99000 })
          .eq("id", listing),
      );
      const replay = data(await request(renter, 7, key));
      assert.equal(replay.booking.rental_amount, first.rental_amount);
      assert.equal(replay.booking.request_expires_at, first.request_expires_at);
      assert.equal(
        (await request(renter, 8, key)).error?.message,
        "idempotency_conflict",
      );
      assert.equal(
        (await request(renter, 7)).error?.message,
        "duplicate_request",
      );
      assert.equal((await request(owner, 7)).error?.message, "self_booking");
      assert.equal(
        (await outsider.rpc("get_booking", { p_booking: first.id })).error
          ?.message,
        "not_found",
      );
      const second = data(await request(other, 7)).booking;
      const acceptances = await Promise.all([
        act(owner, first.id, "accept"),
        act(owner, second.id, "accept"),
      ]);
      assert.equal(acceptances.filter((result) => !result.error).length, 1);
      assert.equal(
        acceptances.find((result) => result.error)?.error.message,
        "booking_conflict",
      );
      const winner = data(acceptances.find((result) => !result.error));
      const loser = winner.id === first.id ? second : first;
      assert.equal(
        data(await owner.rpc("get_booking", { p_booking: loser.id })).status,
        "requested",
      );
      assert.ok(
        Date.parse(winner.payment_expires_at) -
          Date.parse(winner.accepted_at) ===
          30 * 60 * 1000,
      );
      const repeated = data(await act(owner, winner.id, "accept"));
      assert.equal(repeated.payment_expires_at, winner.payment_expires_at);
      const calendar = data(
        await outsider.rpc("booking_availability", {
          p_listing: listing,
          p_from: day(7),
          p_to: day(9),
        }),
      );
      assert.deepEqual(calendar.blocked_ranges, [{ from: day(7), to: day(9) }]);
      for (const range of calendar.blocked_ranges)
        assert.deepEqual(Object.keys(range).sort(), ["from", "to"]);
      for (const value of [
        first.id,
        second.id,
        users[0].id,
        users[1].id,
        users[2].id,
      ])
        assert.ok(!JSON.stringify(calendar).includes(value));
      const closed = data(
        await act(owner, winner.id, "cancel", "Device maintenance"),
      );
      assert.equal(closed.closed_by, users[0].id);
      assert.equal(
        data(await act(owner, winner.id, "cancel", "Device maintenance"))
          .status_reason,
        "Device maintenance",
      );
      assert.equal(
        (await act(owner, winner.id, "cancel", "Changed reason")).error
          ?.message,
        "idempotency_conflict",
      );
      const accepted = data(await act(owner, loser.id, "accept"));
      assert.equal(accepted.status, "accepted");
      const audit = data(
        await admin
          .from("audit_log")
          .select("action")
          .eq("target_id", winner.id),
      );
      assert.equal(
        audit.filter((row) => row.action === "booking.accepted").length,
        1,
      );
      assert.equal(
        audit.filter((row) => row.action === "booking.cancelled").length,
        1,
      );
      assert.equal(
        (await act(renter, first.id, "paid")).error?.message,
        "invalid_action",
      );
      assert.equal(
        (await owner.rpc("expire_booking_holds", {})).error?.code,
        "42501",
      );
      const page = data(
        await owner.rpc("list_my_bookings", { p_page: 9999, p_page_size: 20 }),
      );
      assert.deepEqual(page.data, []);
      assert.equal(page.pagination.total, 2);

      // A stale payment hold is cleaned in the next valid command, not revived.
      data(
        await admin
          .from("bookings")
          .update({
            payment_expires_at: new Date(Date.now() - 5000).toISOString(),
          })
          .eq("id", loser.id),
      );
      assert.equal(
        (await act(owner, loser.id, "accept")).error?.message,
        "booking_expired",
      );
      const nextRenter = loser.renter_id === users[1].id ? renter : other;
      const next = data(await request(nextRenter, 7)).booking;
      assert.equal(
        data(
          await admin
            .from("bookings")
            .select("status")
            .eq("id", loser.id)
            .single(),
        ).status,
        "expired",
      );
      assert.equal(
        data(await act(owner, next.id, "accept")).status,
        "accepted",
      );
      assert.equal(
        data(await act(nextRenter, next.id, "cancel", "Changed plans")).status,
        "cancelled",
      );

      // Trusted fixture writes exercise readiness without exposing paid/return APIs.
      const physical = data(await request(renter, 30)).booking;
      const historyId = randomUUID();
      data(
        await admin.from("bookings").insert({
          id: historyId,
          listing_id: listing,
          owner_id: users[0].id,
          renter_id: users[2].id,
          rental_period: `[${day(-3)},${day(-1)})`,
          rental_amount: 1,
          deposit_amount: 0,
          status: "handed_over",
        }),
      );
      assert.equal(
        (await act(owner, physical.id, "accept")).error?.message,
        "device_unavailable",
      );
      assert.equal(
        data(
          await renter.rpc("booking_availability", {
            p_listing: listing,
            p_from: day(30),
            p_to: day(31),
          }),
        ).device_available,
        false,
      );
      data(
        await admin
          .from("bookings")
          .update({ status: "disputed" })
          .eq("id", historyId),
      );
      assert.equal(
        (await act(owner, physical.id, "accept")).error?.message,
        "device_unavailable",
      );
      data(
        await admin
          .from("bookings")
          .update({ status: "completed" })
          .eq("id", historyId),
      );
      assert.equal(
        data(await act(owner, physical.id, "accept")).status,
        "accepted",
      );
      data(
        await admin
          .from("profiles")
          .update({ account_status: "suspended" })
          .eq("id", users[1].id),
      );
      assert.equal(
        data(await renter.rpc("get_booking", { p_booking: physical.id })).id,
        physical.id,
      );
      assert.equal(
        (await act(renter, physical.id, "cancel", "Changed plans")).error
          ?.message,
        "profile_required",
      );
    });
  },
);

test(
  "the scheduled database job expires a due request without an HTTP trigger",
  { timeout: 100_000 },
  async () => {
    await withBookingFixtures(async ({ admin, clients, fixtures }) => {
      const result = data(
        await clients[1].rpc("request_booking", {
          p_listing: fixtures.listings[0].id,
          p_pickup: day(60),
          p_return: day(60),
          p_request_key: randomUUID(),
        }),
      );
      const id = result.booking.id;
      data(
        await admin
          .from("bookings")
          .update({
            request_expires_at: new Date(Date.now() - 5000).toISOString(),
          })
          .eq("id", id),
      );
      assert.equal(
        sql(
          "select count(*) from cron.job where jobname='rentify-booking-expiry' and active and schedule='* * * * *';",
        ),
        "1",
      );
      const until = Date.now() + 75_000;
      let expired = false;
      while (Date.now() < until) {
        const row = data(
          await admin.from("bookings").select("status").eq("id", id).single(),
        );
        if (row.status === "expired") {
          expired = true;
          break;
        }
        await delay(1000);
      }
      assert.ok(
        expired,
        "pg_cron must expire the due fixture within its minute schedule.",
      );
      const events = data(
        await admin
          .from("audit_log")
          .select("action")
          .eq("target_id", id)
          .eq("action", "booking.expired"),
      );
      assert.equal(events.length, 1);
    });
  },
);
