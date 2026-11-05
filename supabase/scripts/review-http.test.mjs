import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "review HTTP routes enforce cookies, completed eligibility and narrow public responses",
  { timeout: 120000 },
  async () => {
    const origin = process.env.RENTIFY_TEST_BASE_URL || "http://localhost:3000";
    const parsed = new URL(origin);
    assert(
      ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
        parsed.protocol === "http:",
      "HTTP fixtures require a local app",
    );
    await withBookingFixtures(
      async ({ clients, fixtures, users, password, status }) => {
        const sessions = [];
        try {
          for (const user of users) {
            const jar = new Map();
            const client = createServerClient(status.API_URL, status.ANON_KEY, {
              cookies: {
                getAll: () =>
                  Array.from(jar, ([name, value]) => ({ name, value })),
                setAll: (values) =>
                  values.forEach(({ name, value }) => jar.set(name, value)),
              },
            });
            data(
              await client.auth.signInWithPassword({
                email: user.email,
                password,
              }),
            );
            sessions.push({ jar, client });
          }
          async function call(person, path, body, headers = {}) {
            const response = await fetch(origin + path, {
              method: body === undefined ? "GET" : "POST",
              headers: {
                ...(person === undefined
                  ? {}
                  : {
                      Cookie: Array.from(
                        sessions[person].jar,
                        ([n, v]) => `${n}=${v}`,
                      ).join("; "),
                    }),
                ...(body === undefined
                  ? {}
                  : { Origin: origin, "Content-Type": "application/json" }),
                ...headers,
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              redirect: "manual",
            });
            assert.match(
              response.headers.get("cache-control"),
              /private.*no-store/,
            );
            return { status: response.status, body: await response.json() };
          }
          const booking = data(
            await clients[1].rpc("request_booking", {
              p_listing: fixtures.listings[0].id,
              p_pickup: day(12),
              p_return: day(13),
              p_request_key: randomUUID(),
            }),
          ).booking;
          const privatePath = `/api/bookings/${booking.id}/review`;
          const publicPath = `/api/profiles/${users[0].id}/reviews`;
          assert.equal((await call(undefined, privatePath)).status, 401);
          assert.equal((await call(3, privatePath)).status, 404);
          assert.equal(
            (await call(1, privatePath)).body.reason,
            "booking_incomplete",
          );
          assert.equal((await call(1, privatePath, { rating: 5 })).status, 409);
          assert.equal(
            (await call(undefined, publicPath)).body.summary.count,
            0,
          );
          // Only trusted local fixture SQL supplies completion; no app transition is added.
          sql(
            `update public.bookings set status='completed' where id='${booking.id}'`,
          );
          assert.equal((await call(1, privatePath)).body.can_review, true);
          assert.equal(
            (
              await call(
                1,
                privatePath,
                { rating: 5 },
                { Origin: "https://elsewhere.example" },
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(
                1,
                privatePath,
                { rating: 5 },
                { "Content-Type": "text/plain" },
              )
            ).status,
            415,
          );
          for (const body of [
            { rating: "5" },
            { rating: 6 },
            { rating: 3.5 },
            { rating: 5, author_id: users[0].id },
            { rating: 5, subject_id: users[3].id },
            { rating: 5, comment: "\0" },
            { rating: 5, comment: "x".repeat(2001) },
          ])
            assert.equal((await call(1, privatePath, body)).status, 400);
          assert.equal(
            (
              await call(1, privatePath, {
                rating: 5,
                comment: "x".repeat(40000),
              })
            ).status,
            413,
          );
          const input = { rating: 5, comment: "  Public review fixture  " };
          const sent = await call(1, privatePath, input);
          assert.equal(sent.status, 201);
          assert.equal(sent.body.data.comment, "Public review fixture");
          assert.equal(sent.body.data.subject_id, users[0].id);
          const replay = await call(1, privatePath, {
            rating: 5,
            comment: "Public review fixture",
          });
          assert.equal(replay.status, 200);
          assert.equal(replay.body.replayed, true);
          assert.equal(replay.body.data.id, sent.body.data.id);
          assert.equal(
            (await call(1, privatePath, { ...input, rating: 4 })).status,
            409,
          );
          assert.equal((await call(3, privatePath, { rating: 5 })).status, 404);
          assert.equal(
            (await call(1, privatePath + "?author_id=other")).status,
            400,
          );
          const published = await call(
            undefined,
            publicPath + "?role=owner&pageSize=1",
          );
          assert.equal(published.status, 200);
          assert.deepEqual(published.body.summary, { count: 1, average: 5 });
          assert.equal(published.body.data[0].id, sent.body.data.id);
          for (const field of [
            "booking_id",
            "rental_period",
            "email",
            "phone",
            "account_status",
            "payment_id",
          ])
            assert(!(field in published.body.data[0]));
          for (const query of [
            "role=admin",
            "pageSize=51",
            "page=1&page=2",
            "booking_id=" + booking.id,
          ])
            assert.equal(
              (await call(undefined, publicPath + "?" + query)).status,
              400,
            );
          assert.equal((await call(0, privatePath, { rating: 4 })).status, 201);
          assert.equal(
            (await call(1, privatePath)).body.reason,
            "already_reviewed",
          );
          assert.equal(
            (await call(undefined, `/api/profiles/${randomUUID()}/reviews`))
              .body.summary.average,
            null,
          );
        } finally {
          for (const session of sessions)
            await session.client.auth.signOut({ scope: "local" });
        }
      },
    );
  },
);
