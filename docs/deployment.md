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

| Var                            | Required                                        | What breaks without it                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PRIVACY_SALT`                 | **Yes** (≥ 16 chars, secret, never in the repo) | Hashes fall back to a random per-process salt: IP-based rate limits reset on every restart. The app warns once and keeps working. Rotating it invalidates every existing `ip_hash`, which resets IP quotas — that is the intended way to rotate.                                                                                                             |
| `NEXT_PUBLIC_SITE_URL`         | Yes in production                               | The origin check falls back to comparing `Origin` against the `Host` header instead of the known domain.                                                                                                                                                                                                                                                     |
| `RESEND_API_KEY`               | Yes to deliver leads                            | Leads are still stored, with `status='new'` and a null `delivered_at`. Nothing is lost, and the hourly `lead-retry` cron (`/api/cron/lead-retry`, PR-23) keeps retrying `notifyInstitution` for every undelivered row — but with this unset it never succeeds, so a lead only becomes visible in the DB, not in an inbox. Set it before taking real traffic. |
| `LEAD_FROM_EMAIL`              | Same as above                                   | Same as above. Sending domain must be verified in Resend first.                                                                                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No                                              | Unset means the Plausible script never loads. That is the correct state until someone subscribes — nothing is half-configured.                                                                                                                                                                                                                               |
| `BILLING_GRACE_DAYS`           | No (defaults to 15)                             | Days a `past_due` subscription keeps its paid features after `ends_on` (PR-29). Unparseable or negative falls back to 15 rather than to 0 — a typo must not cancel every paying institution's features. `0` is valid and means no grace. Capped at 90.                                                                                                       |

## 7. Cron

hPanel cron → `curl` the authenticated route handlers listed in `architecture.md` §10, passing `CRON_SECRET` in the `x-cron-secret` header:

```
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/lead-retry
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/lead-digest
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/subscription-sweep
curl -H "x-cron-secret: $CRON_SECRET" https://educacion.com.py/api/cron/renewal-reminders
```

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
```
