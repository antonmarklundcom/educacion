# Launch runbook — the ordered human checklist

Everything here needs Anton's hands (hosting panel, DNS, credentials, a PDF, a hire). Agents
cannot do any of it. Items are in the order they are first needed; each names the PR that
depends on it. `deployment.md` holds the mechanics and the gotchas; this file is only the
sequence.

## Week 0 — before or while the Opus lane runs

- [ ] **Deploy `main` to a Hostinger Node.js slot** (`deployment.md` §2 steps 1–5). Verify on
      the `*.hostingersite.com` URL. Record account + remaining slots in `deployment.md` §1.
- [ ] **Migrations + seeds from a local machine** (`deployment.md` §3.1): `db:migrate`,
      `seed:taxonomy`, `seed:plans`, `bootstrap-admin`, rotate the admin password.
- [ ] **Run the CONES import from a local machine** (`import:cones`, then `curate`,
      `search:rebuild`). Before PR-59 this yields institutions and programmes but no offerings —
      expected. Re-run `curate` + `search:rebuild` after PR-59 merges; that is the moment the
      site fills.
- [ ] **Commit the ANEAES PDF** at `data/sources/aneaes/Listado_de_acreditaciones_2024.pdf`
      (download from `aneaes.gov.py`, ~12 pages). PR-62 cannot start without it.
- [ ] **Hire the data assistant** (`plan.md` §6, `monetization.md` §4: ~USD 250–450/month
      part-time). Give them `data/templates/aranceles.csv` once PR-61 merges and
      `data-sources.md` §5's priority list. Start with the top 25 private institutions.

## Week 1 — DNS and the second domain

- [ ] **Map `educacion.com.py`** (`deployment.md` §2 step 6), set `NEXT_PUBLIC_SITE_URL` to
      `https://educacion.com.py`, redeploy. After PR-60 the preview host 301s here.
- [ ] **`universidad.com.py` → 301.** Preferred: a hosting-level redirect (NIC.py DNS → the same
      Hostinger app, then the app's middleware redirects; or Hostinger's domain redirect
      feature if the plan offers it). Test: `curl -I https://universidad.com.py/carreras`
      returns `301` with `Location: https://educacion.com.py/carreras`.
- [ ] **Search Console:** add both `educacion.com.py` (domain property) and
      `universidad.com.py`; submit `https://educacion.com.py/sitemap.xml`; on the
      `universidad.com.py` property use "Change of address" pointing at `educacion.com.py`.
- [ ] **Sentry** (`deployment.md` §8.1), **cron** registration (§7), **PRIVACY_SALT** set.
- [ ] Walk `deployment.md` §8's post-deploy checklist and tick every line.

## Week 2 — content inputs

- [ ] **Write `data/editorial/sources/acreditacion.md`** for PR-64: the URL and the quoted
      sentence for every claim the posts may make (ANEAES's July 2026 statement, the MEC
      accreditation mandate, ABC Color's coverage). Agents cannot reach `*.gov.py`.
- [ ] After PR-63 merges: **re-derive the real top-40 list.** PR-63's forty slugs were
      compiled without a database (none is reachable from an agent session), so they are a
      coverage list, not the forty careers with the most published offerings —
      `data/editorial/careers/_index.md` says so and says what to do. With `DATABASE_URL` set,
      query the real ranking, add a file for every career in it that has none, and re-run the
      scan (`npx vitest run src/lib/careers/editorial-copy.test.ts`).
- [ ] After PR-63 merges: `npm run seed:editorial` from a local machine, then re-run
      `search:rebuild`. Check three career hubs render `index, follow`. A slug with no matching
      `careers` row is skipped and logged, never an error — read the counts the script prints.
- [ ] After PR-64 merges: publish the three posts from `/admin/blog` after reading them.
- [ ] After PR-62 merges: `import:aneaes --file data/sources/aneaes/listado-2024.csv`,
      `curate`, review the queue at `/admin/moderacion`, `search:rebuild`.

## Later — only if Phase 10 activates

- [ ] Ask Hostinger support whether a managed Node.js app can carry a second mapped domain
      (needed by `docs/domains.md` §4, nothing else).
- [ ] Decide on `colegio.com.py` / `escuelas.com.py` purchase — defensive redirect at most.

## What "launched" means

`https://educacion.com.py/carreras` lists real offerings from CONES; a programme page shows
an ANEAES accreditation with its PDF citation; at least one arancel from the assistant's sheet
renders with its verification month; the top career hubs are indexable; `universidad.com.py`
redirects; Search Console shows the sitemap accepted. That is the exit of Phase 9.
