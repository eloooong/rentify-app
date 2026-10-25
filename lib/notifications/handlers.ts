import { NextRequest, NextResponse } from "next/server";
import { api, jsonBody } from "@/lib/catalog/http";
import { communicationError, decoded, identity, query } from "@/lib/chat/http";
import { emptyBody, id } from "@/lib/chat/validation";
import {
  notificationPage,
  notificationQuery,
  notificationSchema,
} from "./validation";

export function notifications(request: NextRequest) {
  return api(request, async (client) => {
    await identity(client);
    const input = notificationQuery.parse(query(request));
    const result = await client.rpc("list_my_notifications", {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_unread: input.unread,
    });
    communicationError(result.error);
    return NextResponse.json(decoded(notificationPage, result.data));
  });
}
export function readNotification(request: NextRequest, notification: string) {
  return api(request, async (client) => {
    await identity(client);
    id.parse(notification);
    emptyBody.parse(query(request));
    emptyBody.parse(await jsonBody(request));
    const result = await client.rpc("mark_notification_read", {
      p_notification: notification,
    });
    communicationError(result.error);
    return NextResponse.json({
      data: decoded(notificationSchema, result.data),
    });
  });
}
