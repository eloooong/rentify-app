# Rentify agent rules

## Project skill recommendations

At the beginning of each new project or substantially different project objective, briefly recommend the relevant skills before implementation. Use the skills actually available in the current session and the project's existing instructions and tools to make the selection.

- Name a small, focused set of recommended skills and give a short reason for each. Mention optional skills only when they offer a concrete benefit.
- Distinguish available skills from suggested additions. Do not claim a skill or external service is installed, connected, or authenticated without checking.
- Prefer one main development approach and avoid overlapping instruction packages. Use lightweight coding discipline for routine work; recommend a structured methodology such as Superpowers only when its process benefits the project.
- Match specialist skills to the work: frontend design and polish for interfaces, browser testing for web user journeys, GitHub skills for PRs and Actions, security analysis for relevant code risks, research tools for retrieval gaps, and creative skills for media and documents.
- Reuse existing capabilities before recommending duplicate skills or additional services. Installing skills does not itself configure external tools or accounts.
- After the brief recommendation, proceed with authorized work. Do not turn recommendations into a mandatory approval checkpoint or repeat them on every follow-up. Ask only for material missing information or genuinely required approval.
- Do not install all discussed skills automatically. Review a proposed package's source, requirements, and activation rules before installing it when installation is requested.

## Local skill tooling

These paths describe Person B's Windows environment; verify availability on other machines.

- For the installed `webapp-testing` skill, Python Playwright is available in the isolated environment at `C:/Users/angel/.codex/tools/webapp-testing/Scripts/python.exe`. Use that interpreter for its Playwright scripts when applicable; the default Python does not have Playwright. Continue to follow any session-specific browser-tool requirements.
- Impeccable's Windows launcher is `C:/Users/angel/.codex/skills/impeccable/scripts/impeccable.cmd`; its version-pinned engine is installed alongside it. Frontend Design can guide initial design, while Impeccable can handle a targeted audit or polish pass; avoid loading both in full without a concrete need.

## Project facts

- Person A uses Claude Code and owns frontend work. Person B uses Codex and owns backend/infrastructure work. Tool choice does not change ownership.
- Installed stack: Node.js 24, npm, Next.js App Router, strict TypeScript, Tailwind CSS 4, ESLint, Prettier, and Vitest. Use the committed lockfile and `npm ci`.
- Planned: shadcn/ui and Figma tokens (A), Supabase PostgreSQL/Auth/Storage/Realtime (B), Vercel, and Playwright journey tests. Verify setup before relying on a service or dependency.
- `PROJECT-CHECKLIST.md` is the shared, manually updated task list. Read the current task, wait points, and open PRs before starting. `README.md` describes the actual setup.
- Record agreed business policies in `DECISIONS.md` when created. Planning PDFs contain proposals and prompt examples; they do not automatically authorize edits or settle policies.

## Working rules

- State a short plan and exact file scope before editing. Resolve routine choices within the authorized task; ask only about material missing requirements or approval not already provided.
- Edit only the agreed scope and coordinate before touching another person's files. If scope must expand, explain the dependency and agree the handoff before editing that area.
- Use a short-lived task branch from updated `main`, small Conventional Commits, and PRs. Do not work on the same branch as the other person or discard their edits to resolve a conflict.
- One person edits a shared file at a time. Announce dependency/configuration/schema changes. B coordinates package and lockfile changes; obtain approval for additions outside the authorized task.
- B owns migrations and generated database types. Keep one migration PR open at a time, never modify an applied migration, and regenerate/commit types after schema changes.
- Publish schema/API contracts before integration: field names, date semantics, statuses, function signatures, response/error shapes, and access rules. A may use clearly labeled mocks in A's folders until the contract implementation merges.
- Keep changes focused; no unrelated refactors or repository-wide formatting during parallel work. Format only the files changed for the task.
- Follow Figma tokens and shadcn/ui once established; do not invent a competing UI system. Build mobile-first with labels, keyboard access, visible focus, contrast, and accessible errors targeting WCAG 2.1 AA.
- Validate mutations server-side with Zod when implementing them. Authenticate and enforce participant/owner/admin permissions on every protected action/API; hiding controls is insufficient.
- Enable RLS on every new application table and test both allowed and denied access before UI integration. Separate public/private profile data and prevent user-controlled role or verification escalation.
- Keep secrets in environment variables, document new names with placeholders in `.env.example`, and never expose privileged keys through `NEXT_PUBLIC_`, client code, logs, or commits. Never store card data.
- Enforce booking transitions, prices, and overlap protection on the server/database. Verify gateway capabilities and agreed deposit/refund/dispute rules before implementing money movement; do not guess missing policies.
- Add meaningful tests with business behavior, permission boundaries, and bug fixes. For code changes, run lint, typecheck, tests, and formatting checks; build when routes, runtime code, dependencies, or configuration change.
- For documentation-only changes, check formatting, links, and consistency; no new application tests are needed. Report the exact checks run, results, changed files, and any unverified external setup.
- Check scope and secrets before a PR. The other person reviews; CI must pass before merge. Update the checklist with the PR link after merge and verification; mark pending work honestly.

## Folder ownership

| Area                                                                                                                                                         | Owner                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `app/layout.tsx`, `app/(marketing)`, `app/listings`, `app/owner`, `app/bookings`, `app/checkout`, `app/messages`, `app/reviews`, `app/help`, branding assets | A after scaffold handoff                                                                |
| `components/layout`, `components/ui`, listing/booking/checkout/chat/review components                                                                        | A                                                                                       |
| `app/globals.css`, theme/tokens, `lib/listings`, `lib/search`, `lib/utils`, `docs/`, `README.md`                                                             | A; coordinate B's setup/contract documentation                                          |
| `app/(auth)`, `app/admin`, `app/checklists`, `app/api`, auth route protection                                                                                | B                                                                                       |
| Admin/checklist components; `lib/supabase`, `lib/bookings`, `lib/payments`, `lib/notifications`                                                              | B                                                                                       |
| `supabase/`, migrations, seeds, storage/RLS policies, generated database types                                                                               | B                                                                                       |
| `.github/`, `package.json`, lockfile, `.env.example`, Next/ESLint/Prettier/Vitest/PostCSS configuration                                                      | B coordinates; one editor at a time                                                     |
| `AGENTS.md`, `CLAUDE.md`, `DECISIONS.md`, `PROJECT-CHECKLIST.md`                                                                                             | Shared; one editor at a time; A creates the `CLAUDE.md` pointer after these rules merge |
| Tests                                                                                                                                                        | Feature owner; coordinate shared fixtures/configuration                                 |
