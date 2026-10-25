import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { data, day, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "real chat/notification HTTP routes require verified cookies, Origin and participant permissions",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(
      async ({ clients, fixtures, users, password, status }) => {
        const origin = "http://localhost:3000";
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
              p_return: day(14),
              p_request_key: randomUUID(),
            }),
          ).booking;
          const openPath = `/api/bookings/${booking.id}/conversation`;
          assert.equal(
            (await call(1, openPath + "?user_id=" + users[0].id, {})).status,
            400,
          );
          assert.equal(
            (await call(undefined, "/api/conversations")).status,
            401,
          );
          assert.equal(
            (await call(undefined, "/api/notifications")).status,
            401,
          );
          assert.equal((await call(3, openPath, {})).status, 404);
          assert.equal(
            (
              await call(
                1,
                openPath,
                {},
                { Origin: "https://elsewhere.example" },
              )
            ).status,
            403,
          );
          assert.equal(
            (await call(1, openPath, {}, { "Content-Type": "text/plain" }))
              .status,
            415,
          );
          assert.equal(
            (await call(1, openPath, { user_id: users[0].id })).status,
            400,
          );
          const opened = await call(1, openPath, {});
          assert.equal(opened.status, 200);
          const c = opened.body.data;
          assert.equal((await call(0, openPath, {})).body.data.id, c.id);
          const messagePath = `/api/conversations/${c.id}/messages`;
          const input = {
            client_key: randomUUID(),
            body: "HTTP pickup fixture",
          };
          const sent = await call(1, messagePath, input);
          assert.equal(sent.status, 201);
          assert.equal(sent.body.data.sender_id, users[1].id);
          assert.equal((await call(1, messagePath, input)).status, 200);
          assert.equal(
            (await call(1, messagePath, { ...input, body: "Changed" })).status,
            409,
          );
          assert.equal(
            (await call(1, messagePath, { ...input, sender_id: users[0].id }))
              .status,
            400,
          );
          assert.equal(
            (
              await call(1, messagePath, {
                client_key: randomUUID(),
                body: " \n\t",
              })
            ).status,
            400,
          );
          assert.equal((await call(3, messagePath, input)).status, 404);
          assert.equal((await call(3, messagePath)).status, 404);
          const rows = await call(0, messagePath);
          assert.equal(rows.status, 200);
          assert.equal(rows.body.data.length, 1);
          assert.equal((await call(0, messagePath + "?limit=51")).status, 400);
          assert.equal(
            (await call(0, messagePath + "?limit=1&limit=2")).status,
            400,
          );
          assert.equal(
            (await call(0, "/api/conversations?user_id=" + users[3].id)).status,
            400,
          );
          assert.equal(
            (await call(3, "/api/conversations")).body.data.length,
            0,
          );
          const readPath = `/api/conversations/${c.id}/read`;
          assert.equal(
            (await call(0, readPath, { through: sent.body.data.id })).body
              .updated,
            1,
          );
          assert.equal(
            (await call(0, readPath, { through: sent.body.data.id })).body
              .updated,
            0,
          );
          assert.equal(
            (await call(3, readPath, { through: sent.body.data.id })).status,
            404,
          );
          const notifications = await call(0, "/api/notifications?unread=true");
          assert.equal(notifications.status, 200);
          const notice = notifications.body.data.find(
            (n) => n.type === "chat.message",
          );
          assert(notice);
          assert(!("event_key" in notice));
          assert(!("body" in notice.payload));
          assert.equal(
            (await call(3, "/api/notifications")).body.unread_count,
            0,
          );
          assert.equal(
            (await call(0, "/api/notifications?unread=1")).status,
            400,
          );
          assert.equal(
            (await call(0, "/api/notifications?unread=true&unread=false"))
              .status,
            400,
          );
          const noticePath = `/api/notifications/${notice.id}/read`;
          assert.equal((await call(1, noticePath, {})).status, 404);
          const read = await call(0, noticePath, {});
          assert(read.body.data.read_at);
          assert.equal(
            (await call(0, noticePath, {})).body.data.read_at,
            read.body.data.read_at,
          );
        } finally {
          for (const s of sessions)
            await s.client.auth.signOut({ scope: "local" });
        }
      },
    );
  },
);
