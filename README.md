# Rentify

**Start here: [Shared checklist for Person A and Person B](PROJECT-CHECKLIST.md)** — current tasks, ownership, and where to stop/wait to avoid conflicts.

Rentify is a peer-to-peer gadget rental marketplace. Owners list devices they rarely use, and renters book them for a few days. The first release is a responsive web app (mobile web first), built with Next.js App Router, TypeScript, Tailwind CSS 4, shadcn/ui and Supabase. See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## What exists today

| Area            | State                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell       | Responsive header with search, mobile menu, footer and skip link. Placeholder home page.                                                                                                       |
| Design system   | Draft tokens in `app/globals.css` (sampled from screenshots, not exported from Figma) and shadcn/ui base components. Temporary component preview at `/ui-kit`.                                 |
| Database        | Supabase schema for 14 tables with RLS on every table. Clients can read `categories` only; everything else is denied until feature policies land. Typed clients in `lib/supabase`.             |
| Not built yet   | Authentication, listings, search, bookings, payments, chat, notifications, checklists, reviews, help pages and admin. Nav and footer links to those routes return 404 until their phase lands. |
| Not decided yet | Payment gateway, deposit, cancellation and liability rules, booking date semantics. These belong in `DECISIONS.md`, which does not exist yet.                                                  |

For task-by-task status, use the [checklist](PROJECT-CHECKLIST.md). This table only summarizes it.

## Prerequisites

- **Node.js 24** with npm. The version is pinned in `.node-version` and `package.json` (`engines`).
- **For the local database only:** a running Docker-compatible engine. On Windows that means WSL 2 plus Docker Desktop. The Supabase CLI itself is installed by `npm ci`; no global install, Supabase login or cloud account is needed. Full steps are in [supabase/README.md](supabase/README.md).

## Local setup

### Front end only (no database)

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The app shell and `/ui-kit` work without any environment variables or accounts.

### With the local Supabase database

```sh
npm ci
npm run db:start
npm run db:env
npm run dev
```

`db:start` starts the local Supabase stack and applies migrations on first run. `db:env` writes the local public URL and key to `.env.local`. It refuses to overwrite an existing file and never prints credentials. Restart `npm run dev` after any environment change. Studio runs at <http://127.0.0.1:54323>.

## Environment variables

Copy names from [`.env.example`](.env.example). Never commit `.env.local`, and never put a secret in a `NEXT_PUBLIC_` variable.

| Variable                               | Used by                                            | Notes                                                                       |
| -------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `lib/supabase/env.ts` (browser and server clients) | Local value comes from `npm run db:env`.                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `lib/supabase/env.ts`                              | Public key only. A missing value fails when a client is used, not at build. |
| `NEXT_PUBLIC_APP_URL`                  | Written by `db:env`; not read by app code yet      | Reserved for absolute links (for example in emails).                        |

Server-only secrets (payment gateway, email service, service-role key) are not used yet. Add each one to `.env.example` with a placeholder in the same PR that introduces it.

## Scripts

| Script                 | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run dev`          | Start the Next.js dev server.                                             |
| `npm run build`        | Production build.                                                         |
| `npm run start`        | Serve a completed production build.                                       |
| `npm run lint`         | ESLint with zero warnings allowed.                                        |
| `npm run typecheck`    | Generate Next.js route types, then run `tsc --noEmit`.                    |
| `npm test`             | Run the Vitest unit tests once (`npm run test:watch` for watch mode).     |
| `npm run format`       | Format all files with Prettier.                                           |
| `npm run format:check` | Check formatting without writing.                                         |
| `npm run db:start`     | Start the local Supabase stack.                                           |
| `npm run db:stop`      | Stop the stack and keep local data.                                       |
| `npm run db:reset`     | **Discard local data** and reapply every migration (local only, no seed). |
| `npm run db:env`       | Write local public Supabase values to `.env.local`.                       |
| `npm run db:lint`      | Lint database functions in the `public` schema.                           |
| `npm run db:test`      | Run the pgTAP access and constraint tests.                                |
| `npm run db:smoke`     | Real HTTP and Server Component checks against the local API.              |
| `npm run db:types`     | Regenerate `lib/supabase/database.types.ts` from the migrated database.   |

## Checks and CI

Run these before opening a PR. CI runs the same five on every pull request to `main` and on every push to `main`:

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

A second workflow, **Database**, runs only when `supabase/**`, `lib/supabase/**`, `package.json`, the lockfile or its own config change. It rebuilds the database from migrations, then runs `db:lint`, `db:test` and `db:smoke`, and fails if the generated types differ from the committed file. Neither workflow needs project secrets. A passing local run does not prove that CI or a deployment has run.

## Folder map and owners

Ownership comes from [AGENTS.md](AGENTS.md); that file is the source of truth if the two ever differ.

```text
app/
  layout.tsx              Root layout, skip link, header, footer           A
  globals.css             Design tokens and shadcn theme mapping           A
  (marketing)/            Home page and the temporary /ui-kit preview      A
components/
  layout/                 Header, mobile menu, nav links, footer           A
  ui/                     shadcn/ui components                             A
lib/
  utils.ts                Class-name helper for shadcn                     A
  supabase/               Typed clients, env checks, generated DB types    B
supabase/                 Config, migrations, pgTAP tests, CLI scripts     B
docs/                     Design tokens, FAQ and legal drafts, test kit    A
.github/workflows/        CI and Database workflows                        B
package.json, lockfile,   Dependencies and tool configuration              B coordinates
  config files
AGENTS.md, CLAUDE.md,     Agent rules and shared status                    Shared, one editor at a time
  PROJECT-CHECKLIST.md
```

Planned route folders, not created yet: `app/listings`, `app/owner`, `app/bookings`, `app/checkout`, `app/messages`, `app/reviews` and `app/help` (A); `app/(auth)`, `app/admin`, `app/checklists` and `app/api` (B).

## Branch and PR workflow

1. Update `main` (`git pull` on `main`), then create a short-lived branch: `feat/…`, `fix/…`, `chore/…` or `docs/…`.
2. One task per branch and PR. Use [Conventional Commits](https://www.conventionalcommits.org/) such as `feat(layout): add mobile menu`.
3. Edit only your own folders. Agree first before touching the other person's files, `package.json`, configuration or shared docs.
4. Run the five checks, then open a PR against `main` with what changed, how to test, and screenshots at phone width for UI changes.
5. The other person reviews. CI must pass before merging.
6. After merging, update your row in the [checklist](PROJECT-CHECKLIST.md) with the PR link. Tick a task only when its acceptance checks pass.

Person A uses Claude Code (reads `CLAUDE.md`, which points to `AGENTS.md`). Person B uses Codex (reads `AGENTS.md`). Both follow the same rules.

## Dependency notes

- Dependencies are pinned to exact versions. New packages are added in a dedicated PR that Person B reviews.
- `npm audit` reports high-severity entries from one unpatched [`braces` advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), through tooling that matches file patterns (the Next.js ESLint chain and the shadcn CLI). Since the shadcn package was added (PR #14), the chain also shows up under `npm audit --omit=dev`, because `shadcn` is listed as a production dependency. The app only needs it at build time, for `shadcn/tailwind.css`. Do not run `npm audit fix --force`: it proposes a breaking downgrade.
- Next.js [supports ESLint 10](https://nextjs.org/docs/app/api-reference/config/eslint#setup-eslint), but some bundled plugins still declare older peer ranges, so npm may print peer-dependency warnings.

## More documentation

- [docs/architecture.md](docs/architecture.md): system overview and request flow.
- [supabase/README.md](supabase/README.md): database setup, schema contract, typed clients and migration rules.
- [AGENTS.md](AGENTS.md): rules for both AI tools and the folder ownership table.
- [docs/design-tokens.json](docs/design-tokens.json): draft tokens and their contrast checks.
- [docs/faq-draft.md](docs/faq-draft.md), [docs/legal-draft.md](docs/legal-draft.md): draft help and legal text.
- [docs/usability-test.md](docs/usability-test.md): usability test kit.

The planning PDFs (project reference and implementation plan) are kept outside this repository.
