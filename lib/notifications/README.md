# In-app notification contract

Person B owns the backend; Person A owns the bell/center. Integrate after this implementation PR merges. Angel selected in-app delivery first; email is later. No email provider, push service, outbound messages or scheduled reminder policy is added here. B3.1 stays incomplete for those later requirements.

Verified users can read only their own notifications, including while suspended. Only trusted database triggers create notifications. Clients cannot choose a recipient, type, payload, timestamp or unread state. Marking read is one-way and idempotent. Admin status grants no extra access.

`GET /api/notifications?page=1&pageSize=20&unread=false` returns `{data:Notification[],pagination:{page,pageSize,total},unread_count:number}`. page is 1–10000 and pageSize 1–50. unread is exactly `true` or `false` (default false); true restricts rows to unread. Unknown or repeated parameters return 400. Rows sort by created_at and id descending. unread_count counts all of the recipient's unread notifications, independent of the page/filter.

`POST /api/notifications/:id/read` accepts `{}` and returns `{data:Notification}`. A missing or another user's id returns 404. All HTTP responses are private/no-store; writes require canonical Origin/application/json; anonymous or unverified requests receive 401. Errors use `{error:{code,message}}`.

`Notification={id,user_id,type,payload,read_at,created_at,updated_at}`. IDs are UUIDs; timestamps are UTC ISO strings; read_at is nullable. Payloads contain routing identifiers/status only, never chat bodies, contact data, provider identifiers or credentials:

- `chat.message`: `{booking_id,conversation_id,message_id}`; exactly one notification to the other participant for a new message, none for an idempotent retry.
- `booking.requested`: `{booking_id,status:'requested'}` to the owner for a new booking request.
- `booking.status`: `{booking_id,status}` to both participants when a booking changes status (including system expiry/payment). Informational events may include the actor's own action. No retroactive alerts for existing bookings.

RPCs: `list_my_notifications(p_unread,p_page,p_page_size)`, `mark_notification_read(p_notification)`. Table SELECT is recipient-only RLS; direct writes and public RPC creation are denied. Internal deduplication keys are not returned by HTTP. Postgres Changes publishes notifications INSERT/UPDATE with recipient RLS. Subscribe using `user_id=eq.<signed-in user id>` and refetch the API on events/reconnect; a filter is only an optimization, never authorization. No message delivery or read status is inferred from a socket acknowledgement.
