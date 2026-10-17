# Rentify team checklist

**Person A: your friend, using Claude Code. Person B: you, using Codex.**

Keep this file open while working. It is the shared progress checklist, updated by the person finishing each task. It does not update automatically.

## Where we are now

| Item                                                             | Status                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B0.1 app scaffold and CI                                         | Built; local checks and the initial GitHub CI run passed                          |
| [Scaffold PR #1](https://github.com/eloooong/rentify-app/pull/1) | Draft; waiting for Person A's review and merge                                    |
| Shared agent rules, Supabase, application features               | Not implemented                                                                   |
| Person A can do now                                              | Audit Figma, identify missing mobile screens, prepare design tokens, review PR #1 |
| Person B can do now                                              | Prepare shared rules and policy decisions; address scaffold review feedback       |
| Next coding handoff                                              | Merge PR #1, then start separate task branches from the updated `main`            |

Check off a task after its acceptance checks pass and its PR is merged. Preparatory work can happen while a dependency is pending; do not mark a feature done just because it works against a mock.

## 0. Foundation — start here

**Person B — you**

- [ ] **B0.1** Finish Person A's review and merge PR #1. Scaffold implementation and initial CI are already done.
- [ ] **B0.2** Add `AGENTS.md`: task scope, folder ownership, security basics, checks, and shared-file coordination.
- [ ] **B0.3** Add the initial schema migration and schema diagram; share the tables and booking states with A. Initial tables are not a usable handoff until the required access policies exist.
- [ ] **B0.4** Set up Supabase local development, typed clients, generated database types, and verified setup instructions.
- [ ] Complete the remaining setup: agree development environments, configure branch protection, and connect Vercel previews.

**Person A — your friend**

- [ ] Audit Figma: mobile and desktop listing, booking, checkout, chat, and checklist screens; export tokens.
- [ ] **A0.1** Map approved tokens into CSS/Tailwind and initialize shadcn/ui. Coordinate dependency changes with B before installing.
- [ ] **A0.2** Build the responsive app shell: header, footer, layout, navigation, and skip link.
- [ ] **A0.3** Expand the starter README and architecture documentation using the actual project.
- [ ] **A0.4** Add a short `CLAUDE.md` pointing to the merged `AGENTS.md`.

**Together:** record decisions in `DECISIONS.md`: course demo or live pilot, currency, date boundaries, deposits, cancellation/refunds, verification, gateway, and minimum dispute handling. Label unresolved decisions as pending.

**WAIT:** Both wait for PR #1 to merge before starting new application branches. A waits for B0.2 before adding the `CLAUDE.md` pointer. Figma work and policy discussions can continue immediately.

## 1. Accounts and listings

**Person B — you**

- [ ] **B1.1** Authentication: signup, email verification, login/logout, password reset, and protected routes.
- [ ] **B1.2** Profiles: profile creation/editing, public versus private fields, protected admin role, and access-policy tests.
- [ ] **B1.3** Categories, listings, photo records, storage policies, and category templates. Publish this handoff early.
- [ ] **B1.4** Demo users/listings, reproducible seed/reset commands, and regenerated database types.

**Person A — your friend**

- [ ] **A1.1** Listing create/edit form, category fields, and photo upload.
- [ ] **A1.2** My listings page, publish/pause actions, and delete confirmation.
- [ ] **A1.3** Browse/search, combined filters, sorting, pagination, and URL state.
- [ ] **A1.4** Listing details: photos, specs, price/deposit, owner information, and unavailable-listing handling.

**WAIT:** A waits to connect real listings/uploads until B1.3 is merged and its tables, storage paths, policies, and types are published. A can build screens against agreed mock data meanwhile. A reports missing fields/policies to B instead of editing migrations. B can continue auth and seed work while A implements the listing screens.

## 2. Bookings and payments

**Person B — you**

- [ ] **B2.1** Booking schema, self-booking prevention, and database overlap protection tested with concurrent requests.
- [ ] **B2.2** State transitions, permissions, server-side prices, availability endpoint, booking actions, expiry job, and tests.
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
- [ ] **A3.4** Help center, feedback form, and draft legal/prohibited-items pages.

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
- [ ] **A4.3** Usability test kit; run sessions, record findings, and prioritize fixes.

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
