import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { data, day, withBookingFixtures } from "./booking-fixtures.mjs";

const base = new URL(
  process.env.RENTIFY_TEST_BASE_URL ?? "http://localhost:3000",
);
assert.ok(
  base.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(base.hostname) &&
    !base.username &&
    !base.password &&
    base.pathname === "/" &&
    !base.search &&
    !base.hash,
  "HTTP journey accepts a local app origin only.",
);

test(
  "real booking HTTP routes validate input, enforce sessions/origin, and publish private/public contracts",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(async ({ fixtures, users, status, password }) => {
      const sessions = [];
      try {
        for (const user of users) {
          const jar = new Map();
          const client = createServerClient(status.API_URL, status.ANON_KEY, {
            cookies: {
              getAll: () =>
                Array.from(jar, ([name, value]) => ({ name, value })),
              setAll: (cookies) =>
                cookies.forEach(({ name, value }) => jar.set(name, value)),
            },
          });
          data(
            await client.auth.signInWithPassword({
              email: user.email,
              password,
            }),
          );
          sessions.push({ client, jar });
        }
        async function call(
          path,
          session,
          method = "GET",
          body,
          origin = base.origin,
        ) {
          const headers = {};
          if (session)
            headers.Cookie = Array.from(
              session.jar,
              ([name, value]) => `${name}=${value}`,
            ).join("; ");
          if (method !== "GET") {
            headers.Origin = origin;
            headers["Content-Type"] = "application/json";
          }
          const response = await fetch(new URL(path, base), {
            method,
            headers,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            redirect: "manual",
          });
          const value = await response.json();
          assert.match(
            response.headers.get("cache-control") ?? "",
            /private, no-store/,
          );
          return { response, value };
        }
        const [owner, renter, , outsider] = sessions;
        const path = "/api/bookings";
        const input = {
          listing_id: fixtures.listings[0].id,
          pickup_date: day(7),
          return_date: day(9),
          request_key: randomUUID(),
        };
        assert.equal((await call(path)).response.status, 401);
        assert.equal(
          (await call(path, null, "POST", input)).response.status,
          401,
        );
        assert.equal(
          (await call(path, renter, "POST", input, "https://attacker.invalid"))
            .response.status,
          403,
        );
        for (const extra of [
          { rental_amount: 1 },
          { owner_id: users[3].id },
          { status: "paid" },
        ]) {
          const invalid = await call(path, renter, "POST", {
            ...input,
            ...extra,
          });
          assert.equal(invalid.response.status, 400);
          assert.equal(invalid.value.error.code, "validation");
        }
        const created = await call(path, renter, "POST", input);
        assert.equal(created.response.status, 201);
        assert.equal(created.value.replayed, false);
        const booking = created.value.data;
        assert.equal(booking.rental_days, 3);
        assert.equal(booking.rental_amount, 255000);
        assert.equal(booking.total_amount, 425000);
        assert.equal(booking.renter_id, users[1].id);
        const again = await call(path, renter, "POST", input);
        assert.equal(again.response.status, 200);
        assert.equal(again.value.data.id, booking.id);
        assert.equal(again.value.replayed, true);
        assert.equal(
          (await call(`${path}/${booking.id}`, owner)).response.status,
          200,
        );
        assert.equal(
          (await call(`${path}/${booking.id}`, outsider)).response.status,
          404,
        );
        assert.equal(
          (
            await call(`${path}/${booking.id}/actions`, renter, "POST", {
              action: "accept",
            })
          ).response.status,
          403,
        );
        assert.equal(
          (
            await call(`${path}/${booking.id}/actions`, owner, "POST", {
              action: "paid",
            })
          ).response.status,
          400,
        );
        assert.equal(
          (
            await call(`${path}/${booking.id}/actions`, owner, "POST", {
              action: "cancel",
              reason: "x".repeat(40000),
            })
          ).response.status,
          413,
        );
        const action = await call(
          `${path}/${booking.id}/actions`,
          owner,
          "POST",
          { action: "accept" },
        );
        assert.equal(action.response.status, 200);
        assert.equal(action.value.data.status, "accepted");
        const available = await call(
          `${path}/availability?listingId=${input.listing_id}&from=${day(7)}&to=${day(9)}`,
        );
        assert.equal(available.response.status, 200);
        assert.deepEqual(available.value.data.blocked_ranges, [
          { from: day(7), to: day(9) },
        ]);
        for (const value of [booking.id, ...users.map((user) => user.id)])
          assert.ok(!JSON.stringify(available.value).includes(value));
        const ownerPage = await call(
          `${path}?role=owner&status=accepted`,
          owner,
        );
        assert.equal(ownerPage.value.pagination.total, 1);
        const emptyPage = await call(`${path}?page=9999`, renter);
        assert.equal(emptyPage.response.status, 200);
        assert.deepEqual(emptyPage.value.data, []);
        assert.equal(emptyPage.value.pagination.total, 1);
        const cancelled = await call(
          `${path}/${booking.id}/actions`,
          renter,
          "POST",
          { action: "cancel", reason: "Changed plans" },
        );
        assert.equal(cancelled.response.status, 200);
        assert.equal(cancelled.value.data.status, "cancelled");
        assert.equal(cancelled.value.data.closed_by, users[1].id);
        assert.equal(
          (
            await call(`${path}/${booking.id}/actions`, owner, "POST", {
              action: "accept",
            })
          ).response.status,
          409,
        );
      } finally {
        for (const session of sessions)
          await session.client.auth.signOut({ scope: "local" });
      }
    });
  },
);
