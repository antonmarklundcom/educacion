# Deployment — Hostinger managed Node.js + MySQL

Follows the `nextjs-deploy-hostinger` and `nodejs-mysql-hostinger-stack` playbooks. This file records only what is specific to educacion.com.py. **Do not re-derive the known gotchas — they are listed in §5 because they each cost real time before.**

## 1. Slot & account

- Uses **1 of 30** Hostinger Node.js slots. Record which account (LATAM / EU / USA) and the remaining count when provisioned.
- LATAM account preferred — the audience is entirely Paraguayan; latency and any regional routing behaviour favour it.
- This is a dynamic app (DB, search, admin, leads) so a slot is the correct choice. Static export is not an option.

## 2. Deploy flow

1. Work merges to `main`. Hostinger deploys `main` via the managed GitHub integration — **no SSH, no PM2, no Nginx config**.
2. hPanel → Websites → Add Website → Node.js Apps → Import Git Repository → select `antonmarklundcom/educacion`, branch `main`.
3. Verify auto-detected: framework Next.js, build `npm run build`, start `npm start`.
4. Add every env var from `.env.example` in hPanel. **Paste only the raw value into the Value field** — pasting `KEY=value` into Value is the `ERR_INVALID_URL` mistake.
5. Deploy, verify on the `*.hostingersite.com` URL first.
6. Map `educacion.com.py`. DNS is at NIC.py → create the A/CNAME record Hostinger specifies. SSL issues automatically once DNS resolves.
7. Update `NEXT_PUBLIC_SITE_URL` (and anything else absolute) to `https://educacion.com.py`, then **redeploy** — env var changes need a redeploy, a restart is not enough.

## 3. Database

- Hostinger's own MySQL (not Neon). Two different hosts matter:
  - **Live app** connects via `localhost` — this is what goes in the hPanel `DATABASE_URL`.
  - **Your machine** connects via the Remote MySQL host shown in hPanel (`srvXXXX.hstgr.io`, port 3306), after whitelisting your current public IP.
- Migrations and import/seed scripts run **from a local machine**, never from Hostinger SSH.
- `connectionLimit: 8` in the pool. Hostinger caps concurrent connections per user; a bigger pool buys nothing and fails loudly under load.
- `timezone: "Z"` — store UTC, render `America/Asuncion`.

## 3.1 The migration runbook (PowerShell, from a new window)

Every command below runs on **your machine**, not over SSH, for the reason
above. `drizzle-kit` loads `.env`; `tsx` does not (§5), so the environment
variable is set explicitly and the whole run happens in one window.

```powershell
# 1. The repo, on the branch that is deployed.
cd C:\ruta\a\educacion
git checkout main
git pull

# 2. Dependencies exactly as the lockfile has them.
npm ci

# 3. The connection string. Remote MySQL host from hPanel — NOT localhost,
#    which is only correct inside the app container. Quote it: the password
#    can contain characters PowerShell would otherwise eat.
$env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"

# 4. Look before you write. `check` reads the journal and reports what is
#    pending without touching a table.
npm run db:check

# 5. Apply. Drizzle runs only the files the journal says are missing, in order.
npm run db:migrate

# 6. The plan price list. Idempotent — matched on `code`, updated in place,
#    never duplicated. Safe to re-run any time prices change.
npm run seed:plans

# 7. Rebuild the search index, because 0004 changed what feeds `plan_rank`.
npm run search:rebuild
```

**If your public IP has rotated**, step 5 fails with
`Access denied for user '...'@'<ip>'` before writing anything — re-add the IP
under Remote MySQL in hPanel and run it again. `ECONNREFUSED` with correct
credentials means DNS: try the raw IP in the connection string (§5).

**What migrations 0004–0009 do**, so nothing here is a surprise:

| File   | Change                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| `0004` | **Drops `institutions.plan_id`** and its FK; adds `subscriptions.invoiced_amount_pyg` and an `ends_on` index |
| `0005` | `subscription_reminders`                                                                                     |
| `0006` | `posts` (editorial)                                                                                          |
| `0007` | `becas`                                                                                                      |
| `0008` | `job_postings`                                                                                               |
| `0009` | `password_reset_tokens`                                                                                      |

`0004` is the only destructive one. Dropping `plan_id` is the point of PR-25 —
it was a second source of truth for what an institution pays for, and
`subscriptions` is now the only one (`architecture.md` §17). Nothing in the
codebase reads the column, so the drop cannot orphan a query; what it can
orphan is a **hand-edited value nobody recorded as a subscription**. If any
institution was ever marked as paying by editing that column directly, read it
out before step 5 and re-enter it as a subscription afterwards:

```sql
-- hPanel → phpMyAdmin, before step 5. Empty result = nothing to carry over.
SELECT id, name_short, plan_id FROM institutions WHERE plan_id IS NOT NULL;
```

**After a migration that changes the schema, redeploy** — the running app was
built against the old types, and 0004 in particular removes a column its build
still knows about.

## 4. Uploads (institution logos & photos) — decide in PR-19

Hostinger's git deploy **replaces the application directory**. Anything written under the app dir is destroyed on the next deploy, silently.

- **Preferred:** Cloudflare R2 or Bunny Storage. CDN-fronted, survives deploys, keeps image bytes off the app server.
- **Alternative:** a persistent path outside the deploy dir (e.g. `~/uploads`) served through a route handler.
- **Never** `public/uploads`.

See `risks.md` §R-08.

## 5. Known gotchas (do not rediscover these)

- **`tsx` does not auto-load `.env`.** `drizzle-kit` does. So a migration can succeed and the seed script immediately fail with `ECONNREFUSED` because `DATABASE_URL` is undefined and mysql2 silently fell back to localhost. Fix: set it in the shell first.
  ```powershell
  $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
  npx tsx scripts/import-cones.ts
  ```
- **Remote MySQL IP whitelisting** — home ISPs rotate IPs. `Access denied for user '...'@'<ip>'` almost always means your IP changed; re-add it in hPanel.
- **If the hostname gives `ECONNREFUSED` with confirmed-correct credentials**, try the raw IP in `DATABASE_URL`. DNS/IPv6 flakiness on Hostinger is a recurring theme.
- **Use `127.0.0.1`, not `localhost`, in the deployed `DATABASE_URL`.** On the app container `localhost` can resolve to `::1` first; MySQL listens on IPv4 only, so mysql2 opens a TCP connection to the wrong address and every DB-backed page throws while static pages render fine. The URI form cannot express a socket path and `POOL_CONFIG` sets none, so the literal IPv4 address is the fix, not a workaround — keep it. Symptom: `/legal/privacidad` renders, `/carreras` shows the error boundary, and the runtime log has a drizzle `Failed query:` with the underlying cause truncated.
- **hPanel stores env vars in TWO places.** The **Environment Variables** page and the **Build configuration** page each hold their own copy, and editing one leaves the other stale — so a corrected value can look right on screen while the app keeps reading the old one. Change both, then redeploy. This doubles the blast radius of the password gotcha below.
- **Changing the MySQL password breaks the live app silently** — the deployed `DATABASE_URL` still holds the old password, and the site shows a generic "Application error / Digest:" page with nothing useful in the runtime logs. Always check the existing hPanel value _before_ changing a password, update both, then redeploy.
- **Windows:** `node --env-file=.env node_modules/.bin/tsx ...` fails (`.bin/tsx` is a bash shim). Use `$env:VAR = "..."` + `npx tsx`. Never create `.env` with `>` redirect — PowerShell writes UTF-16 and dotenv parsing fails silently; use `Set-Content -Encoding utf8`.
- **npm/npx are not on the PATH over SSH**: `export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH`.

## 6. Environment variables

Beyond `DATABASE_URL` and `CRON_SECRET`, the lead pipeline and the event log read these (`architecture.md` §6, §12):

| Var                            | Required                                        | What breaks without it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRIVACY_SALT`                 | **Yes** (≥ 16 chars, secret, never in the repo) | Hashes fall back to a random per-process salt: IP-based rate limits reset on every restart. The app warns once and keeps working. Rotating it invalidates every existing `ip_hash`, which resets IP quotas — that is the intended way to rotate.                                                                                                                                                                                                                                                                                                                                    |
| `NEXT_PUBLIC_SITE_URL`         | Yes in production                               | The origin check falls back to comparing `Origin` against the `Host` header instead of the known domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `RESEND_API_KEY`               | Yes to deliver leads                            | Leads are still stored, with `status='new'` and a null `delivered_at`. Nothing is lost, and the hourly `lead-retry` cron (`/api/cron/lead-retry`, PR-23) keeps retrying `notifyInstitution` for every undelivered row — but with this unset it never succeeds, so a lead only becomes visible in the DB, not in an inbox. Set it before taking real traffic. **Account onboarding does not depend on it** — `/admin/usuarios` issues a one-time access link an admin hands over by WhatsApp (`architecture.md` §26), which is the path to use until the sending domain is verified. |
| `LEAD_FROM_EMAIL`              | Same as above                                   | Same as above. Sending domain must be verified in Resend first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No                                              | Unset means the Plausible script never loads. That is the correct state until someone subscribes — nothing is half-configured.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `BILLING_GRACE_DAYS`           | No (defaults to 15)                             | Days a `past_due` subscription keeps its paid features after `ends_on` (PR-29). Unparseable or negative falls back to 15 rather than to 0 — a typo must not cancel every paying institution's features. `0` is valid and means no grace. Capped at 90.                                                                                                                                                                                                                                                                                                                              |

## 7. Cron

hPanel cron → `curl` the authenticated route handlers listed in `architecture.md` §10, passing `CRON_SECRET` in the `x-cron-secret` header:

```
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/lead-retry
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/lead-digest
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/subscription-sweep
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/renewal-reminders
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/rebuild-search
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/admissions
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/staleness
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/purge-leads
```

Cadence for the PR-33 jobs, matching `architecture.md` §10: `rebuild-search`
nightly 03:00 -04, `admissions` daily 05:00, `staleness` weekly on Monday,
`purge-leads` weekly. `sitemap` needs **no** cron — the route is generated per
request and answers `not_needed` if you schedule it anyway.

`purge-leads` is the one job that deletes: it enforces the 24-month retention
`/legal/privacidad` promises. Everything else only reads, rebuilds or mails.

Suggested cadence for the two billing jobs (PR-29): both daily, the sweep
first — `subscription-sweep` at 06:00 -04 and `renewal-reminders` at 06:15, so
a subscription that ended overnight is already `past_due` when the digest
describes the day.

All jobs are idempotent, so a double-fire is harmless. For the billing pair
that is a property of the data rather than of the schedule: the sweep only
matches rows that are still `active`, and each reminder is recorded against a
UNIQUE `(subscription_id, period_ends_on, threshold_days)`. **Missing a run is
also safe** — the reminders catch up on the next run rather than skipping a
threshold, and a sweep that never runs can only under-grant (an `active`
subscription that has ended already stops granting features at `ends_on`;
`past_due` is what _extends_ them through the grace window).

## 7.1 Tests, coverage and performance checks (PR-34, PR-51)

`npm test` is what CI runs and what a PR is judged on. `npm run test:coverage`
prints a coverage summary and writes an HTML report to `coverage/` — it is
**visibility, not a gate**: nothing fails on the number, no threshold is
configured, and CI does not run it, so the PR check costs what it did before
(CLAUDE.md rule 11). The first measurement, at PR-51, was 55.7 % of statements.

## 7.2 Performance checks (PR-34)

`npm run perf:budget` runs in CI after `npm run build` and fails when a public
route exceeds 150 kB of gzipped JS. Run it locally the same way: build first,
then the budget.

Lighthouse is **not** in the PR check — CI has no `DATABASE_URL`, so it would
audit error pages. Run it against something that is actually serving:

```
gh workflow run lighthouse.yml -f url=https://educacion.com.py
```

Thresholds live in `lighthouserc.json`. They are configured and **not yet
measured against production** — the first run needs a deployed site with real
data in it.

## 8. Post-deploy checklist

```
[ ] App loads on the Hostinger URL, then on https://educacion.com.py with valid SSL
[ ] NEXT_PUBLIC_SITE_URL and all absolute-URL vars match the final domain; redeployed after
[ ] PRIVACY_SALT set to a long random secret (see §6) — check the logs for the warning
[ ] Admin login works with rotated credentials (never the bootstrap default)
[ ] A test lead submits and appears in the DB
[ ] Search returns results and facet counts are correct against live data
[ ] robots.txt and the sitemap index are reachable and correct
[ ] OG image renders for a program page and a comparison URL (test by pasting into WhatsApp)
[ ] The R-07 disclaimer is visible in the footer on every page
[ ] Cron jobs registered and firing (check import_runs / activity_log)
[ ] Slot recorded: account + remaining count
[ ] Sentry: the §8.1 steps below (they cannot be done from a build machine)
```

## 8.1 Sentry, once (PR-45)

Everything about Sentry is optional and unset is a working state — with no
`SENTRY_DSN` the SDK is never loaded and errors go to the console, which is what
CI and local dev do (`architecture.md` §29.2). These are the steps to turn it on,
and the two that **cannot** be done from a build machine and are therefore not
verified by anything in the repo.

1. **Project.** One shared free-tier organization covers this site and the
   operator's others as separate projects. Create `educacion`, platform
   *Next.js*.
2. **Env vars, in hPanel — both places** (§5's two-copies gotcha applies):
   `SENTRY_DSN` (Settings → Projects → educacion → Client Keys),
   `SENTRY_ENVIRONMENT=production`, and for sourcemaps `SENTRY_AUTH_TOKEN`
   (Settings → Auth Tokens, scope `project:releases`), `SENTRY_ORG`,
   `SENTRY_PROJECT`. Then **redeploy** — env changes need one.
3. **Set the per-key rate limit** — Settings → Projects → educacion → Client
   Keys → *Rate Limit*. Suggested **500 events/hour**. This is the half of the
   crash-loop protection the app cannot do: both in-process bounds (§29.4)
   reset when Hostinger recycles the process, and a restart loop is exactly the
   shape of outage that would.
4. **Confirm the sourcemaps arrived** after the first production deploy —
   Settings → Projects → educacion → Source Maps should list a release with
   artifacts. A build with a wrong `SENTRY_AUTH_TOKEN` now **fails** rather than
   deploying green with no maps, but a token with the wrong *scope* can still
   upload nothing, and unsymbolicated stacks are the failure this whole section
   exists to prevent.
5. **Smoke-test the three capture paths.** This is PR-45's remaining acceptance
   criterion and needs a live DSN:
   - a **server component** — visit a data page with the database credentials
     temporarily wrong; the error boundary should render and an event appear;
   - a **Server Action** — submit the lead form with the same;
   - a **client component** — an error inside a boundary posts to
     `/api/client-error`; the event carries `origin: client` and the browser's
     stack.
   Check each event for a readable stack, and check that **none** carries a
   cookie, a header, a form body or a query string (§29.3).


## 8.2 After PR-46: rebuild the search index once (PR-46)

PR-46 fixed `plan_rank` being written for **Verificado**, which does not buy
`priority_placement` — a paid, unlabelled ordering on every default-sorted page.

The fix is in `planRanksByInstitution`, and it is **inert until the index is
rebuilt**: `program_search.plan_rank` is a denormalised copy refreshed by the
nightly cron, so until that runs the wrong ranks are still what MySQL orders by.
Do not wait for the cron on the deploy that carries this PR — run it by hand:

```
npm run search:rebuild
```

Then spot-check `/carreras` with no query: an institution whose only
subscription is Verificado must carry no **Destacado** badge and must not lead
its tie group. If it does, the rebuild did not run against the deployed
database — check `DATABASE_URL` in the shell you ran it from (§5).
