import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { data, day, sql, withBookingFixtures } from "./booking-fixtures.mjs";

test(
  "booking chat enforces participant access, idempotency, read receipts and recipient-only notifications",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(
      async ({ admin, clients, fixtures, users, connection }) => {
        const [owner, renter, , outsider] = clients;
        data(
          await admin
            .from("profiles")
            .update({ role: "admin" })
            .eq("id", users[3].id),
        );
        const booking = data(
          await renter.rpc("request_booking", {
            p_listing: fixtures.listings[0].id,
            p_pickup: day(12),
            p_return: day(14),
            p_request_key: randomUUID(),
          }),
        ).booking;
        const open = () =>
          renter.rpc("open_booking_chat", { p_booking: booking.id });
        const opened = await Promise.all([
          open(),
          open(),
          owner.rpc("open_booking_chat", { p_booking: booking.id }),
        ]);
        const conversation = data(opened[0]);
        assert(
          opened.every((r) => data(r).id === conversation.id),
          "Concurrent opens share one conversation",
        );
        assert.equal(
          (await outsider.rpc("open_booking_chat", { p_booking: booking.id }))
            .error?.message,
          "not_found",
        );
        assert.equal(
          (
            await connection
              .publicClient()
              .rpc("open_booking_chat", { p_booking: booking.id })
          ).error?.code,
          "42501",
        );
        assert.equal(
          data(
            await outsider
              .from("conversations")
              .select("*")
              .eq("id", conversation.id),
          ).length,
          0,
        );
        const send = (client, key, body = "Can we confirm pickup?") =>
          client.rpc("send_chat_message", {
            p_conversation: conversation.id,
            p_key: key,
            p_body: body,
          });
        const key = randomUUID();
        const sent = await Promise.all([send(renter, key), send(renter, key)]);
        assert.deepEqual(sent.map((r) => data(r).replayed).sort(), [
          false,
          true,
        ]);
        const message = data(sent[0]).data;
        assert.equal(data(sent[1]).data.id, message.id);
        assert.equal(
          (
            await send(
              owner,
              key,
              "The same key may be used by a different sender",
            )
          ).error,
          null,
        );
        assert.equal(
          (await send(renter, key, "Changed body")).error?.message,
          "idempotency_conflict",
        );
        assert.equal(
          (await send(outsider, randomUUID())).error?.message,
          "not_found",
        );
        assert.equal(
          (await send(renter, randomUUID(), " \t\n ")).error?.code,
          "22023",
        );
        assert.equal(
          (await send(renter, randomUUID(), "x".repeat(2001))).error?.code,
          "22023",
        );
        assert.equal(
          data(
            await outsider
              .from("messages")
              .select("*")
              .eq("conversation_id", conversation.id),
          ).length,
          0,
        );
        assert.equal(
          (
            await outsider.rpc("list_chat_messages", {
              p_conversation: conversation.id,
            })
          ).error?.message,
          "not_found",
        );
        for (const client of [owner, renter]) {
          assert.equal(
            (
              await client.from("messages").insert({
                conversation_id: conversation.id,
                sender_id: users[3].id,
                body: "forged",
              })
            ).error?.code,
            "42501",
          );
          assert.equal(
            (
              await client
                .from("messages")
                .update({ body: "rewrite" })
                .eq("id", message.id)
            ).error?.code,
            "42501",
          );
          assert.equal(
            (await client.from("messages").delete().eq("id", message.id)).error
              ?.code,
            "42501",
          );
          assert.equal(
            (
              await client
                .from("notifications")
                .insert({ user_id: users[3].id, type: "forged" })
            ).error?.code,
            "42501",
          );
        }
        const alerts = () =>
          owner.rpc("list_my_notifications", { p_unread: true });
        const ownerAlerts = data(await alerts());
        const messageAlerts = ownerAlerts.data.filter(
          (n) => n.type === "chat.message",
        );
        assert.equal(
          messageAlerts.length,
          1,
          "Retry sends exactly one notification",
        );
        assert.deepEqual(Object.keys(messageAlerts[0].payload).sort(), [
          "booking_id",
          "conversation_id",
          "message_id",
        ]);
        assert(!("event_key" in messageAlerts[0]));
        assert.equal(
          data(
            await outsider
              .from("notifications")
              .select("*")
              .eq("id", messageAlerts[0].id),
          ).length,
          0,
        );
        assert.equal(
          (
            await renter.rpc("mark_notification_read", {
              p_notification: messageAlerts[0].id,
            })
          ).error?.message,
          "not_found",
        );
        const mark = () =>
          owner.rpc("mark_notification_read", {
            p_notification: messageAlerts[0].id,
          });
        const read = data(await mark());
        assert(read.read_at);
        assert.equal(data(await mark()).read_at, read.read_at);
        assert.equal(
          data(await alerts()).unread_count,
          ownerAlerts.unread_count - 1,
        );
        assert.equal(
          data(
            await renter.rpc("mark_chat_read", {
              p_conversation: conversation.id,
              p_through: message.id,
            }),
          ).updated,
          0,
          "Sender cannot mark own message read",
        );
        assert.equal(
          data(
            await owner.rpc("mark_chat_read", {
              p_conversation: conversation.id,
              p_through: message.id,
            }),
          ).updated,
          1,
        );
        assert.equal(
          data(
            await owner.rpc("mark_chat_read", {
              p_conversation: conversation.id,
              p_through: message.id,
            }),
          ).updated,
          0,
        );
        assert(
          data(
            await owner.rpc("list_chat_messages", {
              p_conversation: conversation.id,
            }),
          ).data.find((m) => m.id === message.id).read_at,
        );
        assert.equal(
          (
            await outsider.rpc("mark_chat_read", {
              p_conversation: conversation.id,
              p_through: message.id,
            })
          ).error?.message,
          "not_found",
        );
        // Timestamp ties are deliberately seeded through trusted SQL, never public writes.
        sql(
          `update public.messages set created_at='2026-01-01T00:00:00Z' where conversation_id='${conversation.id}'`,
        );
        const first = data(
          await owner.rpc("list_chat_messages", {
            p_conversation: conversation.id,
            p_limit: 1,
          }),
        );
        assert(first.next_before);
        const second = data(
          await owner.rpc("list_chat_messages", {
            p_conversation: conversation.id,
            p_before: first.next_before,
            p_limit: 1,
          }),
        );
        assert.notEqual(first.data[0].id, second.data[0].id);
        assert.equal(second.next_before, null);
        const another = data(
          await clients[2].rpc("request_booking", {
            p_listing: fixtures.listings[1].id,
            p_pickup: day(20),
            p_return: day(21),
            p_request_key: randomUUID(),
          }),
        ).booking;
        const otherChat = data(
          await clients[2].rpc("open_booking_chat", { p_booking: another.id }),
        );
        const foreign = data(
          await clients[2].rpc("send_chat_message", {
            p_conversation: otherChat.id,
            p_key: randomUUID(),
            p_body: "Other conversation",
          }),
        ).data;
        assert.equal(
          (
            await owner.rpc("list_chat_messages", {
              p_conversation: conversation.id,
              p_before: foreign.id,
            })
          ).error?.message,
          "not_found",
        );
        assert.equal(
          (
            await owner.rpc("mark_chat_read", {
              p_conversation: conversation.id,
              p_through: foreign.id,
            })
          ).error?.message,
          "not_found",
        );
        assert.equal(
          (await renter.rpc("list_my_conversations", { p_page_size: 51 })).error
            ?.code,
          "22023",
        );
        data(
          await renter.rpc("act_on_booking", {
            p_booking: booking.id,
            p_action: "cancel",
            p_reason: "Chat persists after cancellation",
          }),
        );
        assert.equal(
          data(
            await send(
              owner,
              randomUUID(),
              "We can discuss this closed booking",
            ),
          ).replayed,
          false,
        );
        data(
          await admin
            .from("profiles")
            .update({ account_status: "suspended" })
            .eq("id", users[1].id),
        );
        assert.equal((await send(owner, randomUUID())).error?.code, "42501");
        assert.equal((await send(renter, randomUUID())).error?.code, "42501");
        assert(
          data(
            await renter.rpc("list_chat_messages", {
              p_conversation: conversation.id,
            }),
          ).data.length > 0,
        );
        assert.equal(
          data(await renter.rpc("list_my_conversations", {})).data[0].can_send,
          false,
        );
        data(
          await admin
            .from("profiles")
            .update({ account_status: "active" })
            .eq("id", users[1].id),
        );
        // Per-thread serialization also fences concurrent messages against the rolling limit.
        const burst = await Promise.all(
          Array.from({ length: 25 }, () =>
            send(renter, randomUUID(), "Rate limit fixture"),
          ),
        );
        assert.equal(burst.filter((r) => !r.error).length, 20);
        assert(
          burst
            .filter((r) => r.error)
            .every((r) => r.error.message === "rate_limited"),
        );
        const unverified = data(
          await admin.auth.admin.getUserById(users[1].id),
        ).user;
        assert(unverified.email_confirmed_at);
        sql(
          `update auth.users set email_confirmed_at=null where id='${users[1].id}'`,
        );
        assert.equal(
          data(
            await renter
              .from("messages")
              .select("*")
              .eq("conversation_id", conversation.id),
          ).length,
          0,
        );
        assert.equal(
          (
            await renter.rpc("list_chat_messages", {
              p_conversation: conversation.id,
            })
          ).error?.code,
          "42501",
        );
        sql(
          `update auth.users set email_confirmed_at=clock_timestamp() where id='${users[1].id}'`,
        );
      },
    );
  },
);

test(
  "Realtime delivers chat/notification changes only to current participants and recipients",
  { timeout: 120000 },
  async () => {
    await withBookingFixtures(async ({ admin, clients, fixtures, users }) => {
      const [owner, renter, , outsider] = clients;
      data(
        await admin
          .from("profiles")
          .update({ role: "admin" })
          .eq("id", users[3].id),
      );
      const booking = data(
        await renter.rpc("request_booking", {
          p_listing: fixtures.listings[0].id,
          p_pickup: day(12),
          p_return: day(14),
          p_request_key: randomUUID(),
        }),
      ).booking;
      const c = data(
        await renter.rpc("open_booking_chat", { p_booking: booking.id }),
      );
      const observed = {
        ownerMessages: [],
        outsiderMessages: [],
        ownerNotifications: [],
        outsiderNotifications: [],
        readUpdates: [],
      };
      const channels = [];
      async function subscribe(client, key, table, event, filter) {
        const channel = client
          .channel("test-" + randomUUID())
          .on(
            "postgres_changes",
            { schema: "public", table, event, ...(filter ? { filter } : {}) },
            (event) => observed[key].push(event.new),
          );
        channels.push([client, channel]);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Local Realtime subscribe timeout: ${table}/${event}`,
                ),
              ),
            30000,
          );
          channel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              clearTimeout(timer);
              resolve();
            } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
              clearTimeout(timer);
              reject(
                new Error(
                  `Local Realtime subscription failed: ${table}/${event}`,
                ),
              );
            }
          });
        });
      }
      async function until(predicate) {
        const end = Date.now() + 15000;
        while (Date.now() < end) {
          if (predicate()) return;
          await new Promise((r) => setTimeout(r, 100));
        }
        assert.fail("Expected authorized Realtime delivery was not observed");
      }
      try {
        await Promise.all([
          subscribe(
            owner,
            "ownerMessages",
            "messages",
            "INSERT",
            `conversation_id=eq.${c.id}`,
          ),
          subscribe(outsider, "outsiderMessages", "messages", "INSERT"),
          subscribe(owner, "ownerNotifications", "notifications", "INSERT"),
          subscribe(
            outsider,
            "outsiderNotifications",
            "notifications",
            "INSERT",
          ),
          subscribe(
            renter,
            "readUpdates",
            "messages",
            "UPDATE",
            `conversation_id=eq.${c.id}`,
          ),
        ]);
        const message = data(
          await renter.rpc("send_chat_message", {
            p_conversation: c.id,
            p_key: randomUUID(),
            p_body: "Realtime private fixture",
          }),
        ).data;
        await until(
          () =>
            observed.ownerMessages.some((m) => m.id === message.id) &&
            observed.ownerNotifications.some(
              (n) => n.payload.message_id === message.id,
            ),
        );
        data(
          await owner.rpc("mark_chat_read", {
            p_conversation: c.id,
            p_through: message.id,
          }),
        );
        await until(() =>
          observed.readUpdates.some((m) => m.id === message.id && m.read_at),
        );
        await new Promise((r) => setTimeout(r, 1200));
        assert.equal(observed.outsiderMessages.length, 0);
        assert.equal(observed.outsiderNotifications.length, 0);
      } finally {
        await Promise.all(
          channels.map(([client, channel]) => client.removeChannel(channel)),
        );
        for (const client of new Set(channels.map(([client]) => client)))
          await client.realtime.disconnect();
      }
    });
  },
);
