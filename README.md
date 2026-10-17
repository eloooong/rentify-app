# Rentify

**Start here: [Shared checklist for Person A and Person B](PROJECT-CHECKLIST.md)** — current tasks, ownership, and where to stop/wait to avoid conflicts.

A peer-to-peer gadget rental marketplace for owners and renters. The first release targets a responsive web app, using Next.js App Router, TypeScript, Tailwind CSS, and Supabase.

## Current milestone

B0.1: local application scaffold and CI configuration. Authentication, Supabase integration, listings, bookings, and payments are not implemented yet. The home page is a temporary placeholder for Person A to replace using Figma. shadcn/ui and design tokens belong to Person A's next foundation task.

## Local setup

Install Node.js 24 with npm. From the project root:

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The scaffold works without credentials. Before integrating Supabase, copy `.env.example` to `.env.local` and replace its placeholders with your development project's values. Never commit local credentials. No payment provider has been selected.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

`typecheck` first generates Next.js route types, so it works on a fresh checkout. Vitest is configured for TypeScript tests and the `@/` import alias. There are currently no tests: the test command explicitly allows an empty suite at this scaffold stage. Add meaningful tests alongside authentication, authorization, booking, and payment behavior; remove `--passWithNoTests` when the first suite lands. `npm run test:watch` starts watch mode.

`npm run format` formats source and configuration files. `npm run start` serves a completed production build. CI runs the same five checks on pull requests to `main` and pushes to `main`; it requires no project secrets. A passing local build does not establish that GitHub CI or deployment has run.

## Dependency notes

As of 17 October 2026, `npm audit --omit=dev` reports zero vulnerabilities for this lockfile. The full audit reports five high-severity entries from one unpatched [`braces` advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), through the Next.js ESLint toolchain. That chain is development-only in this scaffold. Track an upstream fix; `npm audit fix --force` currently proposes downgrading the Next.js lint configuration and is not an appropriate automatic fix.

Next.js [documents support for ESLint 10](https://nextjs.org/docs/app/api-reference/config/eslint#setup-eslint), while noting that some included plugins still declare older peer ranges. npm may report peer-dependency warnings. The project uses normal dependency resolution without disabling peer checks.

## Team handoff

- Person A uses Claude Code and owns the frontend: Figma audit, design tokens, shared UI, marketing pages, listings/search, booking/checkout screens, chat, reviews, and help pages.
- Person B uses Codex and owns infrastructure, database migrations and access policies, auth/profile screens, booking/payment logic, APIs, notifications, checklists, admin tools, and release checks.
- Person A can start the Figma audit and token export while B sets up the backend. Listing integration depends on B publishing its schema and policies. Agree API contracts before connecting booking and checkout screens.
- During this initial scaffold, B creates `app/layout.tsx`, `app/globals.css`, and the placeholder home page. Person A takes ownership of those files for the app shell/theme afterward.
- Use short-lived task branches and small PRs. Review each other's work. Coordinate changes to dependencies, configuration, database contracts, and shared files.

## Structure

```text
app/                  Next.js routes and root layout
  (marketing)/        Temporary home page; Person A owns the future site UI
.github/workflows/    CI; Person B
vitest.config.ts      Unit-test configuration; Person B
.env.example          Placeholder configuration; Person B
```

The reference and implementation PDFs remain unchanged in the local project root and are not included in the scaffold PR. `tmp/`, build output, dependencies, and local environment files are ignored by Git. The repository is [eloooong/rentify-app](https://github.com/eloooong/rentify-app); this scaffold is prepared on `chore/scaffold-ci` for PR review. Branch protection, Vercel previews, and Supabase setup are pending; the scaffold does not configure those services.
