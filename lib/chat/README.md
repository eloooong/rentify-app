# Booking chat contract

Person B owns the backend; Person A owns `/messages` and chat components. Implementation is ready for review on `codex/chat-realtime`; integrate after review and merge.

One conversation belongs to one booking. Only its verified renter and owner can read it, including after cancellation, expiry, completion or account suspension. Both accounts must be active and verified to send a new message. Closed bookings retain chat so participants can discuss refunds or unresolved issues. Listing visibility does not remove access. Admin status alone grants no chat access. There is no pre-booking chat, attachments, presence, public broadcasting, message editing or deletion in this slice.

All endpoints require verified session cookies, return private/no-store JSON and use the existing `{error:{code,message}}` error shape. Mutations require the canonical Origin and application/json. Unknown/repeated query parameters and unknown body fields return 400. Nonparticipants receive 404 on a specific thread, rather than learning whether it exists; anonymous/unverified callers receive 401. A suspended participant can read and mark incoming messages read but cannot send.

| Endpoint                                     | Request                                                      | Response                                                                              |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `POST /api/bookings/:bookingId/conversation` | `{}`                                                         | `{data:Conversation}`; idempotently opens the booking's thread                        |
| `GET /api/conversations`                     | `page=1..10000`, `pageSize=1..50`                            | `{data:Conversation[],pagination:{page,pageSize,total}}`                              |
| `GET /api/conversations/:id/messages`        | optional `before=<message UUID>`, `limit=1..50` (default 30) | `{data:Message[],next_before:string                                                   | null}`; newest first, exclusive cursor, same-conversation cursor only |
| `POST /api/conversations/:id/messages`       | `{client_key:UUID,body:string}`                              | `{data:Message,replayed:boolean}`; 201 first send, 200 exact retry                    |
| `POST /api/conversations/:id/read`           | `{through:message UUID}`                                     | `{updated:number}`; marks only incoming messages through the specified stored message |

`Conversation={id,booking_id,created_at,updated_at,unread_count,can_send}`. `Message={id,conversation_id,sender_id,client_key,body,read_at,created_at,updated_at}`. IDs are UUIDs; timestamps are UTC ISO strings; `read_at` is nullable. No participant email/phone or payment data is returned. The app may load the listing/booking from the existing participant booking API. Lists sort by timestamp then UUID descending. Message cursors use the stored timestamp/UUID tuple, so equal timestamps do not skip rows. Refresh page one after new events; offset conversation pages are not frozen snapshots.

Plain text bodies contain 1–2,000 Unicode characters after trimming surrounding ASCII spaces; whitespace-only bodies are rejected. Render as text, never raw HTML. Reuse the same client_key and body after a network error. The key is unique per sender across conversations; changing the conversation or body with that key returns 409 `idempotency_conflict`. Exact retries return the original row without another notification. Sending is serialized per conversation and limited to 20 new messages per sender per rolling minute in that conversation; 429 `rate_limited` includes no message content. Reads and exact retries do not consume this limit.

Database RPCs mirror HTTP: `open_booking_chat(p_booking)`, `list_my_conversations(p_page,p_page_size)`, `list_chat_messages(p_conversation,p_before,p_limit)`, `send_chat_message(p_conversation,p_key,p_body)`, `mark_chat_read(p_conversation,p_through)`. They repeat identity, validation and access checks. Authenticated table access is SELECT-only with RLS; all writes go through these commands.

## Realtime

Use the existing browser Supabase client and authenticated session. Subscribe to `postgres_changes` on public.messages with `event:'INSERT'` and `event:'UPDATE'`, filtered by `conversation_id=eq.<id>`. Use events as invalidation hints, then refetch the HTTP read model; after reconnect/auth refresh refetch as well. Register listeners before the initial fetch, deduplicate by message id, and remove channels on navigation/logout. Events are not a durable inbox. UPDATE events announce recipient read receipts. No DELETE subscription or REPLICA IDENTITY FULL is required.

For the pinned client/server, create the channel with `{config:{broadcast:{replication_ready:true}}}` and register `.on('system',{},handler)` before subscribing. A socket `SUBSCRIBED` alone does not establish database streaming readiness. Wait for system events with `status:'ok'` from both `extension:'postgres_changes'` (subscription active) and `extension:'system'` (replication established), then refetch to cover startup/reconnection gaps. Surface errors/timeouts as degraded connectivity and keep HTTP refetch available. This broadcast-named configuration requests a readiness signal; it sends no Broadcast messages and adds no broadcast data policy. [Protocol and readiness events](https://supabase.com/docs/guides/realtime/protocol).

Only messages and notifications are added to supabase_realtime; RLS checks the subscriber's current participant/recipient access. A guessed channel name or filter never grants access. No service key belongs in the browser. This uses Postgres Changes, not Broadcast/Presence. [Supabase guidance](https://supabase.com/docs/guides/realtime/postgres-changes).

The migration enables publication membership; running/local/hosted Realtime service and actual allow/deny delivery must be verified separately. Notifications are documented in [the notification contract](../notifications/README.md). Review eligibility, email, scheduled reminders and handover/settlement remain separate features.

## Verification and rollout

Local verification uses real Auth users, HTTP session cookies and Realtime sockets: `npm run db:test:chat` and, with a production app on localhost:3000, `npm run test:chat:http`. The tests cover participant and administrator-outsider denial, direct-write denial, concurrent opening/retries, cursor ties, cross-thread anchors, read receipts, suspension/unverified identities, message throttling and recipient-only events. `npm run db:test` includes grant/publication checks; CI now starts Realtime and runs both new suites.

Only the local database has received this migration. After Person A reviews and CI passes, merge, apply the committed migration to the separate test database through the normal migration workflow, and verify hosted Realtime with fictional participants before connecting A's screens. Do not reset a hosted database, add service credentials to client code or alter an applied migration. Email and reminders remain later work; this does not close the payment failure acceptance gate.
