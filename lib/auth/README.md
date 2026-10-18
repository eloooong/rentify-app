# B1.1 auth contract and verification

This branch implements email/password auth with server actions, Supabase SSR, and Next.js 16's `proxy.ts`. It does not create profile rows, change the schema, or grant listing/storage permissions. B1.2/B1.3 remain separate handoffs.

| Route                  | Contract                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `/login?next=/account` | Sign in; `next` accepts local protected paths only, defaulting to `/account`.                   |
| `/signup`              | Email/password signup; verify the email before sign-in.                                         |
| `/verify-email`        | Resend signup verification with a generic account-status response.                              |
| `/forgot-password`     | Request recovery with a generic account-status response.                                        |
| `/update-password`     | Verified session required; matching new passwords, followed by global refresh-session sign-out. |
| `/account`             | Verified email, password-change link, and sign-out. No profile table reads.                     |
| `/auth/confirm`        | One-time `token_hash`, restricted to `email` or `recovery`.                                     |
| `/auth/callback`       | PKCE `code` exchange and safe local return path.                                                |
| `/auth/error`          | Expired/replayed/invalid link recovery choices.                                                 |

## Handoff to Person A

The existing `/login` header link now has a destination. A owns signed-in navigation changes. For server-rendered identity, create a request-scoped client with `await createClient()` from `@/lib/supabase/server`, then call `auth.getUser()`. Never authorize using `getSession()`, cookie JSON, or user-controlled metadata.

Actions in `app/(auth)/actions.ts`: `signIn`, `signUp`, `requestPasswordReset`, `resendVerification`, `updatePassword`, and `signOut`. Use React `useActionState`. Results are `{ status: 'idle' | 'error' | 'success', message?, errors? }`, or redirects after sign-in/password change/sign-out. Field errors are arrays under `email`, `password`, or `confirmPassword`. No passwords or raw provider errors are returned. The existing `AuthForm` in `app/(auth)/_components/auth-form.tsx` can be reused, including `mode="logout"`.

Protected page roots: `/account`, `/update-password`, `/owner`, `/bookings`, `/checkout`, `/messages`, `/admin`, `/checklists`; matching uses whole segments. Future actions/APIs must **also** authenticate and enforce feature permissions server-side. The proxy does not replace RLS/ownership checks. Administration returns 403 until a trusted role lookup and admin permissions exist; metadata cannot grant access. A's header/listing files are unchanged.

## Sessions and limits

- Proxy verifies with `getUser()` and refreshes both request and response cookies. Invalid/unverified sessions redirect to login. Provider outages fail closed with 503 on protected pages.
- Auth/session responses are private/no-store. Callback redirects retain SDK cookies/cache headers and strip codes/hashes from the destination URL. SameSite=Lax; Secure cookies when the canonical app origin is HTTPS. Session cookies remain readable by Supabase's browser SDK.
- Server Components use read-only `server.ts`; Server Actions use `createActionClient()` from `action.ts`, whose write failures propagate; route handlers use `createRouteClient()` from `route.ts`.
- Logout ends this browser's refresh session. Password changes request global refresh-session sign-out. Copied Supabase access JWTs may remain valid until expiry; this does not promise immediate access-token revocation. Future sensitive rental/payment operations need their own authorization and agreed step-up checks.
- New passwords: 8–128 characters, never trimmed. Login also accepts shorter legacy passwords. The local Auth minimum is 8. Provider rate limits remain enforced; failures show retry feedback. Hosted SMTP, CAPTCHA/MFA and deployment abuse controls are separate setup work.

## Local setup

Use `http://localhost:3000` consistently. `NEXT_PUBLIC_APP_URL` must match Supabase's Site URL. No privileged key is added to app code or `.env.example`. Stop/start once after pulling the email configuration; data is retained (do not reset data you want to keep):

```sh
npm ci
npm run db:stop
npm run db:start
npm run dev
```

Mail stays in [local Mailpit](http://127.0.0.1:54324). Templates live in `supabase/templates/`. The sandbox limit is 30 emails/hour. Credential-link routes are excluded from Next development request logs; never log passwords, codes, or hashes.

Hosted projects must separately configure the canonical HTTPS Site URL, allowlisted `/auth/callback` and `/auth/callback?next=/update-password` URLs, both email templates, required email confirmation, password minimum, SMTP, and abuse controls. Local TOML does not configure hosted projects. Preview environments need their own origin/allowlist. Hosted delivery/deployment remain unverified.

## Checks

Unit tests cover input/redirect validation, generic provider failures, verified identity, outages, forged cookies, cookie forwarding/write failures, cache headers, OTP/PKCE errors, and premature admin access. Existing SQL policies/types remain unchanged.

The real browser journey creates two random local `@example.test` users and removes only those Auth fixtures. It tests signup, denied unverified login, email confirmation/replay, real refresh-token rotation, two-user isolation, 375px layout, forged cookie/admin denial, recovery in another browser, mismatch/old/new password behavior, and logout. Its local admin key stays only in the Python process for cleanup, never logs/files/browser code. Mailpit retains fixture emails after their accounts are removed. Non-local app/API/inbox hosts are rejected.

```sh
C:/Users/angel/.codex/tools/webapp-testing/Scripts/python.exe tests/e2e/auth.py --browser-channel msedge
```

Other machines: create an isolated Python environment, install `playwright==1.64.0` and its Chromium browser, then run `python tests/e2e/auth.py` against the running local app/stack. Database CI runs this same journey against a production build and disposable Supabase/Mailpit, alongside 63 SQL checks and type drift verification.

References: [SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [local email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).
