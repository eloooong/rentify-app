# B1.3 catalog and image contract

This backend lives in `lib/catalog` and `/api/catalog`; A retains `lib/listings`, listing components, and screens. Integrate after this PR merges. Local migrations use `migration up --local`, preserving existing data. Hosted migrations/buckets still require separate deployment.

## Routes

All responses are private/no-store. JSON success is `{ data }`; list responses also have `{ pagination: { page, pageSize, total } }`. Errors are `{ error: { code, message, fields? } }`; provider details are not exposed. `fields` contains Zod field errors. UUIDs must be valid. Unsupported HTTP methods return 405.

| Method and path                                    | Behavior                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/catalog/categories`                      | Public categories and typed `attribute_schema` templates.                                                               |
| `GET /api/catalog/listings`                        | Public published listings from active owners. Uses an anonymous client even when the visitor is signed in.              |
| `GET /api/catalog/listings/:id`                    | Public detail only; drafts, paused, hidden, missing, and suspended-owner listings return 404.                           |
| `GET /api/catalog/own`                             | Verified user's own listings, including draft/paused/hidden states. Optional `id` filters one listing for editing.      |
| `POST /api/catalog/listings`                       | Create an owned draft. Requires a saved profile, verified email, and active account.                                    |
| `PATCH /api/catalog/listings/:id`                  | Replace the editable fields and status of an owned, unrestricted listing.                                               |
| `DELETE /api/catalog/listings/:id`                 | Delete an owned draft with no photo records or booking references.                                                      |
| `POST /api/catalog/listings/:id/photos`            | Multipart upload: exactly one `file` and one `position` (`0`–`7`).                                                      |
| `GET /api/catalog/listings/:id/photos/:photoId`    | WebP bytes. Owner can preview private photos; other visitors can read attached photos only while the listing is public. |
| `DELETE /api/catalog/listings/:id/photos/:photoId` | Remove owned photo metadata, then its stored file. Pause a published listing before removing its last photo.            |

Use same-origin browser `fetch` with cookies. Every mutation requires the exact configured `NEXT_PUBLIC_APP_URL` as its `Origin`; missing/cross-origin values return 403. No privileged key is used in application code. Protected endpoints call `auth.getUser()` and enforce ownership; RLS repeats the checks for direct Supabase access.

Status codes: 200/201 success; 400 invalid input/category/publication requirements; 401 unverified/missing session; 403 forbidden/origin/profile restriction; 404 inaccessible/missing item; 409 occupied photo position, deletion dependencies, or a listing that must return to draft; 413 size limit; 415 unsupported body/image; 503 temporary provider failure.

## Listing fields

```json
{
  "category_id": "UUID from categories",
  "title": "Canon camera",
  "description": "Includes a battery and charger.",
  "daily_price_amount": 12000,
  "deposit_amount": 50000,
  "currency": "PHP",
  "condition": "Good",
  "pickup_area": "Campus",
  "attributes": { "brand": "Canon", "model": "R6" }
}
```

Prices are integer minor units (`12000` means PHP 120.00); daily price must be positive, deposit nonnegative, maximum 2,147,483,647. These are listing amounts, not payment/refund/deposit-processing policies. Currency is a three-letter uppercase code, default PHP from the existing schema; no exchange/conversion is provided.

Title: trimmed 3–120 characters. Description: up to 5,000, default empty. Condition: 1–80. Pickup area: 3–120; A should ask for a general neighborhood/meeting area rather than a private address. Attributes contain only template-defined values. Description, attributes, deposit and currency have safe create defaults; required category fields still apply. JSON bodies are capped at 32 KiB.

POST rejects supplied IDs, owner IDs, status, and unknown fields. PATCH requires the full editable payload above plus `status: 'draft' | 'published' | 'paused'`; it is not a partial patch. Identity and ownership cannot change. `hidden` is reserved for trusted moderation and cannot be set or undone by the owner. Publishing requires at least one attached uploaded photo; deleting a listing requires returning it to draft, removing photos, and having no booking references.

Listings returned by read endpoints include database fields and `photos: [{ id, position, url }]`, ordered by position. Import the shared `CatalogListing`, `CatalogPhoto`, and `CatalogPage` types from `@/lib/catalog/types` with `import type`. Create/update responses return the saved database row; refetch detail/own to obtain photo URLs. A verified user's own rows come from `/own`, not the public detail endpoint. Public projections contain no private phone numbers or email addresses.

Public browse query: `q` (literal title search, up to 100 characters), `categoryId`, `currency` (default PHP), `minPrice`, `maxPrice`, `sort=newest|price_asc|price_desc`, `page` (1–10,000), `pageSize` (1–50, default 20). Prices filter within one currency, never across currencies. Sorting includes a stable ID tie-breaker. `/own` accepts only `id`, `page`, and `pageSize` and sorts newest first. Unknown query parameters are rejected.

## Category templates

Four starter reference categories come from the gadget examples in the existing project drafts. They are technical starter definitions, not final product/design approval:

| Slug          | Required attributes                                                   | Optional attributes                |
| ------------- | --------------------------------------------------------------------- | ---------------------------------- |
| `cameras`     | `brand`, `model` (text)                                               | `lens_mount` (text)                |
| `laptops`     | `brand`, `model` (text), `ram_gb` (integer 1–256)                     | `storage_gb` (integer 1–8192)      |
| `drones`      | `brand`, `model` (text)                                               | `battery_cycles` (integer 0–10000) |
| `vr-headsets` | `brand`, `model` (text), `connection` (`standalone`, `pc`, `console`) | —                                  |

`attribute_schema` is `{ version: 1, fields: [{ key, label, type, required, min?, max?, options? }] }`. Text is trimmed, nonempty, up to 80 characters. Optional fields should be omitted when blank. Integers must be JSON numbers. Unknown keys/invalid options are rejected by Zod and the database trigger. Legacy categories with `{}` permit empty attributes only. Category changes remain trusted migrations/server administration; client writes are denied. Demo users/listings are B1.4.

## Image lifecycle and access

```ts
const body = new FormData();
body.set("file", selectedFile);
body.set("position", "0");
const response = await fetch(`/api/catalog/listings/${listingId}/photos`, {
  method: "POST",
  body,
}); // Let the browser set the multipart Content-Type/boundary.
```

API input: JPEG, PNG, or WebP, maximum **4 MiB**, up to 40 megapixels, one static image. Actual bytes are decoded with `sharp`; supplied MIME/filename does not establish type. Images are oriented, resized inside 2560×2560, converted to WebP, and stripped of metadata. Output is also capped at 4 MiB. Multipart body overhead is capped at 64 KiB. The limit stays below [Vercel's 4.5 MB function payload ceiling](https://vercel.com/docs/functions/limitations); hosted deployment itself remains unverified.

Private bucket: `listing-images`; path: `<owner UUID>/<listing UUID>/<random UUID>.webp`. The bucket enforces 4 MiB/WebP. Owners can insert only inside an owned active listing's namespace; no UPDATE/upsert policy exists. Metadata can attach only an existing owned object at that exact listing path. Eight unique positions cap the photo records. Attached objects cannot be directly deleted through Storage; detach the photo record first. Public reads require an attached photo on a published listing with an active owner. Unattached uploads remain private. Hidden listings block owner writes. Suspended users retain own reads but cannot edit/upload.

Render returned photo URLs using `<img>` or Next Image with `unoptimized`; private previews need the browser's cookies. Avoid the image optimizer/CDN for these access-checked URLs. The endpoint re-decodes files uploaded directly through Storage, returns `image/webp`, `nosniff`, sandbox CSP, and private/no-store caching. Unpublishing revokes subsequent origin reads for other visitors; already downloaded copies cannot be recalled. No long-lived signed/public bucket URLs are issued.

Upload happens before metadata insertion; a conflict attempts to remove the new object. Photo deletion removes metadata before removing storage bytes so a failed cleanup cannot leave a public record pointing at a missing image. Delete success includes `{ deleted: true, storageCleanupPending: boolean, storagePath? }`. If storage cleanup fails, the unreferenced object is private; the owner can retry `supabase.storage.from('listing-images').remove([storagePath])`. Remaining uploads block listing deletion until cleaned, preserving the owner's access. After a failed-upload cleanup, list the owned `<owner UUID>/<listing UUID>` prefix and remove its unreferenced files before retrying listing deletion. Operational orphan cleanup and production rate/abuse controls remain deployment hardening tasks. No automatic cleanup job is claimed.

Avatar uploads remain a separate feature; this bucket is for listing images only. Booking availability, transitions, money movement, deletion/retention policy, and condition-evidence storage remain separate handoffs.

## Verification

Run migrations locally without reset, regenerate types, and run `db:lint`, `db:test`, `db:smoke`, lint/typecheck/tests/format/build. SQL tests cover direct client grants/RLS, category validation, ownership, moderation, publication, missing objects, and private/public image visibility. `tests/e2e/auth.py` imports the catalog journey and tests real image upload/download, direct Storage attacks, filters, publish/pause/delete and cleanup with two disposable users. CI includes the real Storage service and runs the same production-build journey. Privileged credentials are used only inside the local test process for fixture cleanup, never application/browser code.

References: [Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [private buckets and restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals).
