# B1.2 profile contract

## Completion and editing

Verified users create their profile by saving `/account`; signup alone does not create a row. The same form edits existing profiles. Existing Auth accounts need no backfill. A missing private row is created on save. Blank or failed loads never overwrite a profile automatically.

The server action `saveProfile(previous: ProfileState, form: FormData)` in `app/(auth)/account/actions.ts` accepts **only** `displayName` and `phone`. It verifies `auth.getUser()`, validates with Zod, and calls the atomic `save_my_profile` RPC with the session's public client. No privileged key is used. Unknown form fields, IDs, roles, statuses, verification timestamps, and avatar paths are ignored.

- `displayName`: trimmed, 1–80 characters, one line, no control characters. Public information; choose a name you are comfortable sharing.
- `phone`: optional international number (`+` followed by 8–15 digits, first digit nonzero), no spaces. Blank removes it. Private; saving it never verifies it. This does not implement SMS delivery, phone sign-in, or identity verification.
- Result: `{ status: 'idle' | 'error' | 'success', message?, errors?: { displayName?: string[], phone?: string[] } }`. Failures expose no provider details. A successful save invalidates `/account`.

The database RPC is `save_my_profile(p_display_name text, p_phone text DEFAULT NULL) RETURNS void`. Omit `p_phone` to clear it (generated TypeScript models omission, not SQL NULL). Both upserts commit together or roll back together. It derives the owner from `auth.uid()`; there is no owner parameter. It runs as the caller and obeys RLS/column privileges. The database rechecks actual Auth email confirmation and trusted account status; forged user metadata is irrelevant. Suspended accounts can read their own details but cannot edit them.

## Read and permission contract for Person A

Public queries **must** select an explicit projection:

```ts
const { data, error } = await supabase
  .from("profiles")
  .select("id,display_name,avatar_path,created_at,updated_at")
  .eq("id", ownerId)
  .maybeSingle();
```

Active profiles are public; suspended profiles are hidden except from their owner. `role` and `account_status` are not granted to public/authenticated table queries, and `SELECT *` intentionally fails. Never add these fields or private data to a listing projection. `avatar_path` is read-only for clients until B1.3 establishes storage ownership; no bucket or avatar upload is included here.

`profile_private` permits authenticated users to select only their own `user_id,phone,phone_verified_at`. Other users receive no rows; anonymous reads fail. `getOwnProfile(userId)` in `lib/profiles/server.ts` loads both records for an authenticated server-rendered account page. Call it after verified identity and pass that user's ID. It does not bypass RLS.

Only the owner's name and phone are writable through client column grants. RLS denies another user's changes and unverified/suspended edits. Triggers additionally reject changes to trusted roles, account statuses, identity keys, and phone verification by API roles. A changed/removed phone clears any prior verification, including changes made by trusted code. A future verification service must verify the new number before setting its timestamp separately. Client profile deletion is not enabled; retention/deletion policy remains a separate decision.

Trusted administration uses server-side database access or migrations, never user metadata. This task protects existing role fields; it does not provide a role-assignment UI, admin grants to ordinary users, or an admin dashboard. `/admin` continues to deny access until the admin feature is implemented.

## Migration and verification

Apply new migrations without resetting existing local data:

```sh
npm exec -- supabase migration up --local
npm run db:types
npm run db:lint
npm run db:test
```

New name/phone constraints are `NOT VALID` to preserve pre-existing foundation rows without a destructive cleanup; PostgreSQL still enforces them on all inserted/updated rows. Legacy values may require an explicit cleanup before a later `VALIDATE CONSTRAINT`. New profiles and edited rows must satisfy the contract.

The SQL suite covers allowed and denied direct access, cross-user isolation, role/verification escalation, actual email confirmation, suspension, atomic rollback, validation, and verification reset/preservation. The existing real auth browser journey now also creates/edits/removes profile data and exercises the public API boundaries with two users. Test users and their cascaded profile rows are removed afterward. Add `--screenshots` for ignored desktop/mobile review captures under `tmp/profile-ui-review/`. Hosted migrations and hosted email services are not applied by local commands.

Person A may connect profile UI after this PR merges. Listing/upload integration still waits for B1.3. Keep header changes in A's branch; this task only extends B's account page.

References: [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [function security](https://www.postgresql.org/docs/17/sql-createfunction.html).
