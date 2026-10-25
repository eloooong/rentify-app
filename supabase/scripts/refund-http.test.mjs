import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { data, day, withBookingFixtures } from "./booking-fixtures.mjs";

const base = "http://localhost:3000";
test(
  "real paid cancellation/refund HTTP access, strict inputs and atomic obligations",
  { timeout: 120_000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, status, password }) => {
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
          const job = data(
            await admin.rpc("claim_payment_work", {
              p_attempt: prepared.id,
              p_limit: 1,
            }),
          )[0];
          const suffix = randomUUID().replaceAll("-", "");
          // Isolated, server-only synthetic provider receipt. No external payment call.
          data(
            await admin.rpc("sync_checkout", {
              p_attempt: prepared.id,
              p_lease: job.lease_token,
              p_snapshot: {
                session_id: `ps-${suffix.slice(0, 24)}`,
                reference: prepared.id,
                checkout_url: `https://dev.xen.to/${suffix}`,
                status: "active",
                livemode: false,
                payments: [
                  {
                    id: `py-${suffix.slice(0, 8)}-${suffix.slice(8, 12)}-${suffix.slice(12, 16)}-${suffix.slice(16, 20)}-${suffix.slice(20)}`,
                    amount: prepared.total_amount,
                    currency: "PHP",
                    method: "gcash",
                    paid_at: new Date().toISOString(),
                  },
                ],
              },
            }),
          );
          const refundPath = `/api/bookings/${booking.id}/refunds`;
          const cancellationPath = `/api/bookings/${booking.id}/cancellation`;
          async function call(
            path,
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
            const response = await fetch(new URL(path, base), {
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
          assert.equal((await call(refundPath)).status, 401);
          assert.equal(
            (
              await call(cancellationPath, undefined, "POST", {
                reason: "Changed plans",
              })
            ).status,
            401,
          );
          assert.equal((await call(refundPath, 3)).status, 404);
          assert.equal(
            (
              await call(cancellationPath, 3, "POST", {
                reason: "Changed plans",
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await call(
                cancellationPath,
                1,
                "POST",
                { reason: "Changed plans" },
                "https://evil.example",
              )
            ).status,
            403,
          );
          for (const body of [
            { reason: "Changed plans", amount: 1 },
            { reason: "Changed plans", status: "succeeded" },
            { reason: "x" },
          ])
            assert.equal(
              (await call(cancellationPath, 1, "POST", body)).status,
              400,
            );
          assert.equal(
            (await call(refundPath, 1)).body.data.can_cancel_paid,
            true,
          );
          const cancelled = await call(cancellationPath, 0, "POST", {
            reason: "Owner cannot fulfill",
          });
          assert.equal(cancelled.status, 200);
          assert.equal(cancelled.body.data.booking.status, "cancelled");
          assert.equal(cancelled.body.data.refunds.refund_due_amount, 425000);
          assert.equal(cancelled.body.data.refunds.refunded_amount, 0);
          assert.equal(cancelled.body.data.refunds.attempts.length, 1);
          assert.equal(
            (
              await call(cancellationPath, 0, "POST", {
                reason: "Owner cannot fulfill",
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await call(cancellationPath, 1, "POST", {
                reason: "Owner cannot fulfill",
              })
            ).status,
            409,
          );
          const summary = (await call(refundPath, 1)).body.data;
          assert.equal(summary.refund_pending_amount, 425000);
          assert.equal(summary.attempts.length, 1);
          assert.doesNotMatch(
            JSON.stringify(summary),
            /pay_|ref_|session_id|lease_token|last_error_code|receipt_id/,
          );
          assert.equal(
            (
              await call(
                "/api/payments/refunds/reconcile",
                undefined,
                "POST",
                {},
              )
            ).status,
            403,
          );
          assert.equal((await call(refundPath, 3)).status, 404);
        } finally {
          for (const session of sessions)
            await session.client.auth.signOut({ scope: "local" });
        }
      },
    );
  },
);
