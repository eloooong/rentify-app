# Rentify team checklist

**Person A: your friend, using Claude Code. Person B: you, using Codex.**

Keep this file open while working. It is the shared progress checklist, updated by the person finishing each task. It does not update automatically.

**Latest check: 18 October 2026 (Asia/Manila).** B1.1–B1.4 are merged. Demo tooling [PR #23](https://github.com/eloooong/rentify-app/pull/23) passed both CI workflows and local verification: five demo-tooling tests, 83 unit tests on its original base, 142 SQL checks, build, type regeneration without drift, and browser auth/profile/catalog/demo journeys. The local checkout now includes Person A's merged [header/browse PR #22](https://github.com/eloooong/rentify-app/pull/22) and [detail PR #24](https://github.com/eloooong/rentify-app/pull/24); the combined production build and 103 unit tests passed. Real Supabase browse/detail/image/filter/draft checks passed at desktop/mobile sizes. One A1.3 issue remains: `?page=99` shows a load error instead of the past-last-result state (real PostgREST returns HTTP 416 / `PGRST103`).

**Newly merged:**

- [PR #12 — Person A checklist update](https://github.com/eloooong/rentify-app/pull/12): A0.2 is complete based on A's recorded mobile/desktop accessibility, keyboard, and 375px layout checks. B0.3/B0.4 completion statuses are preserved.
- [PR #14 — shadcn/ui](https://github.com/eloooong/rentify-app/pull/14): component setup, token mapping, and the `/ui-kit` reference page are on `main`; app and database CI passed. Approved Figma values and mobile design references are still pending, so A0.1 remains partly complete.

Both people should pull updated `main` and run `npm ci` before the next coding task. Continue with separate branches. B1.4's package/configuration reservation is released; it added no dependencies or schema changes. B's completion handoff changes only this checklist; coordinate before editing shared files.

## Next session — who works and who waits

- [x] **Person B — B1.4 complete.** [PR #23](https://github.com/eloooong/rentify-app/pull/23) merged with both CI workflows passing. Local seed, repeat and confirmed scoped reset passed; demo accounts/listings/photos are available on B's machine. [Commands and handoff](supabase/DEMO-DATA.md). The local app is rebuilt with A's merged browse/detail screens.
- [ ] **Person A — next:** fix A1.3's real-provider out-of-range pagination handling in `lib/search/browse.ts`, then continue A1.1 create/edit/upload and A1.2 owner management against the merged [catalog APIs](lib/catalog/README.md). Header/browse/detail implementations have merged. Real Figma values/mobile frames remain a separate design follow-up.
- **WAIT points:** A can use the real APIs and merged demo tooling now; seed each developer's own local stack. B owns backend/storage policies; A owns listing screens and `lib/listings`. Only one person edits this checklist or shared configuration at a time. B's next phase is B2.1/B2.2; settle the pending date/billing/booking policies in `DECISIONS.md` before integrating bookings. Payment work still waits for gateway/deposit/refund decisions.

## Where we are now

| Item                                                             | Status                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B0.1 app scaffold and CI                                         | Complete; PR #1 merged and scaffold checks passed                                                                                                                                                                                                                                             |
| [Scaffold PR #1](https://github.com/eloooong/rentify-app/pull/1) | Merged on 17 October 2026                                                                                                                                                                                                                                                                     |
| B0.2 shared agent rules                                          | Complete; [PR #2](https://github.com/eloooong/rentify-app/pull/2) merged                                                                                                                                                                                                                      |
| B0.3 schema foundation                                           | Complete; [PR #4](https://github.com/eloooong/rentify-app/pull/4) merged; schema contract and generated types published                                                                                                                                                                       |
| Supabase local runtime and application clients                   | B0.4 complete; [PR #9](https://github.com/eloooong/rentify-app/pull/9) merged. Windows setup, reset, 63 SQL checks, real API/Server Component queries, and type verification passed on 18 October 2026                                                                                        |
| Person A status                                                  | Pointer (#5), draft tokens (#6), draft FAQ/legal text (#7), draft theme/app shell (#10), shell verification (#12), shadcn/UI kit (#14), shadcn devDependency fix (#16), and README/architecture docs (#17) merged. Figma values, `brand-strong` approval and mobile designs remain incomplete |
| Person A can do now                                              | Fix A1.3 out-of-range pagination, then build A1.1/A1.2 editor/upload/owner management; browse/header/detail implementations have merged                                                                                                                                                       |
| Person B can do now                                              | B1.4 merged and verified. Prepare B2.1/B2.2 after agreeing pending date/billing/booking policies; coordinate shared files and migrations                                                                                                                                                      |
| Next coding handoff                                              | A uses merged real APIs/demo data for editor/management; B publishes booking rules/contracts before booking integration                                                                                                                                                                       |

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
- [ ] **A0.1** Map approved tokens into CSS/Tailwind and initialize shadcn/ui. _Draft CSS tokens merged in [PR #10](https://github.com/eloooong/rentify-app/pull/10); shadcn components, token mapping, and `/ui-kit` merged in [PR #14](https://github.com/eloooong/rentify-app/pull/14). Real Figma values/approval remain pending; leave the full task unticked. Run `npm ci` after pulling these dependency changes, and coordinate future package/configuration edits with B._
- [x] **A0.2** Build the responsive app shell: header, footer, layout, navigation, and skip link. Shell merged in [PR #10](https://github.com/eloooong/rentify-app/pull/10). _A verified it on the `main` production build: Lighthouse 13.5 accessibility 100 on mobile and desktop, keyboard order checked, header collapses at 375px with no horizontal scroll. Limits: no mobile Figma frames, so the mobile header is an adaptation; nav links to routes not built yet return 404 (Best Practices 96 for that reason only)._
- [x] **A0.3** Expand the starter README and architecture documentation using the actual project. README rewrite and `docs/architecture.md` merged in [PR #17](https://github.com/eloooong/rentify-app/pull/17); links, script names and the Mermaid diagram were checked. The README's production-audit note relies on [PR #16](https://github.com/eloooong/rentify-app/pull/16) (shadcn moved to devDependencies), also merged.
- [x] **A0.4** `CLAUDE.md` pointer to `AGENTS.md` merged in [PR #5](https://github.com/eloooong/rentify-app/pull/5).

**Together:** review the proposed [booking rules in `DECISIONS.md`](DECISIONS.md): demo-first scope, PHP/Manila dates, inclusive rental days, request/payment expiry, reservation statuses, price snapshots and participant permissions. These are proposals, not agreed or implemented rules. Confirm the booking sections before B2.1/B2.2; gateway, deposit/refund/dispute and live-pilot decisions remain explicitly pending.

**WAIT:** Foundation B0.1–B0.4 and B1.1–B1.4 are merged. Both start separate branches from updated `main`. A can connect real auth, profiles, listings and uploads, and run the merged local demo commands on A's machine. Read the [current Supabase contract](supabase/README.md). Coordinate shared files and keep at most one migration PR open.

## 1. Accounts and listings

**Person B — you**

- [x] **B1.1** Authentication: signup, email verification, login/logout, password reset, and protected routes. _[PR #19](https://github.com/eloooong/rentify-app/pull/19) merged; 51 unit tests, 63 SQL checks, real browser auth journeys, production build, and CI passed. [Contract and test instructions](lib/auth/README.md). Hosted email/redirect configuration remains a deployment task._
- [x] **B1.2** Profiles: profile creation/editing, public versus private fields, protected admin role, and access-policy tests. _[PR #20](https://github.com/eloooong/rentify-app/pull/20) merged with passing CI, 70 unit tests, 103 SQL checks and real browser journeys. [Contract](lib/profiles/README.md). Hosted migrations remain a deployment task._
- [x] **B1.3** Categories, listings, photo records, storage policies, and category templates. _[PR #21](https://github.com/eloooong/rentify-app/pull/21) merged with passing CI; 83 unit tests, 142 SQL checks and real image/catalog browser journeys passed locally. [API/storage contract](lib/catalog/README.md). Person A can integrate now._
- [x] **B1.4** Demo users/listings, reproducible seed/reset commands, and regenerated database types. _[PR #23](https://github.com/eloooong/rentify-app/pull/23) merged with both CI workflows passing. Five demo-tooling tests, 83 unit tests on its original base, 142 SQL checks and real browser journeys passed. Types regenerated without drift; no schema changes. Seed/repeat/scoped reset verified locally; [guide](supabase/DEMO-DATA.md). Combined merged app subsequently passed build and 103 unit tests._

**Person A — your friend**

- [ ] **A1.1** Listing create/edit form, category fields, and photo upload.
- [ ] **A1.2** My listings page, publish/pause actions, and delete confirmation.
- [ ] **A1.3** Browse/search, combined filters, sorting, pagination, and URL state. _[PR #22](https://github.com/eloooong/rentify-app/pull/22) merged. Real Supabase checks passed for cards/images, combined filters and invalid/empty states. Keep unchecked: with four real demo listings, `/listings?page=99` shows the load-failure state because PostgREST's range request returns HTTP 416 / `PGRST103`; `lib/search/browse.ts` throws instead of returning the intended past-last-result state. A owns this fix; B did not edit A's query module._
- [x] **A1.4** Listing details: photos, specs, price/deposit, owner information, and unavailable-listing handling. _[PR #24](https://github.com/eloooong/rentify-app/pull/24) merged with passing CI and A's recorded gallery/metadata/mobile checks against a mock. B subsequently verified the combined production build against real Supabase demo data at 1280px/375px: published detail/photos/owner, metadata, disabled booking and true HTTP 404 for draft/missing/invalid IDs. Real demo fixtures contain one photo each; A's multi-photo interaction checks used its mock._

**WAIT:** B1.3/B1.4 are merged and their contracts, policies, types and demo commands are available. A reports missing fields/policies to B instead of editing migrations. A continues its pagination fix and listing editor/management work while B prepares the booking phase after the pending policies are agreed. Each developer seeds their own local database.

## 2. Bookings and payments

**Person B — you**

- [ ] **B2.1** Booking schema, self-booking prevention, and database overlap protection tested with concurrent requests. _Proposed reservation/date rules and acceptance examples are in [DECISIONS.md](DECISIONS.md); confirm them before implementation. No booking migration or API added by the policy draft._
- [ ] **B2.2** State transitions, permissions, server-side prices, availability endpoint, booking actions, expiry job, and tests. _Use the proposed expiry, price-snapshot and access rules only after agreement; payment/checklist/settlement transitions stay gated by their implementation dependencies._
- [ ] **B2.3** Gateway test-mode adapter, checkout endpoint, signed/idempotent webhooks, and payment records.
- [ ] **B2.4** Cancellation and refund rules from `DECISIONS.md`, with tests for each case.

**Person A — your friend**

- [ ] **A2.1** Availability calendar, date selection, price summary, and request UI.
- [ ] **A2.2** Renting/hosting dashboards with allowed actions for each status.
- [ ] **A2.3** Checkout UI with processing, success, failure/retry, and cancellation states.
- [ ] **A2.4** Transaction history with type/date filters.

**WAIT:** Before integration, B publishes the booking statuses, date semantics, server-action signatures, error shapes, availability response, and checkout response. A can mock those exact contracts until the real implementation merges. Both stop gateway-dependent payment work until the gateway capability and deposit/refund policies are settled. Other work can continue.

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
- [ ] **A3.4** Help center, feedback form, and draft legal/prohibited-items pages. _Content drafts in `docs/faq-draft.md` and `docs/legal-draft.md` merged in [PR #7](https://github.com/eloooong/rentify-app/pull/7). Policies not yet decided are marked TBD. No pages built._

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
