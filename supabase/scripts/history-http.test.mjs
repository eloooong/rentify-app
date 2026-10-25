import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { data, day, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "history HTTP uses verified cookies, rejects ambiguous filters and keeps participant data private",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, password, status }) => {
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
              p_pickup: day(12),
              p_return: day(14),
              p_request_key: randomUUID(),
            }),
          ).booking;
          data(
            await clients[0].rpc("act_on_booking", {
              p_booking: booking.id,
              p_action: "accept",
            }),
          );
          const attempt = data(
            await clients[1].rpc("prepare_checkout", {
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
          // Trusted isolated fixture; no external payment API or public simulator.
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
                payments: [
                  {
                    id: `py-${randomUUID()}`,
                    amount: attempt.total_amount,
                    currency: "PHP",
                    method: "gcash",
                    paid_at: new Date().toISOString(),
                  },
                ],
              },
            }),
          );
          async function call(person, query = "") {
            const headers = {};
            if (person !== undefined)
              headers.Cookie = Array.from(
                sessions[person].jar,
                ([n, v]) => `${n}=${v}`,
              ).join("; ");
            const response = await fetch(
              `http://localhost:3000/api/payments/history${query}`,
              { headers, redirect: "manual" },
            );
            assert.match(
              response.headers.get("cache-control"),
              /private.*no-store/,
            );
            assert.equal(
              response.headers.get("x-content-type-options"),
              "nosniff",
            );
            return { status: response.status, body: await response.json() };
          }
          assert.equal((await call()).status, 401);
          const renter = await call(1);
          assert.equal(renter.status, 200);
          assert.equal(renter.body.pagination.total, 1);
          assert.equal(renter.body.data[0].amount, 425000);
          assert.equal(renter.body.data[0].role, "renter");
          const owner = await call(0);
          assert.equal(owner.body.data[0].role, "owner");
          assert.equal((await call(3)).body.pagination.total, 0);
          assert.equal(
            (await call(1, "?type=refund")).body.pagination.total,
            0,
          );
          assert.equal((await call(1, "?role=owner")).body.pagination.total, 0);
          for (const query of [
            "?user_id=" + users[0].id,
            "?type=payout",
            "?role=admin",
            "?pageSize=51",
            "?page=1&page=2",
            "?from=2026-10-26&to=2026-10-25",
            "?from=2026-02-29",
          ])
            assert.equal((await call(1, query)).status, 400);
        } finally {
          for (const session of sessions)
            await session.client.auth.signOut({ scope: "local" });
        }
      },
    );
  },
);
