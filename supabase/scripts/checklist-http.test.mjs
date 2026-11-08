import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "private evidence and both physical-transfer confirmations on the production app",
  { timeout: 120000 },
  async () => {
    const origin = "http://localhost:3000";
    await withBookingFixtures(
      async ({ clients, fixtures, users, status, password, admin }) => {
        const sessions = [];
        const booking = data(
          await clients[1].rpc("request_booking", {
            p_listing: fixtures.listings[0].id,
            p_pickup: day(10),
            p_return: day(10),
            p_request_key: randomUUID(),
          }),
        ).booking;
        const blocker = data(
          await clients[2].rpc("request_booking", {
            p_listing: fixtures.listings[0].id,
            p_pickup: day(20),
            p_return: day(20),
            p_request_key: randomUUID(),
          }),
        ).booking;
        const base = `/api/checklists/${booking.id}`;
        const photoPath = `${booking.id}/handover/owner.webp`;
        const bucket = "checklist-evidence";
        const image = await sharp({
          create: { width: 24, height: 24, channels: 3, background: "#123456" },
        })
          .webp()
          .toBuffer();
        const confirmed = {
          checks: {
            device_checked: true,
            condition_recorded: true,
            physical_transfer: true,
          },
          note: "Small mark on the case.",
        };
        try {
          for (const index of [0, 1, 3]) {
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
                email: users[index].email,
                password,
              }),
            );
            sessions.push({ client, jar });
          }
          data(
            await admin
              .from("profiles")
              .update({ role: "admin" })
              .eq("id", users[3].id),
          );
          async function call(person, path, input, headers = {}) {
            const upload = Buffer.isBuffer(input);
            const response = await fetch(origin + base + path, {
              method: input === undefined ? "GET" : "POST",
              headers: {
                ...(person == null
                  ? {}
                  : {
                      Cookie: [...sessions[person].jar]
                        .map(([n, v]) => `${n}=${v}`)
                        .join("; "),
                    }),
                ...(input === undefined
                  ? {}
                  : {
                      Origin: origin,
                      "Content-Type": upload
                        ? "image/webp"
                        : "application/json",
                    }),
                ...headers,
              },
              body:
                input === undefined || upload ? input : JSON.stringify(input),
              redirect: "manual",
            });
            assert.match(
              response.headers.get("cache-control"),
              /private.*no-store/,
            );
            return {
              status: response.status,
              value: response.headers.get("content-type")?.startsWith("image/")
                ? Buffer.from(await response.arrayBuffer())
                : await response.json(),
            };
          }

          assert.equal((await call(null, "/handover")).status, 401);
          assert.equal((await call(2, "/handover")).status, 404);
          assert.equal((await call(2, "/handover", confirmed)).status, 404);
          assert.equal(
            (await call(0, "/handover", confirmed)).value.error.code,
            "stage_closed",
          );
          sql(
            `update public.bookings set status='paid' where id='${booking.id}'`,
          );
          assert.equal(
            (await call(0, "/handover", confirmed)).status,
            409,
            "Cannot hand over before the Manila pickup day",
          );
          sql(`update public.bookings set rental_period='[${day(0)},${day(1)})' where id='${booking.id}';
           update public.bookings set status='disputed' where id='${blocker.id}'`);
          assert.equal(
            (await call(0, "/handover", confirmed)).status,
            409,
            "Another dispute blocks physical transfer",
          );
          sql(
            `update public.bookings set status='cancelled' where id='${blocker.id}'`,
          );
          assert.equal((await call(0, "/return", confirmed)).status, 409);
          assert.equal(
            (await call(0, "/handover", { checks: { device_checked: true } }))
              .status,
            400,
          );
          assert.equal(
            (
              await call(0, "/handover", {
                ...confirmed,
                owner_id: users[3].id,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await call(0, "/handover", confirmed, {
                Origin: "https://elsewhere.example",
              })
            ).status,
            403,
          );
          assert.equal(
            (await call(1, "/handover/photos/owner", image)).status,
            403,
          );
          assert.equal(
            (await call(2, "/handover/photos/owner", image)).status,
            404,
          );
          assert.equal(
            (
              await call(
                0,
                "/handover/photos/owner",
                Buffer.from("not an image"),
              )
            ).status,
            400,
          );
          assert.equal(
            (await call(0, "/handover/photos/owner", image)).status,
            201,
          );
          assert.equal(
            (await call(0, "/handover/photos/owner", image)).status,
            409,
          );
          assert.equal(
            (await call(null, "/handover/photos/owner")).status,
            401,
          );
          assert.equal((await call(2, "/handover/photos/owner")).status, 404);
          const download = await call(1, "/handover/photos/owner");
          assert.equal(download.status, 200);
          assert.equal((await sharp(download.value).metadata()).format, "webp");
          assert(
            (
              await clients[1].storage
                .from(bucket)
                .createSignedUrl(photoPath, 60)
            ).error,
          );
          assert(
            (
              await clients[3].storage
                .from(bucket)
                .upload(`${booking.id}/handover/renter.webp`, image, {
                  contentType: "image/webp",
                })
            ).error,
          );
          assert(
            (
              await clients[0]
                .from("condition_reports")
                .insert({ booking_id: booking.id, stage: "handover" })
            ).error,
          );

          const first = await call(0, "/handover", confirmed);
          assert.equal(first.status, 200);
          assert.equal(first.value.data.booking_status, "paid");
          assert(first.value.data.owner_confirmed_at);
          assert.equal(first.value.data.renter_confirmed_at, null);
          const changed = await call(0, "/handover", {
            ...confirmed,
            note: "Changed",
          });
          assert.equal(changed.value.error.code, "already_confirmed");
          const finished = await Promise.all([
            call(1, "/handover", confirmed),
            call(1, "/handover", confirmed),
          ]);
          for (const result of finished) {
            assert.equal(result.status, 200);
            assert.equal(result.value.data.booking_status, "handed_over");
            assert(result.value.data.renter_confirmed_at);
          }
          assert.equal(
            finished[0].value.data.renter_confirmed_at,
            finished[1].value.data.renter_confirmed_at,
          );
          assert.equal(
            sql(
              `select count(*) from public.audit_log where target_id='${booking.id}' and action='booking.handed_over'`,
            ),
            "1",
          );
          assert(
            (
              await clients[1].storage
                .from(bucket)
                .upload(`${booking.id}/handover/renter.webp`, image, {
                  contentType: "image/webp",
                })
            ).error,
          );
          const returned = await Promise.all([
            call(0, "/return", confirmed),
            call(1, "/return", confirmed),
          ]);
          assert(returned.every((r) => r.status === 200));
          assert(
            returned.some((r) => r.value.data.booking_status === "returned"),
          );
          assert.equal(
            (await call(0, "/return")).value.data.booking_status,
            "returned",
          );
          assert.equal(
            sql(
              `select count(*) from public.audit_log where target_id='${booking.id}' and action='booking.returned'`,
            ),
            "1",
          );
          assert.equal(
            sql(
              `select count(*) from public.payments where booking_id='${booking.id}'`,
            ),
            "0",
          );
        } finally {
          for (const session of sessions)
            await session.client.auth.signOut({ scope: "local" });
          data(
            await admin.storage
              .from(bucket)
              .remove([photoPath, `${booking.id}/handover/renter.webp`]),
          );
          sql(`delete from public.audit_log where target_table='condition_reports'
             and target_id in (select id from public.condition_reports where booking_id='${booking.id}');
           delete from public.condition_reports where booking_id='${booking.id}';`);
        }
      },
    );
  },
);
