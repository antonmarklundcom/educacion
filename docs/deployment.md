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
- **Changing the MySQL password breaks the live app silently** — the deployed `DATABASE_URL` still holds the old password, and the site shows a generic "Application error / Digest:" page with nothing useful in the runtime logs. Always check the existing hPanel value _before_ changing a password, update both, then redeploy.
- **Windows:** `node --env-file=.env node_modules/.bin/tsx ...` fails (`.bin/tsx` is a bash shim). Use `$env:VAR = "..."` + `npx tsx`. Never create `.env` with `>` redirect — PowerShell writes UTF-16 and dotenv parsing fails silently; use `Set-Content -Encoding utf8`.
- **npm/npx are not on the PATH over SSH**: `export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH`.

## 6. Environment variables

Beyond `DATABASE_URL` and `CRON_SECRET`, the lead pipeline and the event log read these (`architecture.md` §6, §12):

| Var                            | Required                                        | What breaks without it                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PRIVACY_SALT`                 | **Yes** (≥ 16 chars, secret, never in the repo) | Hashes fall back to a random per-process salt: IP-based rate limits reset on every restart. The app warns once and keeps working. Rotating it invalidates every existing `ip_hash`, which resets IP quotas — that is the intended way to rotate. |
| `NEXT_PUBLIC_SITE_URL`         | Yes in production                               | The origin check falls back to comparing `Origin` against the `Host` header instead of the known domain.                                                                                                                                         |
| `RESEND_API_KEY`               | Yes to deliver leads                            | Leads are still stored, with `status='new'` and a null `delivered_at`, and the hourly `lead-retry` cron picks them up. Nothing is lost; the institution is just not told yet.                                                                    |
| `LEAD_FROM_EMAIL`              | Same as above                                   | Same as above.                                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No                                              | Unset means the Plausible script never loads. That is the correct state until someone subscribes — nothing is half-configured.                                                                                                                   |
| `ADMIN_STATS_TOKEN`            | No (≥ 24 chars if set)                          | Unset means `/admin/stats` 404s, which is the intended default until PR-18 ships real auth.                                                                                                                                                      |

## 7. Cron

hPanel cron → `curl` the authenticated route handlers listed in `architecture.md` §10, passing `CRON_SECRET` as a header. All jobs are idempotent, so a double-fire is harmless.

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
