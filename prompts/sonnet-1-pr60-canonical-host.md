# PR-60 — Canonical-host middleware. Sonnet 5 session. Lane 2. Opus review before merge.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-60", `docs/domains.md` §1,
`docs/deployment.md` §2 and §7 (cron), `src/lib/seo/site-url.ts`, `src/app/robots.ts`,
`src/app/api/cron/[job]/route.ts`, `src/app/admin/importaciones/actions.test.ts` (the
`x-forwarded-proto` case), and `prompts/_handoff.md`.

Branch: `claude/pr-60-canonical-host` off latest `main`.

## Build exactly this

- `src/middleware.ts`: compute the canonical host from `NEXT_PUBLIC_SITE_URL`. Request host =
  first value of `x-forwarded-host`, else `host`, lower-cased, port stripped. If it differs
  (including `www.`), `301` to `${canonicalOrigin}${pathname}${search}`. Exempt `/api/cron/*`
  and `/api/client-error`. If the env is unset or unparsable, pass through and log one warning
  per process.
- `matcher`: everything except `_next/static`, `_next/image`, `favicon.ico`. `/og/*` is **not**
  exempt.
- `robots.ts`: disallow-all when the request host is not canonical.
- `.env.example`: one line saying the variable now drives routing.
- `docs/deployment.md` §2 steps 6–7: mention the redirect; `docs/launch-runbook.md` already
  references it — check the wording matches what you built.

## Rules

- Pure functions for the host decision, unit-tested with `Request`-shaped inputs: canonical
  passes; `www.`, `*.hostingersite.com` and `universidad.com.py` redirect with path and query
  preserved; cron exempt; env unset passes; `https,http` in `x-forwarded-proto` never produces a
  malformed `Location`.
- No redirect loop is possible: prove it in a test (redirecting a canonical-host request must
  be unreachable).
- No new dependency. No change to auth, sessions or cookies.
- Run `npm run lint && npm test && npm run build` before opening the PR.

## Exit

Every "Accept" line of the PR-60 entry with its proof. Open the PR, do **not** merge; the
review session (`prompts/_review.md`) merges. Closing report per `_handoff.md`.
