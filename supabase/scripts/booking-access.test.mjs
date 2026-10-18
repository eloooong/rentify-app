import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { runCli } from "./cli.mjs";
import { demoFixtures } from "./demo-fixtures.mjs";
import {
  assertDemoAccount,
  findDemoAccounts,
  localConnection,
  resetDemo,
  seedDemo,
} from "./demo.mjs";

function data(result) {
  assert.ok(!result.error, "Local booking fixture operation failed.");
  return result.data;
}

test(
  "real Auth sessions enforce participant-only booking reads and denied client writes",
  { timeout: 120_000 },
  async () => {
    const fixtures = demoFixtures(`check-${randomUUID()}`);
    fixtures.accounts.push({
      kind: "outsider",
      email: `rentify-${fixtures.namespace}-outsider@example.test`,
      display_name: "Booking outsider fixture",
    });
    const connection = localConnection(
      JSON.parse(runCli(["status", "--output", "json"], true)),
    );
    const { admin, publicClient } = connection;
    const password = `Fixture-${randomUUID()}`;
    const bookingId = randomUUID();
    const attemptedIds = [bookingId];
    const clients = [];
    try {
      const { users } = await seedDemo(connection, password, fixtures);
      const row = {
        id: bookingId,
        listing_id: fixtures.listings[0].id,
        owner_id: users[0].id,
        renter_id: users[1].id,
        rental_period: "[2030-11-20,2030-11-23)",
        rental_amount: 255000,
        deposit_amount: 170000,
      };
      data(await admin.from("bookings").insert(row));
      for (const user of users) {
        const client = publicClient();
        const session = data(
          await client.auth.signInWithPassword({ email: user.email, password }),
        );
        assert.ok(
          session.user.email_confirmed_at,
          "Fixture participant has a real verified session.",
        );
        clients.push(client);
      }
      for (const client of clients.slice(0, 2)) {
        const result = await client
          .from("bookings")
          .select("*")
          .eq("id", bookingId)
          .single();
        const booking = data(result);
        assert.equal(result.status, 200);
        assert.equal(booking.rental_days, 3);
        assert.equal(booking.rental_amount, 255000);
        assert.equal(booking.status, "requested");
      }
      assert.deepEqual(
        data(await clients[2].from("bookings").select("*").eq("id", bookingId)),
        [],
      );
      const anonymous = await publicClient()
        .from("bookings")
        .select("*")
        .eq("id", bookingId);
      assert.ok([401, 403].includes(anonymous.status));
      assert.equal(anonymous.error?.code, "42501");
      for (const client of clients) {
        const attemptedId = randomUUID();
        attemptedIds.push(attemptedId);
        const writes = [
          await client
            .from("bookings")
            .insert({ ...row, id: attemptedId, rental_amount: 1 }),
          await client
            .from("bookings")
            .update({ status: "paid", rental_amount: 1 })
            .eq("id", bookingId),
          await client.from("bookings").delete().eq("id", bookingId),
        ];
        for (const result of writes) {
          assert.equal(result.status, 403);
          assert.equal(result.error?.code, "42501");
        }
      }
      const unchanged = data(
        await admin.from("bookings").select("*").eq("id", bookingId).single(),
      );
      assert.equal(unchanged.status, "requested");
      assert.equal(unchanged.rental_amount, 255000);
    } finally {
      for (const client of clients)
        await client.auth.signOut({ scope: "local" });
      data(await admin.from("bookings").delete().in("id", attemptedIds));
      const users = await findDemoAccounts(admin, fixtures);
      if (users[0]) await resetDemo(connection, fixtures);
      for (const [index, user] of users.entries()) {
        if (!user) continue;
        assertDemoAccount(user, fixtures.accounts[index], fixtures);
        data(await admin.auth.admin.deleteUser(user.id));
      }
    }
  },
);
