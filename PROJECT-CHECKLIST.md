# Rentify team checklist

**Person A: your friend, using Claude Code. Person B: you, using Codex.**

Keep this file open while working. It is the shared progress checklist, updated by the person finishing each task. It does not update automatically.

**Latest check: 18 October 2026 (Asia/Manila).** B1.1–B1.4, B2.1/B2.2 and the B2.3 backend are merged. A1.1–A1.3 are checked complete after Person A's real local Supabase verification in [PR #37](https://github.com/eloooong/rentify-app/pull/37); the earlier pagination issue is resolved. B2.4 cancellation/refunds are implemented in B's task branch with review/merge and actual provider checks pending. Checkout/refund execution remain disabled without a verified PayMongo test setup.

**Newly merged:**

- [PR #12 — Person A checklist update](https://github.com/eloooong/rentify-app/pull/12): A0.2 is complete based on A's recorded mobile/desktop accessibility, keyboard, and 375px layout checks. B0.3/B0.4 completion statuses are preserved.
- [PR #14 — shadcn/ui](https://github.com/eloooong/rentify-app/pull/14): component setup, token mapping, and the `/ui-kit` reference page are on `main`; app and database CI passed. Approved Figma values and mobile design references are still pending, so A0.1 remains partly complete.

Both people should pull updated `main` and run `npm ci` before the next coding task. Continue with separate branches. B2.2 [PR #28](https://github.com/eloooong/rentify-app/pull/28), payment decisions [PR #32](https://github.com/eloooong/rentify-app/pull/32), and B2.3 backend [PR #36](https://github.com/eloooong/rentify-app/pull/36) are merged. The current B task is `codex/cancellation-refunds`: paid cancellation/refund APIs, private refund ledger migration/types, backend tests/CI, environment/contract documentation and B's checklist entries. No frontend or dependency additions. Keep one editor per shared file and one migration PR open.

**Current payment handoff:** B2.3 merged in [PR #36](https://github.com/eloooong/rentify-app/pull/36) with both CI workflows passing; A can connect the [checkout/webhook/worker contract](lib/payments/README.md). B2.4's [paid cancellation/refund contract](lib/payments/REFUNDS.md) is implemented in [PR #38](https://github.com/eloooong/rentify-app/pull/38) (`codex/cancellation-refunds`), pending review/merge and genuine provider verification. Person B has no PayMongo account yet; checkout/refund execution stay disabled. Local validation passed: 228 unit tests, 279 SQL checks, lint/types/format/build, regenerated types without drift, real Auth/refund/booking/payment/concurrency and HTTP tests, five demo-tooling tests, DB smoke and the browser auth/profile/catalog/recovery journey. Review/CI and external gates remain pending; deterministic tests do not complete provider verification.

## Next session — who works and who waits

- [x] **Person B — B1.4 complete.** [PR #23](https://github.com/eloooong/rentify-app/pull/23) merged with both CI workflows passing. Local seed, repeat and confirmed scoped reset passed; demo accounts/listings/photos are available on B's machine. [Commands and handoff](supabase/DEMO-DATA.md). The local app is rebuilt with A's merged browse/detail screens.
- [x] **Person B — B2.1 complete.** [PR #27](https://github.com/eloooong/rentify-app/pull/27) merged with both CI workflows passing; safeguards, participant reads and concurrency checks are on `main`.
- [x] **Person B — B2.2 complete.** [PR #28](https://github.com/eloooong/rentify-app/pull/28) merged with both CI workflows passing: quotes, request/accept/decline/cancel, private list/detail, public availability and minute-based expiry. Local migrations preserved data; 240 SQL checks, 125 unit tests, real Auth/RPC/concurrency/scheduled expiry, HTTP and browser journeys passed. [API contract](lib/bookings/README.md).
- [ ] **Person B — active: B2.4 cancellation/refunds.** B2.3 backend merged in [PR #36](https://github.com/eloooong/rentify-app/pull/36), but its actual provider checks remain pending. B2.4 is implemented in [PR #38](https://github.com/eloooong/rentify-app/pull/38) (`codex/cancellation-refunds`); [API and worker handoff](lib/payments/REFUNDS.md). Keep both payment tasks unchecked until their required handoff/external gates pass. No PayMongo account yet; checkout, signed delivery, expiry and full/partial test refunds are unverified. Chat stays a separate later task.
- [ ] **Person A — next:** A2.1 and A2.2 are complete per [PR #39](https://github.com/eloooong/rentify-app/pull/39) and [PR #40](https://github.com/eloooong/rentify-app/pull/40). A2.3's checkout screen is merged in [PR #41](https://github.com/eloooong/rentify-app/pull/41) but stays unticked until a real PayMongo test payment is verified. Next: wire B2.4 paid cancellation into the booking page. A2.4 history waits for its API contract. Real Figma/mobile frames remain a separate design follow-up.
- **WAIT points:** A can use merged listing/demo, B2.2 bookings and B2.3 checkout contracts now; each developer seeds their own local stack. B owns backend/storage/payment work; A owns frontend. Actual hosted checkout waits for test credentials, HTTPS delivery and worker verification. Refund controls wait for B2.4 merge and the published handoff; actual refunds also require verified account support and separate opt-in. Deposit settlement waits for B3.3, and live use for custody/dispute/deployment decisions. One editor per shared file.

## Where we are now

| Item                                                             | Status                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B0.1 app scaffold and CI                                         | Complete; PR #1 merged and scaffold checks passed                                                                                                                                                                        |
| [Scaffold PR #1](https://github.com/eloooong/rentify-app/pull/1) | Merged on 17 October 2026                                                                                                                                                                                                |
| B0.2 shared agent rules                                          | Complete; [PR #2](https://github.com/eloooong/rentify-app/pull/2) merged                                                                                                                                                 |
| B0.3 schema foundation                                           | Complete; [PR #4](https://github.com/eloooong/rentify-app/pull/4) merged; schema contract and generated types published                                                                                                  |
| Supabase local runtime and application clients                   | B0.4 complete; [PR #9](https://github.com/eloooong/rentify-app/pull/9) merged. Windows setup, reset, 63 SQL checks, real API/Server Component queries, and type verification passed on 18 October 2026                   |
| Person A status                                                  | A1 listing create/edit/upload (#33), management (#35), pagination fix (#30) and real-data acceptance (#37) merged. A1.1–A1.4 are checked complete. Approximate tokens approved; real Figma/mobile frames remain pending. |
| Person A can do now                                              | B2.4 paid cancellation on the booking page. A2.3 real checkout needs B's PayMongo test account and return URL; A2.4 needs its history contract; A3.4 still needs B's feedback API/legal review.                          |
| Person B can do now                                              | Review/merge B2.4 cancellation/refunds on `codex/cancellation-refunds`; create a PayMongo test account separately for pending checkout/refund verification. No credentials are needed for isolated backend tests.        |
| Next coding handoff                                              | A uses merged booking/checkout APIs; B2.4 paid cancellation/refund controls wait for its review/merge. A2.4 history and B3.3 inspection/deposit settlement remain later contracts.                                       |

Check off a task after its acceptance checks pass and its PR is merged. Preparatory work can happen while a dependency is pending; do not mark a feature done just because it works against a mock.

## 0. Foundation — start here

**Person B — you**

- [x] **B0.1** Scaffold and CI verified; [PR #1](https://github.com/eloooong/rentify-app/pull/1) merged.
- [x] **B0.2** Shared rules and ownership added in `AGENTS.md`; [PR #2](https://github.com/eloooong/rentify-app/pull/2) merged.
- [x] **B0.3** Initial schema, schema diagram, access tests, generated types, and [contract](supabase/README.md) published; [PR #4](https://github.com/eloooong/rentify-app/pull/4) merged. Feature permissions still gate integration.
- [x] **B0.4** Local Supabase and typed clients shipped in [PR #9](https://github.com/eloooong/rentify-app/pull/9). Docker/WSL setup, reset, 63 SQL checks, real API/Server Component smoke, and generated types verified locally on 18 October 2026. [Setup instructions](supabase/README.md).
- [ ] Complete the remaining setup: agree development environments, configure branch protection, and connect Vercel previews.

**Person A — your friend**

- [ ] Audit Figma: mobile and desktop listing, booking, checkout, chat, and checklist screens; export tokens. _In progress: A reported Figma API access blocked (View seat), so the audit used design screenshots. Only desktop home, All Items, listing detail, header states and two modals were seen; no mobile frames. Draft tokens (approximate, brand primary `#E55910`) are in `docs/design-tokens.json`, merged in [PR #6](https://github.com/eloooong/rentify-app/pull/6). Real values and mobile frames are still needed._
- [x] **A0.1** Map approved tokens into CSS/Tailwind and initialize shadcn/ui. _Tokens mapped in [PR #10](https://github.com/eloooong/rentify-app/pull/10); shadcn components, token mapping, and `/ui-kit` merged in [PR #14](https://github.com/eloooong/rentify-app/pull/14) (shadcn moved to devDependencies in [PR #16](https://github.com/eloooong/rentify-app/pull/16)). **Tokens approved by Person A on 18 October 2026** for the MVP: the colors sampled from the design screenshots (brand primary `#E55910`), `brand-strong` `#C2410C` for small orange text and buttons (WCAG AA contrast), and the system font stack. If real Figma values become available, they replace these in `app/globals.css` only. Run `npm ci` after pulling dependency changes, and coordinate future package/configuration edits with B._
- [x] **A0.2** Build the responsive app shell: header, footer, layout, navigation, and skip link. Shell merged in [PR #10](https://github.com/eloooong/rentify-app/pull/10). _A verified it on the `main` production build: Lighthouse 13.5 accessibility 100 on mobile and desktop, keyboard order checked, header collapses at 375px with no horizontal scroll. Limits: no mobile Figma frames, so the mobile header is an adaptation; nav links to routes not built yet return 404 (Best Practices 96 for that reason only)._
- [x] **A0.3** Expand the starter README and architecture documentation using the actual project. README rewrite and `docs/architecture.md` merged in [PR #17](https://github.com/eloooong/rentify-app/pull/17); links, script names and the Mermaid diagram were checked. The README's production-audit note relies on [PR #16](https://github.com/eloooong/rentify-app/pull/16) (shadcn moved to devDependencies), also merged.
- [x] **A0.4** `CLAUDE.md` pointer to `AGENTS.md` merged in [PR #5](https://github.com/eloooong/rentify-app/pull/5).

**Policy record:** Person B approved [DECISIONS.md](DECISIONS.md), sections 1–6, and delegated section 7's demo payment choices on 18 October 2026. Person A's separate approval is not recorded. B2.1/B2.2 and B2.3 backend are merged. B2.4 is implemented in its task branch; actual provider checks remain pending. Later checklist/settlement dependencies and live custody/dispute/pilot decisions remain gated.

**WAIT:** Foundation B0.1–B0.4 and B1.1–B1.4 are merged. Both start separate branches from updated `main`. A can connect real auth, profiles, listings and uploads, and run the merged local demo commands on A's machine. Read the [current Supabase contract](supabase/README.md). Coordinate shared files and keep at most one migration PR open.

## 1. Accounts and listings

**Person B — you**

- [x] **B1.1** Authentication: signup, email verification, login/logout, password reset, and protected routes. _[PR #19](https://github.com/eloooong/rentify-app/pull/19) merged; 51 unit tests, 63 SQL checks, real browser auth journeys, production build, and CI passed. [Contract and test instructions](lib/auth/README.md). Hosted email/redirect configuration remains a deployment task._
- [x] **B1.2** Profiles: profile creation/editing, public versus private fields, protected admin role, and access-policy tests. _[PR #20](https://github.com/eloooong/rentify-app/pull/20) merged with passing CI, 70 unit tests, 103 SQL checks and real browser journeys. [Contract](lib/profiles/README.md). Hosted migrations remain a deployment task._
- [x] **B1.3** Categories, listings, photo records, storage policies, and category templates. _[PR #21](https://github.com/eloooong/rentify-app/pull/21) merged with passing CI; 83 unit tests, 142 SQL checks and real image/catalog browser journeys passed locally. [API/storage contract](lib/catalog/README.md). Person A can integrate now._
- [x] **B1.4** Demo users/listings, reproducible seed/reset commands, and regenerated database types. _[PR #23](https://github.com/eloooong/rentify-app/pull/23) merged with both CI workflows passing. Five demo-tooling tests, 83 unit tests on its original base, 142 SQL checks and real browser journeys passed. Types regenerated without drift; no schema changes. Seed/repeat/scoped reset verified locally; [guide](supabase/DEMO-DATA.md). Combined merged app subsequently passed build and 103 unit tests._

**Person A — your friend**

- [x] **A1.1** Listing create/edit form, category fields, and photo upload. _[PR #33](https://github.com/eloooong/rentify-app/pull/33) merged. Person A verified it on real local Supabase (Docker, `db:demo` data, production build of `9a08349`) on 18 October 2026 as the demo owner: real sign-in redirected to the editor; a Laptops listing with two 4032×3024 JPEGs was created and published (stored as minor units `45000`/`300000`, typed attributes, photo rows at positions 0–1, two WebP objects in `listing-images`) and appeared on `/listings`; replacing the cover removed the old row and Storage object and put the new photo at position 0; Save changes and Publish again without photos were blocked; Pause with all photos removed left 0 photo rows and 0 Storage objects, and the public detail page returned 404; the demo renter got 404 on the owner's edit URL._
- [x] **A1.2** My listings page, publish/pause actions, and delete confirmation. _[PR #35](https://github.com/eloooong/rentify-app/pull/35) merged. Verified by Person A on the same real local stack: the owner saw all six listings newest first, including the private draft (its photo returns 404 to signed-out visitors); Pause hid a demo listing from `/listings` and Publish restored it; deleting a published test listing through the confirmation dialog left 0 listing rows, 0 photo rows and 0 Storage objects; after the demo renter created a real booking request on the demo drone (`POST /api/bookings`, 201), the owner's Delete for that listing was disabled with the booking-history reason while other listings stayed deletable; the renter's own My listings showed "No listings yet"._
- [x] **A1.3** Browse/search, combined filters, sorting, pagination, and URL state. _[PR #22](https://github.com/eloooong/rentify-app/pull/22) merged; B's real Supabase check found `/listings?page=99` showing the load-failure state (HTTP 416 / `PGRST103`), fixed in [PR #30](https://github.com/eloooong/rentify-app/pull/30). Person A re-verified on real local Supabase (`db:demo` data, production build of `9a08349`) on 18 October 2026: `?page=2` and `?page=99` now show "This page is past the last result"; default order matches `created_at desc` in the database (published only); price ascending/descending, category, search, and search + ₱600–1,000 + sort combine correctly; no-match, min > max, unknown category and invalid price show their messages; card photos load as WebP through the photo route._
- [x] **A1.4** Listing details: photos, specs, price/deposit, owner information, and unavailable-listing handling. _[PR #24](https://github.com/eloooong/rentify-app/pull/24) merged with passing CI and A's recorded gallery/metadata/mobile checks against a mock. B subsequently verified the combined production build against real Supabase demo data at 1280px/375px: published detail/photos/owner, metadata, disabled booking and true HTTP 404 for draft/missing/invalid IDs. Real demo fixtures contain one photo each; A's multi-photo interaction checks used its mock._

**WAIT:** B1.3/B1.4 are merged and their contracts, policies, types and demo commands are available. A reports missing fields/policies to B instead of editing migrations. A continues its pagination fix and listing editor/management work while B implements the approved booking rules in phases. Each developer seeds their own local database.

## 2. Bookings and payments

**Person B — you**

- [x] **B2.1** Booking schema, self-booking prevention, and database overlap protection tested with concurrent requests. _[PR #27](https://github.com/eloooong/rentify-app/pull/27) merged with both CI workflows passing. Local 185 SQL checks, real Auth participant read/write-denial checks and four concurrency scenarios passed. [Contract](lib/bookings/README.md). Regression coverage continues in B2.2._
- [x] **B2.2** State transitions, permissions, server-side prices, availability endpoint, booking actions, expiry job, and tests. _[PR #28](https://github.com/eloooong/rentify-app/pull/28) merged with both CI workflows passing. [HTTP/RPC contract](lib/bookings/README.md). Local 240 SQL checks, 125 unit tests, real request/accept races, actual scheduled expiry, HTTP session/origin/input checks, auth/profile/catalog browser journeys, lint, typecheck, build, database lint/smoke and demo tests passed. Payment/checklist/settlement transitions stay gated._
- [ ] **B2.3** Gateway test-mode adapter, checkout endpoint, signed/idempotent webhooks, and payment records. _Backend merged in [PR #36](https://github.com/eloooong/rentify-app/pull/36), both CI workflows passed; [API and operations contract](lib/payments/README.md). Original validation: 260 SQL checks, 196 unit tests, real Auth/receipt/cancellation races, HTTP permissions and browser regressions. Actual provider checks remain pending. No PayMongo account yet; test checkout stays disabled. Full/partial refunds and a running external worker are unverified; no live money or settlement is enabled._
- [ ] **B2.4** Cancellation and refund rules from `DECISIONS.md`, with tests for each case. _Implemented in [PR #38](https://github.com/eloooong/rentify-app/pull/38) (`codex/cancellation-refunds`); [contract and gates](lib/payments/REFUNDS.md): atomic pre-pickup paid cancellation, full remaining refund reservations, private status, fenced workers, unknown-outcome discovery and bounded confirmed-failure retries. Migration applied without resetting data; local verification and review/merge status recorded in the handoff PR. Actual full/partial test-refund support remains pending, with separate refund execution opt-in disabled._

**Person A — your friend**

- [x] **A2.1** Availability calendar, date selection, price summary, and request UI. _[PR #39](https://github.com/eloooong/rentify-app/pull/39) merged. Person A verified it on real local Supabase (`db:demo` data, production build) on 24 October 2026: public availability loaded signed out with a sign-in link; keyboard selection 26 Oct–4 Nov showed 10 days and a ₱11,400 estimate; the demo renter's request returned 201 with a matching server quote and deadline; an identical retry returned 200 `replayed:true`; overlapping, too-soon and self-booking requests returned 409 `duplicate_request`, 400 `invalid_dates` and 400 `self_booking`; the owner saw "This is your listing"; after the owner accepted, those dates showed as unavailable; Lighthouse accessibility 100 on mobile and desktop. Signing in from a listing returns to `/account` because `safeReturnPath` allows only protected roots (flagged for B in the PR)._
- [x] **A2.2** Renting/hosting dashboards with allowed actions for each status. _[PR #40](https://github.com/eloooong/rentify-app/pull/40) merged. Person A verified `/bookings` and `/bookings/[id]` on the same real local stack on 24 October 2026 as the demo renter and owner: signed-out visits redirected to sign in and returned to the filtered URL; the renter cancelled a request with a reason (Postgres `cancelled`, reason and `closed_by` stored); the owner accepted one request (30-minute payment deadline shown) and declined another with a reason; acting on a closed booking returned 409 `invalid_transition`; overdue bookings show as Expired; unknown IDs return 404; no horizontal scroll at 375px. Paid, handover, return, completion and dispute states have labels but can't be reached until checkout and handover exist. Lighthouse not run on these signed-in pages._
- [ ] **A2.3** Checkout UI with processing, success, failure/retry, and cancellation states. _Built and merged in [PR #41](https://github.com/eloooong/rentify-app/pull/41): `/checkout/[bookingId]` with rent/deposit summary, the section 7 rules, required consent, polling while `creating`, an https-only PayMongo link while `open`, and paid, expired, refund-owed/refunded, review and not-payable states. Verified locally on 25 October 2026 after applying the payment migrations: a requested booking shows "Not ready for payment"; the owner is redirected to the booking; missing consent is blocked; with payments switched off, POST returned the real 503 `payments_unavailable` and created no attempt; seeded attempt rows (removed afterwards) rendered every state through B's `get_checkout`. Leave unticked: a real GCash test payment, the provider redirect and webhook confirmation wait for B's PayMongo test account, and B's `success_url`/`cancel_url` still point to `/account` instead of `/checkout/<bookingId>` (flagged in the PR)._
- [ ] **A2.4** Transaction history with type/date filters.

**WAIT:** B2.2 bookings and B2.3 checkout contracts are merged; A can connect those screens now. B2.4 paid cancellation/refund controls wait for its merge/handoff. A2.4's complete transaction-history UI still needs its later API contract. Actual provider behavior must be verified rather than inferred from mocks. No real money movement, owner payouts or automatic deposit release. Other work can continue in separate owned folders.

## 3. Trust, communication, and completion

**Person B — you**

- [ ] **Added dependency task:** conversation/message policies, conversation creation, Realtime setup, review eligibility/uniqueness, and notification read/update permissions; include access tests.
- [ ] **B3.1** In-app notifications, email templates, sandbox mode, delivery-failure handling, and scheduled reminders.
- [ ] **B3.2** Handover/return checklist screens, private evidence uploads, and confirmation from both parties.
- [ ] **B3.3** Completion, deposit release, payout records, damage/dispute entry, and scheduled automatic completion.
- [ ] **B3.4** Reports, feedback, protected admin screens/actions, account suspension, and audit records.
- [ ] **Added lifecycle task:** define and implement minimum admin dispute settlement, including money handling and whether an unreturned/disputed device remains bookable.

**Person A — your friend**

- [ ] **A3.1** Booking-linked chat, unread state, retries, and accessible message announcements.
- [ ] **A3.2** Notification bell/center, read state, and booking/chat links.
- [ ] **A3.3** Two-sided reviews and rating displays after completed rentals.
- [ ] **A3.4** Help center, feedback form, and draft legal/prohibited-items pages. _Built and merged in [PR #29](https://github.com/eloooong/rentify-app/pull/29): `/help` (FAQ accordions, feedback form), `/help/terms`, `/help/privacy` and `/help/prohibited-items`, all marked Draft and `noindex`, reachable from the footer, Lighthouse accessibility 100. Undecided policies show "To be decided". Leave unticked: the feedback form targets the proposed `POST /api/feedback` (B3.4, not built), so its success path is only unit-tested, and the legal text still needs legal or faculty review._

**WAIT:** A waits for participant access policies and Realtime setup before connecting chat, and review policies before accepting real reviews. A can build presentation components meanwhile. B waits for the agreed return-inspection timeout and dispute policy before implementing automatic deposit release. Never bypass privacy rules or invent a refund policy to unblock a demo.

## 4. Verification and pilot

**Person B — you**

- [ ] **B4.1** Security review; fix high findings and add regression tests; track remaining findings.
- [ ] **B4.2** Critical rental journey tests on mobile and desktop, with isolated test data and CI.
- [ ] **B4.3** Staging/production configuration, migration workflow, monitoring, backup/restore and rollback instructions.
- [ ] **B4.4** Admin-only metrics with verified calculations on known data.

**Person A — your friend**

- [ ] **A4.1** Accessibility audit and fixes; report issues in B's screens to B.
- [ ] **A4.2** Mobile/performance polish and consistent loading, empty, error, and missing-page states.
- [ ] **A4.3** Usability test kit; run sessions, record findings, and prioritize fixes. _Kit drafted and merged in [PR #3](https://github.com/eloooong/rentify-app/pull/3) (`docs/usability-test.md`). Sessions not run yet, so leave unticked._

**WAIT:** Both pause feature additions during the final test round. Assign each finding to one person. Do not start live payments or a real rental pilot until the agreed security, payment, evidence, dispute, and recovery checks pass. Test-mode demos can continue.

## File ownership — who edits what

| Files/area                                                                                                                                  | Owner                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `app/layout.tsx`, `app/(marketing)`, `app/listings`, `app/owner`, `app/bookings`, `app/checkout`, `app/messages`, `app/reviews`, `app/help` | A, after scaffold handoff                                |
| `components/layout`, `components/ui`, listing/booking/checkout/chat/review components                                                       | A                                                        |
| `app/globals.css`, design tokens/theme, `lib/listings`, `lib/search`, `lib/utils`                                                           | A                                                        |
| `app/(auth)`, `app/admin`, `app/checklists`, `app/api`, auth route protection                                                               | B                                                        |
| Admin/checklist components; `lib/supabase`, `lib/bookings`, `lib/payments`, `lib/notifications`                                             | B                                                        |
| `supabase/`, migrations, seeds, storage/access policies, generated database types                                                           | B                                                        |
| `package.json`, lockfile, Next/ESLint/Prettier/Vitest/PostCSS configuration, `.github/`, `.env.example`                                     | B coordinates; one editor at a time                      |
| `README.md`, `docs/`                                                                                                                        | A; B coordinates setup/contract updates                  |
| `AGENTS.md`, `CLAUDE.md`, `DECISIONS.md`, this checklist                                                                                    | Shared; one editor at a time                             |
| Tests                                                                                                                                       | Feature owner; coordinate shared fixtures and test setup |

Theme styling belongs to A. Build-tool configuration belongs to B. If a change touches both, agree the exact files and one editor before starting. Ownership can be temporarily reassigned explicitly; the AI tool does not determine ownership.

## Stop immediately when these conflicts appear

| Trigger                                            | What to do                                                                                         | Safe work while waiting                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| You need a file owned by the other person          | Agree the specific edit or ask the owner to make it; record the handoff                            | Continue within your own task scope                             |
| Both need the same shared file                     | Pick one editor; merge that change first, then update the other branch                             | Work on separate components/tests                               |
| A dependency/configuration change is needed        | B coordinates a small PR before either tool installs or rewrites shared setup                      | Continue work using installed packages                          |
| A migration PR is already open                     | B finishes/merges it before starting another migration PR; never rewrite an applied migration      | A can build UI mocks; B can write tests/plan the next migration |
| The API/schema needs a breaking change             | Update the contract together, including A's mocks and callers                                      | Continue unrelated tasks                                        |
| A Git conflict contains the other person's work    | Stop resolving that file; read both changes together                                               | Work on a different non-conflicting file                        |
| A policy, secret, or account capability is missing | Mark the affected task blocked with the exact missing item; do not guess or weaken access controls | Continue independent tasks                                      |

## Every work session

1. Read this checklist and the open PRs. Announce your task and exact files before editing; this file does not send that announcement for you.
2. Start one short-lived task branch from updated `main`. Keep at most one active coding task per person. Save your work before updating branches.
3. Share contracts early. Keep mocks inside your own area and label them; remove/replace them when integrating the real implementation.
4. Format only your changed files when working in parallel. Avoid repository-wide formatting or unrelated refactors that touch the other person's files.
5. Run relevant checks, open a PR, and have the other person review. Merge passing work before another task changes the same shared files.
6. After merge, update your checkbox and attach the PR link. Before changing this shared checklist, coordinate who edits it; do not have both tools rewrite it at once.

**Handoff note to copy:** `Task: ... | Branch/PR: ... | Files: ... | Contract changed: ... | Checks: ... | Waiting for: ... | Safe next work: ...`
