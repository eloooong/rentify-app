import { NextRequest, NextResponse } from "next/server";
import { api, jsonBody } from "@/lib/catalog/http";
import { communicationError, decoded, identity, query } from "./http";
import {
  conversationPage,
  conversationSchema,
  emptyBody,
  id,
  messagePage,
  messagesQuery,
  pageQuery,
  readBody,
  readResult,
  sendBody,
  sentMessage,
} from "./validation";

export function openChat(request: NextRequest, booking: string) {
  return api(request, async (client) => {
    await identity(client);
    id.parse(booking);
    emptyBody.parse(query(request));
    emptyBody.parse(await jsonBody(request));
    const result = await client.rpc("open_booking_chat", {
      p_booking: booking,
    });
    communicationError(result.error);
    return NextResponse.json({
      data: decoded(conversationSchema, result.data),
    });
  });
}
export function conversations(request: NextRequest) {
  return api(request, async (client) => {
    await identity(client);
    const input = pageQuery.parse(query(request));
    const result = await client.rpc("list_my_conversations", {
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    communicationError(result.error);
    return NextResponse.json(decoded(conversationPage, result.data));
  });
}
export function messages(request: NextRequest, conversation: string) {
  return api(request, async (client) => {
    await identity(client);
    id.parse(conversation);
    const input = messagesQuery.parse(query(request));
    const result = await client.rpc("list_chat_messages", {
      p_conversation: conversation,
      p_limit: input.limit,
      ...(input.before ? { p_before: input.before } : {}),
    });
    communicationError(result.error);
    return NextResponse.json(decoded(messagePage, result.data));
  });
}
export function sendMessage(request: NextRequest, conversation: string) {
  return api(request, async (client) => {
    await identity(client);
    id.parse(conversation);
    emptyBody.parse(query(request));
    const input = sendBody.parse(await jsonBody(request));
    const result = await client.rpc("send_chat_message", {
      p_conversation: conversation,
      p_key: input.client_key,
      p_body: input.body,
    });
    communicationError(result.error);
    const value = decoded(sentMessage, result.data);
    return NextResponse.json(value, { status: value.replayed ? 200 : 201 });
  });
}
export function markRead(request: NextRequest, conversation: string) {
  return api(request, async (client) => {
    await identity(client);
    id.parse(conversation);
    emptyBody.parse(query(request));
    const input = readBody.parse(await jsonBody(request));
    const result = await client.rpc("mark_chat_read", {
      p_conversation: conversation,
      p_through: input.through,
    });
    communicationError(result.error);
    return NextResponse.json(decoded(readResult, result.data));
  });
}
