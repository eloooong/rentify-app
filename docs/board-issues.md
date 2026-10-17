# Rentify GitHub Projects: Issue List

One issue per task in the implementation plan, ready to create. Title format: `<ID> <title>`. Labels: `phase-N`, `A` or `B`, and one of `feature` / `bug` / `chore`.

Board columns: **Backlog, Ready, In progress, In review, Done.** Keep at most 2 items in progress per person.

"Needs" lists what must be merged or decided first. Items marked **GAP** are not in the implementation plan; they come from the plan review and need agreement with Person B before they are created.

## Phase 0: Setup and Foundation

| ID      | Title                                                                                          | Owner         | Label   | Needs                    |
| ------- | ---------------------------------------------------------------------------------------------- | ------------- | ------- | ------------------------ |
| B0.1    | Scaffold and CI                                                                                | B             | chore   | (none)                   |
| B0.2    | AGENTS.md rules file                                                                           | B             | chore   | (none)                   |
| B0.3    | First schema migration                                                                         | B             | feature | B0.1                     |
| B0.4    | Supabase local setup and typed clients                                                         | B             | chore   | B0.1, B0.3               |
| A0.0    | Figma audit: mobile frames, breakpoints                                                        | A             | chore   | (none)                   |
| A0.1    | Theme from design tokens (Tailwind + shadcn/ui)                                                | A             | feature | B0.1, A0.0, token export |
| A0.2    | App shell (header, drawer, footer, layout)                                                     | A             | feature | A0.1                     |
| A0.3    | README and architecture doc                                                                    | A             | chore   | B0.1, B0.4               |
| A0.4    | CLAUDE.md pointing to AGENTS.md                                                                | A             | chore   | B0.2 merged              |
| Both    | Decide policy basics: deposit, cancellation, prohibited items, gateway (write to DECISIONS.md) | Both          | chore   | (none)                   |
| **GAP** | Decide damage and theft liability rule                                                         | Both          | chore   | (none)                   |
| **GAP** | Check the gateway supports deposit holds and how long they last                                | B (A reviews) | chore   | gateway chosen           |
| **GAP** | Early `chore/deps` PR: zod, date picker, image compression, shadcn deps                        | B             | chore   | B0.1                     |
| **GAP** | Resolve Tailwind config ownership (folder table says A, shared-files table says B)             | Both          | chore   | B0.1                     |

## Phase 1: Accounts and Listings

| ID      | Title                                                   | Owner | Label   | Needs                           |
| ------- | ------------------------------------------------------- | ----- | ------- | ------------------------------- |
| B1.1    | Authentication                                          | B     | feature | B0.4                            |
| B1.2    | Profiles and RLS                                        | B     | feature | B1.1                            |
| B1.3    | Categories, listings, and storage policies              | B     | feature | B0.3                            |
| B1.4    | Seed data and types                                     | B     | chore   | B1.3                            |
| A1.1    | Listing create and edit form                            | A     | feature | B1.3, B1.1, deps PR             |
| A1.2    | My listings page                                        | A     | feature | A1.1                            |
| A1.3    | Browse and search                                       | A     | feature | B1.3, B1.4, FTS migration (GAP) |
| A1.4    | Listing detail page                                     | A     | feature | B1.3, B1.4                      |
| **GAP** | Full-text search migration (tsvector, index, function)  | B     | feature | B1.3                            |
| **GAP** | Availability-date filter in browse (reference MVP)      | A     | feature | Phase 2 availability data       |
| **GAP** | Phone verification (reference MVP says email and phone) | B     | feature | B1.1                            |

## Phase 2: Booking and Payments

| ID      | Title                                                                      | Owner | Label   | Needs                                          |
| ------- | -------------------------------------------------------------------------- | ----- | ------- | ---------------------------------------------- |
| B2.1    | Bookings table and overlap protection                                      | B     | feature | B1.3                                           |
| B2.2    | State machine and booking API                                              | B     | feature | B2.1                                           |
| B2.3    | Payments and webhooks                                                      | B     | feature | B2.2, gateway chosen                           |
| B2.4    | Cancellation and refund rules                                              | B     | feature | B2.3, DECISIONS.md cancellation rules          |
| A2.1    | Availability calendar and booking request                                  | A     | feature | B2.2 (or mocks)                                |
| A2.2    | Booking dashboards                                                         | A     | feature | B2.2 (or mocks)                                |
| A2.3    | Checkout page                                                              | A     | feature | B2.3 (or mock), checkout response shape agreed |
| A2.4    | Transaction history                                                        | A     | feature | B2.3, payments RLS (GAP)                       |
| **GAP** | Agree date semantics: `to` inclusive or exclusive, time zone (Asia/Manila) | Both  | chore   | before A2.1 and B2.1                           |
| **GAP** | Define POST /api/payments/checkout response shape and error types          | B     | chore   | before A2.3                                    |
| **GAP** | RLS policy for payments (users read own rows)                              | B     | feature | B2.3                                           |

## Phase 3: Trust and Communication

| ID      | Title                                                                                                  | Owner | Label   | Needs                             |
| ------- | ------------------------------------------------------------------------------------------------------ | ----- | ------- | --------------------------------- |
| B3.1    | Notification backend and email                                                                         | B     | feature | B2.2                              |
| B3.2    | Handover and return checklists                                                                         | B     | feature | B2.2                              |
| B3.3    | Completion and deposit release                                                                         | B     | feature | B3.2, B2.3                        |
| B3.4    | Reports, feedback, and admin console                                                                   | B     | feature | B1.2                              |
| A3.1    | Booking-linked chat                                                                                    | A     | feature | messages RLS (GAP)                |
| A3.2    | Notification center                                                                                    | A     | feature | B3.1, notifications RLS (GAP)     |
| A3.3    | Two-sided reviews                                                                                      | A     | feature | B3.3, reviews RLS (GAP)           |
| A3.4    | Help center and legal pages                                                                            | A     | feature | B3.4 (feedback endpoint, or mock) |
| **GAP** | RLS for messages, conversations, reviews, notifications; enable Realtime on messages and notifications | B     | feature | before A3.1, A3.2, A3.3           |
| **GAP** | Create the conversation for a booking (trigger or on accept)                                           | B     | feature | B2.2                              |
| **GAP** | Review rules and rating averages (unique per booking per author, aggregate view)                       | B     | feature | B3.3                              |
| **GAP** | Public profile page route (owner card and reviews link to it)                                          | A     | feature | B1.2                              |
| **GAP** | Dispute resolution path for admins (release or deduct deposit)                                         | B     | feature | B3.4                              |

## Phase 4: Polish, Testing, Deployment, and Pilot

| ID      | Title                                                                  | Owner | Label   | Needs                                    |
| ------- | ---------------------------------------------------------------------- | ----- | ------- | ---------------------------------------- |
| A4.1    | Accessibility audit and fixes                                          | A     | feature | Phase 3 done, seed and auth test helpers |
| A4.2    | Mobile polish and performance                                          | A     | chore   | Phase 3 done                             |
| A4.3    | Usability test kit (draft in `docs/usability-test.md`)                 | A     | chore   | (none)                                   |
| A4.4    | Run usability tests with about 5 users                                 | A     | chore   | A4.3, working pilot build                |
| B4.1    | Security review                                                        | B     | chore   | Phase 3 done                             |
| B4.2    | End-to-end tests                                                       | B     | chore   | Phase 3 done                             |
| B4.3    | Production setup                                                       | B     | chore   | (none)                                   |
| B4.4    | Pilot metrics views                                                    | B     | feature | Phase 3 done                             |
| Both    | Fix test findings, pilot with a small group, record baseline metrics   | Both  | chore   | all above                                |
| **GAP** | Rate limiting on auth, chat, report endpoints (build, not only review) | B     | feature | B4.1                                     |
| **GAP** | Privacy review for the Philippines launch (Data Privacy Act)           | Both  | chore   | before pilot                             |
| **GAP** | Recruit pilot owners and first listings (cold start)                   | Both  | chore   | before pilot                             |

## Counts

- Plan prompts: 19 for A, 20 for B. This list adds two A items from the plan's task list (A0.0 Figma audit, A4.4 run the tests).
- GAP items: 18. Review them with Person B before creating them.
