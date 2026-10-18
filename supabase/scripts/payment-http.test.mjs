import assert from "node:assert/strict";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { data, day, withBookingFixtures } from "./booking-fixtures.mjs";
import { randomUUID } from "node:crypto";

const base = "http://localhost:3000";
test(
  "real payment HTTP routes keep status private and deny forged browser/worker/webhook requests",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(
      async ({ clients, fixtures, users, status, password }) => {
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
          const booking = data(
            await clients[1].rpc("request_booking", {
              p_listing: fixtures.listings[0].id,
              p_pickup: day(8),
              p_return: day(10),
              p_request_key: randomUUID(),
            }),
          ).booking;
          data(
            await clients[0].rpc("act_on_booking", {
              p_booking: booking.id,
              p_action: "accept",
            }),
          );
          const prepared = data(
            await clients[1].rpc("prepare_checkout", {
              p_booking: booking.id,
              p_policy: "demo-payments-v1",
            }),
          );
          const path = `/api/bookings/${booking.id}/checkout`;
          async function call(
            url,
            person,
            method = "GET",
            body,
            origin = base,
          ) {
            const headers = {
              "Content-Type": "application/json",
              Origin: origin,
            };
            if (person !== undefined)
              headers.Cookie = Array.from(
                sessions[person].jar,
                ([name, value]) => `${name}=${value}`,
              ).join("; ");
            const response = await fetch(new URL(url, base), {
              method,
              headers,
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              redirect: "manual",
            });
            assert.match(
              response.headers.get("cache-control") ?? "",
              /private.*no-store/,
            );
            return { status: response.status, body: await response.json() };
          }
          assert.equal((await call(path)).status, 401);
          assert.equal((await call(path, 3)).status, 404);
          const visible = await call(path, 1);
          assert.equal(visible.status, 200);
          assert.equal(visible.body.data.id, prepared.id);
          assert.equal(visible.body.data.total_amount, 425000);
          assert.equal(visible.body.data.checkout_url, null);
          assert.equal("session_id" in visible.body.data, false);
          assert.equal(
            (
              await call(
                path,
                1,
                "POST",
                { policy_version: "demo-payments-v1" },
                "https://evil.example",
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await call(path, 1, "POST", {
                policy_version: "demo-payments-v1",
                amount: 1,
              })
            ).status,
            400,
          );
          assert.equal(
            (await call("/api/payments/reconcile", undefined, "POST", {}))
              .status,
            403,
          );
          const webhook = await call(
            "/api/payments/webhook",
            undefined,
            "POST",
            { paid: true },
          );
          assert.ok([400, 503].includes(webhook.status));
          assert.equal(
            data(await clients[1].rpc("get_booking", { p_booking: booking.id }))
              .status,
            "accepted",
            "HTTP spoofing never marks booking paid",
          );
        } finally {
          for (const session of sessions)
            await session.client.auth.signOut({ scope: "local" });
        }
      },
    );
  },
);
