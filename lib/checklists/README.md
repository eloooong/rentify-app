# Handover and return checklists

Person B owns the checklists. The account page links to `/checklists`. For booking-page integration, link to `/checklists/{bookingId}/handover` or `/checklists/{bookingId}/return` and let the checklist page check eligibility. Person A owns booking-page links.

The owner and renter each check the device and accessories, record its visible condition, and confirm physical transfer. Each can save one private photo per stage before confirming and include optional condition notes. Each confirmation is immutable. The second confirmation moves a paid booking to `handed_over` or a handed-over booking to `returned`. The physical return record is an input to B3.3 inspection approval and settlement.

Handover opens on the pickup date in Asia/Manila or later. Another booking for the same device in `handed_over`, `returned`, or `disputed` blocks handover until the device is cleared. Physical return can be confirmed any time after handover. The command locks the listing before the booking to serialize with acceptance and paid cancellation. The confirmation and any status change each create one audit record. Identical retries return the existing confirmation, and changed notes on retry get a conflict.

| Endpoint                                          | Request                                                                                      | Response                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GET /api/checklists/{id}/{stage}`                | Verified participant                                                                         | `200 {data:Checklist}`                      |
| `POST /api/checklists/{id}/{stage}`               | `{checks:{device_checked:true,condition_recorded:true,physical_transfer:true},note?:string}` | `200 {data:Checklist}`                      |
| `POST /api/checklists/{id}/{stage}/photos/{side}` | Raw JPEG, PNG, or WebP up to 4 MiB in the caller's own slot                                  | `201 {data:Checklist}`                      |
| `GET /api/checklists/{id}/{stage}/photos/{side}`  | Verified participant                                                                         | `200 image/webp` with private cache headers |

`stage` is `handover` or `return`. `side` is `owner` or `renter`. `Checklist` includes `booking_id`, `booking_status`, `stage`, the caller's `role`, `can_confirm`, and each side's `{side}_confirmed_at`, `{side}_note`, and `{side}_photo`. Confirmation times are nullable timestamps with offsets. Notes are plain text up to 1,000 Unicode characters, with surrounding ASCII spaces trimmed. Photo fields are booleans. Storage paths and credentials stay on the server side of the download route.

Booking participants with verified email can read, including after suspension. Only active verified participants with a profile can confirm or upload. HTTP mutations require the canonical Origin. Signed-out access returns `401 sign_in`. Outsiders and absent photos return `404 not_found`. `409 stage_closed`, `already_confirmed` and `photo_exists` describe conflicts. Invalid bodies or photos return 400, oversized uploads return 413, and unsupported content types return 415. Display notes as plain text.

The private `checklist-evidence` bucket restricts inserts to the caller's exact booking, stage and side. Storage denies direct client reads, signed URLs, replacements, and deletes. The download API verifies the participant with their session before using the server Storage key. The API decodes and re-encodes photos to WebP to strip metadata and serve safe image bytes. The app needs the existing server-only `SUPABASE_SERVICE_ROLE_KEY` for evidence downloads. For local tests, use the local Supabase service-role key in the app process.

The RPCs are `get_condition_checklist(uuid,text)` and `confirm_condition_checklist(uuid,text,jsonb,text)`. Reports use one existing `condition_reports` row per stage. The first object in `checklist` maps confirmed roles to their notes. Confirmed-at columns record the three checks for that role. Evidence slots are derived from the booking UUID and stage. B3.3 can consume both confirmation timestamps and implement a distinct inspection approval.
