import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "completed-only two-sided reviews enforce identity, immutable retries and public privacy",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, connection }) => {
        const [owner, renter, , outsider] = clients;
        const guest = connection.publicClient();
        data(
          await admin
            .from("profiles")
            .update({ role: "admin" })
            .eq("id", users[3].id),
        );
        const booking = data(
          await renter.rpc("request_booking", {
            p_listing: fixtures.listings[0].id,
            p_pickup: day(10),
            p_return: day(11),
            p_request_key: randomUUID(),
          }),
        ).booking;
        const submit = (
          client = renter,
          rating = 5,
          comment = "  Reliable owner  ",
        ) =>
          client.rpc("submit_booking_review", {
            p_booking: booking.id,
            p_rating: rating,
            p_comment: comment,
          });
        const eligibility = (client = renter) =>
          client.rpc("get_booking_review", { p_booking: booking.id });
        assert.equal(data(await eligibility()).reason, "booking_incomplete");
        for (const status of [
          "requested",
          "accepted",
          "paid",
          "handed_over",
          "returned",
          "disputed",
          "declined",
          "cancelled",
          "expired",
        ]) {
          sql(
            `update public.bookings set status='${status}' where id='${booking.id}'`,
          );
          assert.equal(
            (await submit()).error?.message,
            "review_not_allowed",
            status,
          );
        }
        sql(
          `update public.bookings set status='completed' where id='${booking.id}'`,
        );
        assert.equal((await submit(outsider)).error?.message, "not_found");
        assert.equal((await eligibility(outsider)).error?.message, "not_found");
        assert.equal((await submit(guest)).error?.code, "42501");
        for (const input of [
          { p_rating: 0 },
          { p_rating: 6 },
          { p_rating: null },
          { p_comment: null },
          { p_comment: "x".repeat(2001) },
        ]) {
          assert(
            (
              await renter.rpc("submit_booking_review", {
                p_booking: booking.id,
                p_rating: 5,
                p_comment: "",
                ...input,
              })
            ).error,
          );
        }
        assert.equal(data(await eligibility()).can_review, true);
        const concurrent = await Promise.all([submit(), submit()]);
        assert.deepEqual(concurrent.map((r) => data(r).replayed).sort(), [
          false,
          true,
        ]);
        const review = data(concurrent[0]).data;
        assert.equal(data(concurrent[1]).data.id, review.id);
        assert.equal(review.author_id, users[1].id);
        assert.equal(review.subject_id, users[0].id);
        assert.equal(review.subject_role, "owner");
        assert.equal(review.comment, "Reliable owner");
        assert.equal((await submit(renter, 4)).error?.message, "review_exists");
        assert.equal(
          (await submit(renter, 5, "Changed")).error?.message,
          "review_exists",
        );
        assert.equal(data(await eligibility()).reason, "already_reviewed");
        assert.equal(data(await eligibility()).review.id, review.id);
        assert.equal(
          sql(
            `select count(*) from public.audit_log where target_table='reviews' and target_id='${review.id}'`,
          ),
          "1",
        );
        for (const client of [guest, owner, renter, outsider]) {
          assert.equal(
            (await client.from("reviews").select("*")).error?.code,
            "42501",
          );
          assert.equal(
            (
              await client.from("reviews").insert({
                booking_id: booking.id,
                author_id: users[3].id,
                subject_id: users[0].id,
                rating: 5,
              })
            ).error?.code,
            "42501",
          );
          assert.equal(
            (
              await client
                .from("reviews")
                .update({ rating: 1 })
                .eq("id", review.id)
            ).error?.code,
            "42501",
          );
          assert.equal(
            (await client.from("reviews").delete().eq("id", review.id)).error
              ?.code,
            "42501",
          );
        }
        const publicRead = () =>
          guest.rpc("list_profile_reviews", { p_subject: users[0].id });
        const published = data(await publicRead());
        assert.equal(
          published.data.length,
          1,
          "Immediate publication does not wait for the other party",
        );
        assert.deepEqual(published.summary, { count: 1, average: 5 });
        assert.deepEqual(
          Object.keys(published.data[0]).sort(),
          [
            "id",
            "author_id",
            "subject_id",
            "author_name",
            "subject_role",
            "rating",
            "comment",
            "created_at",
          ].sort(),
        );
        const ownerReview = data(await submit(owner, 3, "")).data;
        assert.equal(ownerReview.subject_role, "renter");
        assert.equal(ownerReview.subject_id, users[1].id);
        assert.deepEqual(
          data(
            await guest.rpc("list_profile_reviews", {
              p_subject: users[1].id,
              p_role: "renter",
            }),
          ).summary,
          { count: 1, average: 3 },
        );
        assert.equal(
          data(
            await guest.rpc("list_profile_reviews", {
              p_subject: users[0].id,
              p_role: "renter",
            }),
          ).summary.count,
          0,
        );
        const second = data(
          await renter.rpc("request_booking", {
            p_listing: fixtures.listings[0].id,
            p_pickup: day(20),
            p_return: day(21),
            p_request_key: randomUUID(),
          }),
        ).booking;
        sql(
          `update public.bookings set status='completed' where id='${second.id}'`,
        );
        data(
          await admin
            .from("profiles")
            .update({ account_status: "suspended" })
            .eq("id", users[0].id),
        );
        assert.equal((await submit(owner, 3, "")).error?.code, "42501");
        assert.equal(data(await eligibility(owner)).review.id, ownerReview.id);
        data(
          await renter.rpc("submit_booking_review", {
            p_booking: second.id,
            p_rating: 1,
            p_comment: "🎉".repeat(2000),
          }),
        );
        assert.deepEqual(data(await publicRead()).summary, {
          count: 2,
          average: 3,
        });
        sql(
          `update public.reviews set created_at='2026-01-01T00:00:00Z' where booking_id in ('${booking.id}','${second.id}')`,
        );
        const first = data(
          await guest.rpc("list_profile_reviews", {
            p_subject: users[0].id,
            p_page_size: 1,
          }),
        );
        const next = data(
          await guest.rpc("list_profile_reviews", {
            p_subject: users[0].id,
            p_page_size: 1,
            p_page: 2,
          }),
        );
        assert.notEqual(first.data[0].id, next.data[0].id);
        assert.equal(first.pagination.total, 2);
        assert.equal(
          data(
            await guest.rpc("list_profile_reviews", {
              p_subject: randomUUID(),
            }),
          ).summary.average,
          null,
        );
        assert(
          (
            await guest.rpc("list_profile_reviews", {
              p_subject: users[0].id,
              p_page_size: 51,
            })
          ).error,
        );
        assert(
          (
            await guest.rpc("list_profile_reviews", {
              p_subject: users[0].id,
              p_role: "admin",
            })
          ).error,
        );
        // Trusted malformed legacy records must never become public merely because the table exists.
        sql(
          `insert into public.reviews(booking_id,author_id,subject_id,rating) values('${booking.id}','${users[3].id}','${users[0].id}',5)`,
        );
        assert.equal(data(await publicRead()).summary.count, 2);
        sql(
          `update auth.users set email_confirmed_at=null where id='${users[1].id}'`,
        );
        assert.equal((await eligibility()).error?.code, "42501");
        assert.equal((await submit()).error?.code, "42501");
        assert.equal(data(await publicRead()).summary.count, 2);
      },
    );
  },
);
