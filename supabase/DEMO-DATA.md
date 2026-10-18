# Local demo data — B1.4

Run from the repository root after `npm ci` and `npm run db:start`:

```sh
npm run db:demo
npm run dev
```

The script accepts only the CLI-reported API `http://127.0.0.1:54321`. It has no URL, linked-project, or admin-key override and never reads hosted credentials from `.env.local`. Local privileged credentials stay in the seed process; the app continues to use public keys only. No email leaves the local stack.

## Accounts and password

| Login                              | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `rentify-demo-owner@example.test`  | Owns all five reserved demo listings      |
| `rentify-demo-renter@example.test` | Separate account for testing access rules |

Both accounts are email-confirmed, ordinary users with editable profiles and empty private phone details. Owning and renting do not grant admin privileges.

The first run generates a strong password in **ignored `.env.demo.local`**, shared by these two local demo accounts. Open that file locally to read `RENTIFY_DEMO_PASSWORD`; the script never prints it. This file is for seed tooling and is not loaded by Next.js. An explicit process environment variable of the same name takes precedence; use 12–72 characters. A commented placeholder is in [`.env.example`](../.env.example).

Keep the original password when rerunning. Existing passwords are never changed automatically. If login validation fails, restore the original file/environment value or use local Auth administration to deliberately reset the demo password. Never commit this file, use these accounts in a hosted environment, or reuse their password elsewhere.

## Listings and Person A's handoff

The seed creates one published listing per starter category (camera, laptop, drone, VR headset) and one private camera draft. Each has a real private-bucket WebP generated from a simple code-drawn illustration. All descriptions and images say they are demos. Brands, equipment, pickup locations, prices and deposits are fictional examples; they do not settle business policies.

Prices use the existing integer minor-unit contract: `85000` means PHP 850.00. Public queries should return four fixture listings; the owner can see the fifth draft through the owner API. Other preexisting listings may also appear.

Person A can pull merged B1.3 now and build against the [catalog API/storage contract](../lib/catalog/README.md). After B1.4 merges, run this seed on **each developer's own local stack**; Git does not synchronize database contents or passwords. Test login at `http://localhost:3000/login`. Browse/detail/owner screens remain Person A's work; the seed adds data, not those screens. The existing public API is `/api/catalog/listings`.

## Repeat and reset safely

```sh
# Create only missing accounts, profiles and reserved listings; preserve existing edits.
npm run db:demo

# Explicitly replace ONLY the five reserved fixture listings and their photos/uploads.
# Retains account IDs, passwords, profiles, unrelated listings and other users' data.
npm run db:demo:reset -- --confirm

# Tests use a separate random namespace and remove only their own fixtures.
npm run db:demo:test
```

Repeated seeds preserve listing status/content, image bytes, profile edits, IDs and timestamps. A trusted Auth metadata marker and exact email identify seed-owned accounts. A conflicting email or listing ID causes refusal rather than an overwrite. Missing category templates, invalid existing credentials and hosted URLs also fail safely. Runs are sequential; do not run two seed/reset commands at once.

The explicit reset discards edits/uploads on the **five reserved listing IDs only**. It checks ownership and refuses if any has a booking reference before changing listings. Storage files are removed through the Storage API, then listings are deleted and recreated. Accounts and profile edits remain. Reset does not delete arbitrary listings created while signed in as a demo user.

The seed is not a transaction across Auth, PostgreSQL and Storage. An interrupted upload can leave a partial demo draft; rerunning preserves it. Use the scoped reset to recreate those fixtures. Reset can also be rerun after an interruption. Do not remove managed Storage rows directly with SQL.

`npm run db:reset` remains a separate **destructive whole-local-database reset**. It requires an intentional decision to discard all local development data; it is never invoked by demo tooling. On a newly reset stack, rerun `npm run db:demo` to recreate accounts/listings. Keep `.env.demo.local` to reuse the password.

## Verification and limits

`db:demo:test` checks local-only targeting, CLI confirmation, credential-file reuse, trusted ownership, repeatability, preserved edits, both logins, public/private listing and image reads, denied renter writes, booking-history protection, physical image removal, and a reset/reseed that retains unrelated data. Database CI runs it on a disposable local stack.

Verified locally on 18 October 2026: `db:demo` created five fixtures and a repeat run preserved all five; all five `db:demo:test` tests passed. `lint`, `typecheck`, `test` (83), `format:check`, `build`, `db:lint`, `db:test` (142), `db:smoke` and `db:types` passed, with no generated type drift. Real browser auth/profile/catalog journeys and both demo logins passed on the production build, including public image reads, owner-only drafts and denied admin access.

No bookings, payments, admin access or live offers are seeded. No schema migration is required; regenerate types with `npm run db:types` and verify there is no drift. Hosted Supabase, deployment, payment/date/refund policies and Person A's remaining screens are separate pending tasks.
