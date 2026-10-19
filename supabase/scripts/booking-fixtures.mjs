import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { runCli } from "./cli.mjs";
import { demoFixtures } from "./demo-fixtures.mjs";
import {
  assertDemoAccount,
  findDemoAccounts,
  localConnection,
  resetDemo,
  seedDemo,
} from "./demo.mjs";

export function data(result) {
  assert.ok(!result.error, "Local booking fixture operation failed.");
  return result.data;
}
export function sql(source) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_rentify-app",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: source, encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, "Isolated local fixture SQL failed.");
  return result.stdout.trim();
}
export function day(offset) {
  const local = new Date(Date.now() + 8 * 60 * 60 * 1000);
  local.setUTCDate(local.getUTCDate() + offset);
  return local.toISOString().slice(0, 10);
}
export async function withBookingFixtures(run) {
  const status = JSON.parse(runCli(["status", "--output", "json"], true));
  const connection = localConnection(status);
  const { admin, publicClient } = connection;
  const fixtures = demoFixtures(`check-${randomUUID()}`);
  for (const kind of ["renter-two", "outsider"])
    fixtures.accounts.push({
      kind,
      email: `rentify-${fixtures.namespace}-${kind}@example.test`,
      display_name: `Booking ${kind} fixture`,
    });
  const password = `Fixture-${randomUUID()}`;
  const clients = [];
  try {
    const { users } = await seedDemo(connection, password, fixtures);
    for (const user of users) {
      const client = publicClient();
      data(
        await client.auth.signInWithPassword({ email: user.email, password }),
      );
      clients.push(client);
    }
    await run({
      admin,
      clients,
      users,
      fixtures,
      connection,
      status,
      password,
    });
  } finally {
    for (const client of clients) await client.auth.signOut({ scope: "local" });
    const users = await findDemoAccounts(admin, fixtures);
    if (users[0]) {
      assertDemoAccount(users[0], fixtures.accounts[0], fixtures);
      const ids = fixtures.listings
        .map((listing) => `'${listing.id}'`)
        .join(",");
      const owner = users[0].id;
      assert.match(owner, /^[0-9a-f-]{36}$/);
      // Lock only this namespace's parents. Remove audit/booking fixtures atomically
      // before using the Storage API cleanup; real immutable audit history is untouched.
      sql(`begin; set local lock_timeout='10s';
        select id from public.listings where id in (${ids}) and owner_id='${owner}' order by id for update;
        delete from public.audit_log where target_table='refund_attempts' and target_id in
          (select f.id from public.refund_attempts f join public.payment_receipts r on r.id=f.receipt_id join public.checkout_attempts a on a.id=r.attempt_id join public.bookings b on b.id=a.booking_id where b.owner_id='${owner}' and b.listing_id in (${ids}));
        delete from public.refund_attempts where receipt_id in
          (select r.id from public.payment_receipts r join public.checkout_attempts a on a.id=r.attempt_id join public.bookings b on b.id=a.booking_id where b.owner_id='${owner}' and b.listing_id in (${ids}));
        delete from public.audit_log where
          (target_table='checkout_attempts' and target_id in (select a.id from public.checkout_attempts a join public.bookings b on b.id=a.booking_id where b.owner_id='${owner}' and b.listing_id in (${ids}))) or
          (target_table='payment_receipts' and target_id in (select r.id from public.payment_receipts r join public.checkout_attempts a on a.id=r.attempt_id join public.bookings b on b.id=a.booking_id where b.owner_id='${owner}' and b.listing_id in (${ids})));
        delete from public.audit_log where target_table='bookings' and target_id in
          (select id from public.bookings where owner_id='${owner}' and listing_id in (${ids}));
        delete from public.payments where booking_id in (select id from public.bookings where owner_id='${owner}' and listing_id in (${ids}));
        delete from public.payment_events where attempt_id in (select a.id from public.checkout_attempts a join public.bookings b on b.id=a.booking_id where b.owner_id='${owner}' and b.listing_id in (${ids}));
        delete from public.payment_receipts where attempt_id in (select a.id from public.checkout_attempts a join public.bookings b on b.id=a.booking_id where b.owner_id='${owner}' and b.listing_id in (${ids}));
        delete from public.checkout_attempts where booking_id in (select id from public.bookings where owner_id='${owner}' and listing_id in (${ids}));
        delete from public.bookings where owner_id='${owner}' and listing_id in (${ids}); commit;`);
      await resetDemo(connection, fixtures);
    }
    for (const [index, user] of users.entries()) {
      if (!user) continue;
      assertDemoAccount(user, fixtures.accounts[index], fixtures);
      data(await admin.auth.admin.deleteUser(user.id));
    }
  }
}
