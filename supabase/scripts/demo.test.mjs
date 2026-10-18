import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { projectRoot, runCli } from "./cli.mjs";
import { DEMO_MARKER, demoFixtures } from "./demo-fixtures.mjs";
import {
  assertDemoAccount,
  demoPassword,
  findDemoAccounts,
  localConnection,
  main,
  resetDemo,
  seedDemo,
} from "./demo.mjs";

function data(result) {
  // Do not let assertions print SDK responses with credentials.
  assert.ok(!result.error, "Local fixture operation failed");
  return result.data;
}

test("refuses hosted, alternate local, and credential-bearing URLs", () => {
  for (const API_URL of [
    "https://example.supabase.co",
    "http://127.0.0.1:54321@evil.test",
    "http://localhost:54321",
    "http://127.0.0.1:54321/",
    "http://127.0.0.1:9999",
  ]) {
    assert.throws(
      () => localConnection({ API_URL }),
      /only accepts.*local API/,
    );
  }
  assert.throws(
    () => localConnection({ API_URL: "http://127.0.0.1:54321" }),
    /keys are unavailable/,
  );
});

test("destructive and unknown CLI arguments fail before contacting Supabase", async () => {
  for (const args of [
    ["--reset"],
    ["--linked"],
    ["--confirm"],
    ["--reset", "--confirm", "--url=hosted"],
  ]) {
    await assert.rejects(main(args), /Use npm run db:demo/);
  }
});

test("demo identities require trusted metadata and exact namespace/email", () => {
  const fixtures = demoFixtures();
  const account = fixtures.accounts[0];
  const user = {
    email: account.email,
    app_metadata: {
      rentify_seed: DEMO_MARKER,
      rentify_seed_namespace: fixtures.namespace,
    },
  };
  assert.doesNotThrow(() => assertDemoAccount(user, account, fixtures));
  for (const invalid of [
    { ...user, app_metadata: {} },
    { ...user, email: "someone@example.test" },
    {
      ...user,
      app_metadata: { ...user.app_metadata, rentify_seed_namespace: "other" },
    },
  ]) {
    assert.throws(
      () => assertDemoAccount(invalid, account, fixtures),
      /unrecognized account/,
    );
  }
  assert.throws(() => demoFixtures("../../other"), /namespace/);
});

test("generates a private, reusable ignored environment file without replacing it", () => {
  const directory = join(
    projectRoot,
    "tmp",
    `demo-password-test-${randomUUID()}`,
  );
  mkdirSync(directory, { recursive: true });
  const path = join(directory, ".env.demo.local");
  try {
    const first = demoPassword(path, {});
    assert.equal(first.length, 48);
    const before = readFileSync(path, "utf8");
    assert.ok(
      first === demoPassword(path, {}),
      "Generated password must be reused",
    );
    assert.ok(
      before === readFileSync(path, "utf8"),
      "Existing file must not change",
    );
    assert.ok(
      demoPassword(path, {
        RENTIFY_DEMO_PASSWORD: "Explicit-test-password-123",
      }) === "Explicit-test-password-123",
      "Explicit process environment takes precedence",
    );
    assert.throws(
      () => demoPassword(path, { RENTIFY_DEMO_PASSWORD: "short" }),
      /12–72/,
    );
    assert.throws(
      () =>
        demoPassword(path, { RENTIFY_DEMO_PASSWORD: "line\nbreak-password" }),
      /12–72/,
    );
  } finally {
    unlinkSync(path);
    rmdirSync(directory);
  }
});

test(
  "real local seed is repeatable, preserves edits, enforces privacy, and resets only its listings",
  { timeout: 120_000 },
  async () => {
    const fixtures = demoFixtures(`check-${randomUUID()}`);
    const connection = localConnection(
      JSON.parse(runCli(["status", "--output", "json"], true)),
    );
    const { admin, publicClient } = connection;
    const password = `Test-${randomUUID()}`;
    let users = [];
    let unrelatedId;
    let bookingId;
    let collisionId;
    const sessions = [];
    const ids = fixtures.listings.map((listing) => listing.id);
    const snapshot = async () => ({
      profiles: data(
        await admin
          .from("profiles")
          .select("*")
          .in(
            "id",
            users.map((user) => user.id),
          )
          .order("id"),
      ),
      privateProfiles: data(
        await admin
          .from("profile_private")
          .select("*")
          .in(
            "user_id",
            users.map((user) => user.id),
          )
          .order("user_id"),
      ),
      listings: data(
        await admin.from("listings").select("*").in("id", ids).order("id"),
      ),
      photos: data(
        await admin
          .from("listing_photos")
          .select("*")
          .in("listing_id", ids)
          .order("id"),
      ),
    });
    try {
      // An email collision must never claim or overwrite an existing real account.
      const collision = data(
        await admin.auth.admin.createUser({
          email: fixtures.accounts[0].email,
          password,
          email_confirm: true,
        }),
      ).user;
      collisionId = collision.id;
      await assert.rejects(
        seedDemo(connection, password, fixtures),
        /unrecognized account/,
      );
      assert.equal(
        data(await admin.from("profiles").select("id").eq("id", collision.id))
          .length,
        0,
      );
      data(await admin.auth.admin.deleteUser(collision.id));
      collisionId = undefined;

      const first = await seedDemo(connection, password, fixtures);
      users = first.users;
      assert.equal(first.created, 5);
      assert.equal(first.preserved, 0);
      for (const user of users)
        assert.ok(user.email_confirmed_at, "Demo accounts must be verified");
      const initial = await snapshot();
      assert.ok(
        initial.profiles.every(
          (profile) =>
            profile.role === "user" && profile.account_status === "active",
        ),
      );
      assert.ok(
        initial.privateProfiles.every(
          (profile) =>
            profile.phone === null && profile.phone_verified_at === null,
        ),
      );
      assert.equal(initial.photos.length, 5);
      for (const photo of initial.photos) {
        const image = data(
          await admin.storage
            .from("listing-images")
            .download(photo.storage_path),
        );
        const metadata = await sharp(
          Buffer.from(await image.arrayBuffer()),
        ).metadata();
        assert.equal(metadata.format, "webp");
        assert.equal(metadata.width, 800);
        assert.equal(metadata.height, 600);
      }

      const anon = publicClient();
      const visible = data(
        await anon.from("listings").select("id").in("id", ids),
      );
      assert.equal(visible.length, 4);
      const privatePhoto = initial.photos.find(
        (photo) => photo.listing_id === fixtures.listings[4].id,
      );
      assert.ok(
        (
          await anon.storage
            .from("listing-images")
            .download(privatePhoto.storage_path)
        ).error,
        "Anonymous draft photo read must fail",
      );
      const publicPhoto = initial.photos.find(
        (photo) => photo.listing_id === fixtures.listings[0].id,
      );
      data(
        await anon.storage
          .from("listing-images")
          .download(publicPhoto.storage_path),
      );
      for (const user of users) {
        const client = publicClient();
        data(
          await client.auth.signInWithPassword({ email: user.email, password }),
        );
        sessions.push(client);
      }
      assert.equal(
        data(await sessions[0].from("listings").select("id").in("id", ids))
          .length,
        5,
      );
      assert.equal(
        data(await sessions[1].from("listings").select("id").in("id", ids))
          .length,
        4,
      );
      assert.equal(
        data(
          await sessions[1]
            .from("profile_private")
            .select("user_id")
            .eq("user_id", users[0].id),
        ).length,
        0,
      );
      const changed = data(
        await sessions[1]
          .from("listings")
          .update({ title: "Unauthorized edit" })
          .eq("id", ids[0])
          .select("id"),
      );
      assert.equal(changed.length, 0, "Renter cannot change owner's listing");

      const second = await seedDemo(connection, password, fixtures);
      assert.equal(second.created, 0);
      assert.equal(second.preserved, 5);
      assert.deepEqual(
        await snapshot(),
        initial,
        "Rerun must preserve rows and timestamps exactly",
      );
      data(
        await admin
          .from("profiles")
          .update({ display_name: "Edited demo owner" })
          .eq("id", users[0].id),
      );
      data(
        await admin
          .from("listings")
          .update({ status: "paused", title: "Edited demo listing" })
          .eq("id", ids[0]),
      );
      const edited = await snapshot();
      await seedDemo(connection, password, fixtures);
      assert.deepEqual(
        await snapshot(),
        edited,
        "Rerun must preserve intentional edits",
      );
      await assert.rejects(
        seedDemo(connection, `Wrong-${randomUUID()}`, fixtures),
        /original RENTIFY_DEMO_PASSWORD/,
      );
      assert.deepEqual(
        await snapshot(),
        edited,
        "Wrong password must not change application data",
      );

      // The reserved UUID is insufficient proof of ownership, including for reset.
      data(
        await admin
          .from("listings")
          .update({ owner_id: users[1].id })
          .eq("id", ids[4]),
      );
      await assert.rejects(
        seedDemo(connection, password, fixtures),
        /another owner/,
      );
      await assert.rejects(resetDemo(connection, fixtures), /another owner/);
      data(
        await admin
          .from("listings")
          .update({ owner_id: users[0].id })
          .eq("id", ids[4]),
      );

      const extra = {
        ...edited.listings[0],
        id: randomUUID(),
        status: "draft",
        title: "Unrelated developer listing",
      };
      delete extra.created_at;
      delete extra.updated_at;
      unrelatedId = data(
        await admin.from("listings").insert(extra).select("id").single(),
      ).id;
      bookingId = data(
        await admin
          .from("bookings")
          .insert({
            listing_id: ids[0],
            owner_id: users[0].id,
            renter_id: users[1].id,
            rental_period: "[2030-01-01,2030-01-02)",
            rental_amount: 100,
            deposit_amount: 0,
          })
          .select("id")
          .single(),
      ).id;
      const beforeRefusedReset = await snapshot();
      await assert.rejects(resetDemo(connection, fixtures), /has bookings/);
      assert.deepEqual(
        await snapshot(),
        beforeRefusedReset,
        "Booking refusal must happen before any listing changes",
      );
      data(await admin.from("bookings").delete().eq("id", bookingId));
      bookingId = undefined;
      await resetDemo(connection, fixtures);
      assert.equal(
        data(await admin.from("listings").select("id").in("id", ids)).length,
        0,
      );
      assert.equal(
        data(await admin.from("listings").select("id").eq("id", unrelatedId))
          .length,
        1,
      );
      for (const photo of initial.photos) {
        assert.ok(
          (
            await admin.storage
              .from("listing-images")
              .download(photo.storage_path)
          ).error,
          "Reset must remove physical image bytes through Storage API",
        );
      }
      const reseeded = await seedDemo(connection, password, fixtures);
      assert.equal(reseeded.created, 5);
      assert.deepEqual(
        reseeded.users.map((user) => user.id),
        users.map((user) => user.id),
        "Reset must retain account identities",
      );
      assert.equal(
        data(
          await admin
            .from("profiles")
            .select("display_name")
            .eq("id", users[0].id)
            .single(),
        ).display_name,
        "Edited demo owner",
      );
    } finally {
      for (const client of sessions)
        await client.auth.signOut({ scope: "local" });
      if (bookingId)
        data(await admin.from("bookings").delete().eq("id", bookingId));
      if (unrelatedId)
        data(await admin.from("listings").delete().eq("id", unrelatedId));
      if (collisionId) data(await admin.auth.admin.deleteUser(collisionId));
      users = await findDemoAccounts(admin, fixtures);
      if (users[0]) {
        // Restore the test-owned listing if an ownership assertion failed midway.
        data(
          await admin
            .from("listings")
            .update({ owner_id: users[0].id })
            .eq("id", ids[4]),
        );
        await resetDemo(connection, fixtures);
        for (const [index, user] of users.entries()) {
          if (!user) continue;
          assertDemoAccount(user, fixtures.accounts[index], fixtures);
          data(await admin.auth.admin.deleteUser(user.id));
        }
      }
    }
  },
);
