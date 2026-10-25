import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/route", () => ({ createRouteClient: vi.fn() }));
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/catalog/http";
import { communicationError } from "./http";
import { sendBody, messagesQuery, pageQuery } from "./validation";
import {
  notificationQuery,
  notificationSchema,
} from "@/lib/notifications/validation";

it("accepts plain text and counts Unicode characters without splitting emoji", () => {
  const client_key = randomUUID();
  expect(
    sendBody.parse({ client_key, body: "  <script>literal text</script>  " })
      .body,
  ).toBe("<script>literal text</script>");
  expect(
    sendBody.safeParse({ client_key, body: "🙂".repeat(2000) }).success,
  ).toBe(true);
  expect(
    sendBody.safeParse({ client_key, body: "🙂".repeat(2001) }).success,
  ).toBe(false);
});
it.each(["", "  ", "\n\t", "\u2003", "x".repeat(2001)])(
  "rejects empty/oversize messages: %j",
  (body) => {
    expect(sendBody.safeParse({ client_key: randomUUID(), body }).success).toBe(
      false,
    );
  },
);
it("rejects identity/timestamp injection and unbounded or malformed list inputs", () => {
  for (const extra of [
    { sender_id: randomUUID() },
    { read_at: new Date().toISOString() },
    { conversation_id: randomUUID() },
  ])
    expect(
      sendBody.safeParse({ client_key: randomUUID(), body: "Hello", ...extra })
        .success,
    ).toBe(false);
  for (const value of [
    { limit: 51 },
    { before: "bad" },
    { user_id: randomUUID() },
  ])
    expect(messagesQuery.safeParse(value).success).toBe(false);
  for (const value of [{ page: 0 }, { pageSize: 51 }, { page: 1.5 }])
    expect(pageQuery.safeParse(value).success).toBe(false);
  expect(notificationQuery.parse({ unread: "false" }).unread).toBe(false);
  expect(notificationQuery.parse({ unread: "true" }).unread).toBe(true);
  expect(notificationQuery.safeParse({ unread: "1" }).success).toBe(false);
  expect(notificationQuery.safeParse({ user_id: randomUUID() }).success).toBe(
    false,
  );
});
it("maps known communication failures without exposing arbitrary database details", () => {
  for (const [code, message, status] of [
    ["P0001", "not_found", 404],
    ["P0001", "rate_limited", 429],
    ["P0001", "idempotency_conflict", 409],
    ["42501", "private table details", 403],
    ["22023", "private input", 400],
    ["XX000", "secret fixture", 503],
  ] as const) {
    try {
      communicationError({ code, message });
      throw new Error("Expected error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
      expect((error as Error).message).not.toContain("private");
      expect((error as Error).message).not.toContain("secret fixture");
    }
  }
});
it("rejects routing payloads that contain uncontracted private message content", () => {
  const value = {
    id: randomUUID(),
    user_id: randomUUID(),
    type: "chat.message",
    payload: {
      booking_id: randomUUID(),
      conversation_id: randomUUID(),
      message_id: randomUUID(),
    },
    read_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  expect(notificationSchema.safeParse(value).success).toBe(true);
  expect(
    notificationSchema.safeParse({
      ...value,
      payload: { ...value.payload, body: "Private pickup details" },
    }).success,
  ).toBe(false);
});
