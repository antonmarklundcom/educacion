# Pull Request Plan

**Status (2026-09-12):** PR-01–58 are merged (Phases 0–8). Phase 9 (PR 59–66) is the launch
phase decided in `docs/review-2026-09.md`, prompts in `prompts/`, and is under way: PR-59,
PR-60 and PR-61 are merged; PR-63 is in review; PR-62 and PR-64 are blocked on the human
inputs named in `docs/decisions-needed.md` (an ANEAES PDF and an editorial sources file);
PR-66 (this docs diet) is in progress. PR-37 and PR-38 were never used — the numbering jumped
to 39 and the gap is left as-is rather than backfilled, so branch names in git history stay
truthful.

**Sizing principle:** one PR = one reviewable concern, deployable on its own. If explaining the scope takes a paragraph, split it.

**Owner column:**

- **Opus** — Opus 5 writes it. Decisions that are expensive to reverse: schema, matching, search, security, permissions, money.
- **Sonnet** — Sonnet 5 writes it against a decided interface.
- **Sonnet → Opus review** — Sonnet writes, Opus must review before merge (touches data integrity, PII, access control or money).

Branch naming: `claude/pr-NN-short-slug`. Every PR merges to `main`; `main` is what Hostinger deploys.

---

## Phase 0 — Foundation (PR 01–07)

### PR-01 — Repo scaffold & CI · **Sonnet** · ✅

[`docs/decisions/pr-1.md`](decisions/pr-1.md)

### PR-02 — Database schema & migrations · **Opus** · ✅

[`docs/decisions/pr-2.md`](decisions/pr-2.md)

### PR-03 — Design system primitives · **Sonnet** · ✅

[`docs/decisions/pr-3.md`](decisions/pr-3.md)

### PR-04 — App shell & routing skeleton · **Sonnet** · ✅

[`docs/decisions/pr-4.md`](decisions/pr-4.md)

### PR-05 — Source ingestion: raw layer · **Opus** · ✅

[`docs/decisions/pr-5.md`](decisions/pr-5.md)

### PR-06 — Entity matching & curation pipeline · **Opus** · ✅

[`docs/decisions/pr-6.md`](decisions/pr-6.md)

### PR-07 — Search index & query layer · **Opus** · ✅

[`docs/decisions/pr-7.md`](decisions/pr-7.md)

**Phase 0 exit:** DB seeded with real national data; a rebuild script safe to re-run; nothing user-visible yet.

---

## Phase 1 — Public MVP (PR 08–17)

### PR-08 — `/carreras` browser, card view (Dirección 1) · **Sonnet** · ✅

[`docs/decisions/pr-8.md`](decisions/pr-8.md)

### PR-09 — `/carreras` table view + comparador (Dirección 4) · **Opus** · ✅

[`docs/decisions/pr-9.md`](decisions/pr-9.md)

### PR-10 — Program detail page · **Sonnet** · ✅

[`docs/decisions/pr-10.md`](decisions/pr-10.md)

### PR-11 — Institution pages · **Sonnet** · ✅

[`docs/decisions/pr-11.md`](decisions/pr-11.md)

### PR-12 — Career hubs & area pages · **Sonnet** · ✅

[`docs/decisions/pr-12.md`](decisions/pr-12.md)

### PR-13 — Homepage · **Sonnet** · ✅

[`docs/decisions/pr-13.md`](decisions/pr-13.md)

### PR-14 — Lead capture · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-14.md`](decisions/pr-14.md)

### PR-15 — Legal & trust pages · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-15.md`](decisions/pr-15.md)

### PR-16 — SEO pack · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-16.md`](decisions/pr-16.md)

### PR-17 — Analytics & first-party events · **Sonnet** · ✅

[`docs/decisions/pr-17.md`](decisions/pr-17.md)

**Phase 1 exit:** live on educacion.com.py, indexed, complete index browsable and comparable, leads landing in the DB.

---

## Phase 2 — Backend, admin & institution portal (PR 18–24)

### PR-18 — Auth foundation · **Opus** · ✅

[`docs/decisions/pr-18.md`](decisions/pr-18.md)

### PR-19 — Admin CRUD: core entities · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-19.md`](decisions/pr-19.md)

### PR-20 — Admin: prices, accreditations, admissions & moderation queue · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-20.md`](decisions/pr-20.md)

### PR-21 — Institution portal `/panel` · **Opus** · ✅

[`docs/decisions/pr-21.md`](decisions/pr-21.md)

### PR-22 — Claim-your-profile flow · **Opus** · ✅

[`docs/decisions/pr-22.md`](decisions/pr-22.md)

### PR-23 — Lead inbox & delivery · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-23.md`](decisions/pr-23.md)

### PR-24 — Dispute & right-of-reply · **Sonnet** · ✅

[`docs/decisions/pr-24.md`](decisions/pr-24.md)

**Phase 2 exit:** an institution can claim, correct and receive leads without you touching the DB.

---

## Phase 3 — Monetization (PR 25–29)

### PR-25 — Plans, subscriptions & entitlements · **Opus** · ✅

[`docs/decisions/pr-25.md`](decisions/pr-25.md)

### PR-26 — `/para-instituciones` sales page · **Sonnet** · ✅

[`docs/decisions/pr-26.md`](decisions/pr-26.md)

### PR-27 — Verified & Destacado presentation · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-27.md`](decisions/pr-27.md)

### PR-28 — Institution analytics dashboard · **Sonnet** · ✅

[`docs/decisions/pr-28.md`](decisions/pr-28.md)

### PR-29 — Billing ops & renewals · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-29.md`](decisions/pr-29.md)

**Phase 3 exit:** first paid institution invoiced and live.

---

## Phase 4 — Depth & growth (PR 30–34)

### PR-30 — Editorial system & the accreditation hub · **Sonnet** · ✅

[`docs/decisions/pr-30.md`](decisions/pr-30.md)

### PR-31 — Becas module · **Sonnet** · ✅

[`docs/decisions/pr-31.md`](decisions/pr-31.md)

### PR-32 — Salida laboral & empleos relacionados · **Opus** · ✅

[`docs/decisions/pr-32.md`](decisions/pr-32.md)

### PR-33 — Data-freshness system · **Opus** · ✅

[`docs/decisions/pr-33.md`](decisions/pr-33.md)

### PR-34 — Performance, accessibility & CI budgets · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-34.md`](decisions/pr-34.md)

### PR-35 — Password reset by email · **Opus** · ✅

[`docs/decisions/pr-35.md`](decisions/pr-35.md)

### PR-36 — Accounts & onboarding without email · **Opus** · ✅

[`docs/decisions/pr-36.md`](decisions/pr-36.md)

### PR-39 — OG images for blog, becas and programme pages · **Sonnet** _(backfilled entry)_ · ✅

[`docs/decisions/pr-39.md`](decisions/pr-39.md)

## Phase 6 — Hardening & SEO debt (PR 40–46) — planned

The 2026-08-19 audit found the build complete but carrying exactly the debt that matters
before the October–February traffic peak (`plan.md` §5): the money pages are not in the
sitemap, the primary catalog pages carry no structured data, every public request hits
MySQL uncached, login is the one endpoint without rate limiting, and production errors are
invisible. Phase 6 pays that down. **PR-40 and PR-41 come first; everything except PR-43
is independent and safe to run as a parallel batch.**

### PR-40 — Sitemap index for the catalog · **Sonnet** _(built by Opus 5)_ · ✅

[`docs/decisions/pr-40.md`](decisions/pr-40.md)

### PR-41 — JSON-LD on the primary catalog pages · **Sonnet → Opus review** _(built by Opus 5)_ · ✅

[`docs/decisions/pr-41.md`](decisions/pr-41.md)

### PR-42 — Login rate limiting & route-group error boundaries · **Sonnet → Opus review** _(built by Opus 5)_ · ✅

[`docs/decisions/pr-42.md`](decisions/pr-42.md)

### PR-43 — Caching layer for the public surfaces · **Opus** · ✅

[`docs/decisions/pr-43.md`](decisions/pr-43.md)

### PR-44 — Activity-log viewer & deletion-request tooling · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-44.md`](decisions/pr-44.md)

### PR-45 — Observability: Sentry · **Sonnet** · ✅

[`docs/decisions/pr-45.md`](decisions/pr-45.md)

### PR-46 — Review remediation: PR-23 / PR-27 / PR-29 · **Opus** · ✅

[`docs/decisions/pr-46.md`](decisions/pr-46.md)

## Phase 7 — Growth & polish (PR 47–51) — planned

Independent quality-of-life and conversion work, deliberately after Phase 6's debt is paid.
All five are parallel-safe; none blocks another.

### PR-47 — i18n seam: the copy catalog · **Sonnet** · ✅

[`docs/decisions/pr-47.md`](decisions/pr-47.md)

### PR-48 — Total-cost calculator · **Sonnet** · ✅

[`docs/decisions/pr-48.md`](decisions/pr-48.md)

### PR-48b — the second review pass on PR-48 · **Opus** · ✅

[`docs/decisions/pr-48b.md`](decisions/pr-48b.md)

### PR-49 — Panel: lead SLA nudges & in-panel plan status · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-49.md`](decisions/pr-49.md)

### PR-50 — Admin import & cron console · **Sonnet → Opus review** · ✅

[`docs/decisions/pr-50.md`](decisions/pr-50.md)

### PR-51 — Server-Action tests & input validation · **Sonnet** · ✅

[`docs/decisions/pr-51.md`](decisions/pr-51.md)

### PR-52 — PR-49/PR-50 review remediation · **Opus** · ✅

[`docs/decisions/pr-52.md`](decisions/pr-52.md)

## Phase 8 — Quality hardening (PR 53–56) — in progress

Feature-complete against the plan, so this phase adds no features. It measures the
things earlier phases configured and never ran, raises the coverage floor on the
paths that move money and data, and re-reads what the last few PRs shipped.

### PR-53 — Lighthouse, actually run · **Opus** · ✅

[`docs/decisions/pr-53.md`](decisions/pr-53.md)

### PR-54 — Coverage where being wrong is expensive · **Opus** · ✅

[`docs/decisions/pr-54.md`](decisions/pr-54.md)

### PR-55 — The `force-dynamic` audit · **Opus** · ✅

[`docs/decisions/pr-55.md`](decisions/pr-55.md)

### PR-56 — The SEO-surface sweep · **Opus** · ✅

[`docs/decisions/pr-56.md`](decisions/pr-56.md)

## Phase 9 — Launch: data unblocked, content written (PR 59–66) — planned

Decided in `docs/review-2026-09.md` (2026-09-11). No feature, no hardening. Every PR here
either lets real data reach the catalog, lets a money page enter the index, or removes a
launch hazard. **The Opus lane runs first, sequentially; the Sonnet lane follows.** One prompt
per PR in `prompts/`; a session runs one prompt and ends. PR-65 is reserved and unused so the
numbers below stay stable.

Order: PR-59 → PR-61 (Opus) → PR-60 → PR-62 → PR-63 → PR-64 → PR-66 (Sonnet, each with its
review where marked).

### PR-59 — Offerings without a stated modality · **Opus**

CONES stopped printing modality (`data-sources.md` §1.1), and `buildProposals` refuses to
create an offering without one (`src/lib/curate/pipeline.ts`, the `if (!placement.modality)`
branch). The consequence is an empty `program_search` and an empty site. Rule 1 asks for the
honest gap to be shown, not for the row to be withheld — `enrollment_status` already carries
`sin_datos` for the same reason.

Scope:
- `MODALITY` gains `'sin_datos'` (schema, `program_search.modality`, a migration via
  `npm run db:generate`; `docs/data-model.md` "Programs & offerings" + "The search table").
- `mapModality(null)` stays `null`; the pipeline maps a `null` placement modality to
  `'sin_datos'` **only for CONES rows** and creates the offering. The uniqueness key keeps
  `modality` in it, so a later row with a real modality creates a second offering rather than
  overwriting; when a real-modality offering exists for the same program + campus, the
  `sin_datos` twin is superseded (unpublished) by the pipeline, never deleted.
- Search: `sin_datos` never matches a `modalities` filter value; the facet shows "Sin datos"
  with its count but is not selectable; sort and everything else unaffected.
- UI: `labels.ts` renders `Modalidad: sin datos`; cards, the table view, the comparador row,
  `OfferingsBlock`, the OG programme card and the city-page intro all use the label through the
  copy catalog (`src/lib/copy`), never inline.
- JSON-LD: `catalog-schema.ts` omits `courseMode` for `sin_datos`; `timeRequired` /
  `educationalCredentialAwarded` rules unchanged.
- Admin: the offering form (`parseOfferingInput`) accepts `sin_datos` so an editor can leave it
  honest; the panel's offering editor lets an institution set a real modality, which is the
  intended correction path.
- `data-sources.md` §1.1 updated: "PR-06 will not create offerings from CONES" becomes the
  new rule.

**Deps:** none.
**Accept:** `npm run curate` against a CONES snapshot with null modality creates one
`published` offering per (program, campus) with `modality = 'sin_datos'` (test in
`pipeline.test.ts` replacing "does not invent a modality"); `program_search` rebuild includes
them; a `?modalities=presencial` query excludes them; no string `sin datos` in JSX outside the
catalog; `Course` JSON-LD for such an offering has no `courseMode`; `npm run build`, `lint`,
`test` green; the `docs/data-model.md` and `data-sources.md` edits are in the same PR.

### PR-60 — Canonical-host middleware · **Sonnet → Opus review**

There is no `src/middleware.ts`. Once deployed, the `*.hostingersite.com` preview and
`universidad.com.py` serve full duplicates. `docs/domains.md` §1 is the contract.

Scope:
- `src/middleware.ts`: if the request host (`x-forwarded-host` first, then `host`) differs
  from the host of `NEXT_PUBLIC_SITE_URL`, respond `301` to the same path + query on the
  canonical origin. `www.` is non-canonical. Exempt: `/api/cron/*`, `/api/client-error`, any
  request without a resolvable canonical (env unset → pass through, log once).
- `robots.ts`: on a non-canonical host return disallow-all (belt and braces for a crawler that
  arrives before DNS settles).
- `docs/deployment.md` §2 step 6–7 and `docs/launch-runbook.md` reference it; `.env.example`
  documents that `NEXT_PUBLIC_SITE_URL` is now load-bearing for routing.

**Deps:** none. **Review:** it runs on every request; the reviewer checks it cannot loop, never
touches `/api/cron`, and passes `x-forwarded-proto` handling the same way `runCronJobAction`'s
test pins ("https,http" builds one URL).
**Accept:** unit tests for the matcher (canonical passes; `www.`, preview host and
`universidad.com.py` 301 with path + query preserved; cron path exempt; env unset passes);
`npm run build` green; the middleware matcher excludes `_next/static`, `_next/image`, `og/*`
is **not** excluded (a shared OG image must also live on the canonical host).

### PR-61 — Price bulk import: CSV → `prices` · **Opus**

The data assistant works in a sheet (`data-sources.md` §5). The site ingests it through the
same rules as the form, with a dry run.

Scope:
- CSV contract, documented in `docs/data-sources.md` §5.1 and shipped as
  `data/templates/aranceles.csv` (header row + one example row that is clearly a template,
  never real data): `institution_slug, program_slug, campus_slug, modality, currency,
  matricula, monthly_fee, installments_per_year, admission_fee, is_free, source, source_url,
  valid_from, valid_to, notes, verified_on`. The offering is resolved from the four slugs;
  `sin_datos` modality is a legal value after PR-59.
- `/admin/importaciones` gains "Importar aranceles (CSV)": upload → **dry-run table** with a
  per-row verdict (create / supersede current / error with the same Spanish message
  `parsePriceInput` produces) → confirm → apply in one transaction per row batch, writing
  `verified_at`, `verified_by_user_id` = the session user, and an `activity_log` entry per row.
  Every row goes through `parsePriceInput` (build a `FormData` from the row; do not fork the
  validation). `is_current` handling reuses the existing supersede query in
  `db/queries/admin/prices.ts`.
- `requireRole('admin' | 'editor')`; file size cap; max rows per run (500) with the reason in
  the UI copy.

**Deps:** PR-59 (modality value). **Accept:** a fixture CSV with one valid row, one unknown
slug, one price without installments and one stale `verified_on` (> 12 months) produces four
correct verdicts in dry run; apply writes exactly the valid row and one activity-log entry; a
second identical apply supersedes rather than duplicates (`current_offering_id` uniqueness
holds); no SQL outside `src/db/queries/`; docs updated in the same PR.

### PR-62 — ANEAES 2024 transcription · **Sonnet → Opus review**

`data-sources.md` §1.2 decided: transcribe. Requires the PDF committed by Anton at
`data/sources/aneaes/Listado_de_acreditaciones_2024.pdf` (human input; the session stops per
`prompts/README.md` if it is absent).

Scope:
- `data/sources/aneaes/listado-2024.csv` in the §1.2 header contract, one row per programme,
  `Fuente` = the PDF's public URL on every row, `Resolucion` empty, no vigencia columns.
- `data/sources/aneaes/README.md`: per-section counts read off the PDF (expected 122 nacional,
  6 ARCU-SUR, 18 postgrado, 1 institution) and the exact page each section starts on.
- A test that parses the CSV through `parseAneaesCsv` and asserts the section counts match the
  README, every row is `citable`, and every institution name maps to a CONES institution or is
  listed in the README's "unmatched" table with the reason.
- `npm run import:aneaes -- --file data/sources/aneaes/listado-2024.csv --dry-run` output
  pasted into the PR body.

**Deps:** none in code. **Review:** the reviewer spot-checks 20 random rows against the PDF
pages and the unmatched table; any row it cannot find is a blocker.
**Accept:** counts match; `citable: true` on every row; no `Resolucion` value invented; the
`curate` dry run proposes accreditation writes only for matched programmes.

### PR-63 — Career hub editorial copy · **Sonnet → Opus review**

Every career hub is `noindex` until `description_md` has 150 words (`src/lib/careers/copy.ts`).

Scope:
- `data/editorial/careers/<slug>.md` for the 40 careers with the most published offerings after
  PR-59 (the list is produced by a query at session start and committed as
  `data/editorial/careers/_index.md`). 180–260 words each, voseo, Paraguayan context. **No
  number of any kind** — no durations, prices, counts, salaries, employability, percentages,
  years. Those are rendered by the page from the database. No institution named. No
  accreditation claim.
- `scripts/seed-editorial.ts` + `npm run seed:editorial`: idempotent, writes
  `careers.description_md` **only where it is null**, never overwrites an admin edit, logs
  what it skipped.
- A test that scans every markdown file for digits and for institution names from the
  taxonomy and fails on either.

**Deps:** PR-59. **Review:** the fabrication scan (`agent-workflow.md` §5 item 5) on every
file; a paragraph that could be about any career is rewritten or the file is dropped.
**Accept:** 40 files pass the scan; seed is idempotent (second run writes nothing); hubs for
those careers render `index, follow` in `generateMetadata` on a seeded local DB.

### PR-64 — Accreditation hub posts · **Sonnet → Opus review**

`seo.md` §8 items 1 and 3: the explainer and the maintained list. Requires
`data/editorial/sources/acreditacion.md` from Anton: the URLs and quoted sentences of every
source (ANEAES statement, MEC resolution, ABC Color coverage) the posts may cite. The session
stops if the file is absent.

Scope:
- Three posts as `data/editorial/posts/*.md` seeded through the same `seed:editorial` script
  (extend it; posts by slug, `draft` status so an admin publishes): "¿Qué significa que una
  carrera esté acreditada por ANEAES?", "¿Qué pasa con tu título si la carrera no está
  acreditada?", "Cómo verificar si tu carrera está acreditada (paso a paso)". Every factual
  claim footnoted to a line in the sources file; anything not in it is not written.
- Each post links the checker (`/acreditacion`) and at least one career hub with descriptive
  anchor text; none targets a career hub's transactional query.

**Deps:** PR-63 (the seed script). **Review:** every claim traced to the sources file.
**Accept:** posts seed as drafts; the citation test (claim sentence ↔ source line) passes;
`Article` JSON-LD renders on publish.

### PR-66 — Docs diet · **Sonnet**

`docs/architecture.md` is 3,100 lines, most of it "settled in PR-NN" narrative every session
is told to read.

Scope:
- Move each `## N. … (settled in PR-NN)` section verbatim to `docs/decisions/pr-NN.md`
  (one file per PR, the section heading preserved). Leave in `architecture.md` §1–§10 plus a
  short "current state" paragraph per moved section that says what is true now and links the
  decision file. Target ≤ 700 lines.
- Same treatment for `docs/pr-plan.md`: shipped phases 0–8 collapse to their tables with
  one-line entries linking `docs/decisions/pr-NN.md`; planned phases stay in full.
- `CLAUDE.md` table: add `docs/decisions/` and `docs/domains.md`, `docs/review-2026-09.md`,
  `docs/launch-runbook.md`, `prompts/`.
- No wording changes inside moved text; a `git diff --stat` that shows only moves plus the
  new summaries is the review.

**Deps:** after PR-59–64 merge (so nothing in flight references a moved anchor).
**Accept:** every internal `docs/*.md#anchor` link resolves (add a link check to `npm test`
or a script); `architecture.md` ≤ 700 lines; nothing deleted, only moved.

---

## Designed, not scheduled

Student accounts, the "Mi lista" decision dashboard, inscription alerts, the vocational
quiz and any second language are **specified in [`student-engagement.md`](student-engagement.md)
and deliberately not in any phase**. The spec exists so activation is a decision, not a
planning round; its activation trigger is written in that file. Media uploads for
institution profiles (the `enhanced_profile` PR-27 removed) stay blocked on the R-08
storage decision and return only with the migration that creates institution media.

---

## Summary

| Phase                            | PRs   | Count  | Opus   | Sonnet | Sonnet → Opus review |
| -------------------------------- | ----- | ------ | ------ | ------ | -------------------- |
| 0 — Foundation                   | 01–07 | 7      | 4      | 3      | 0                    |
| 1 — Public MVP                   | 08–17 | 10     | 1      | 6      | 3                    |
| 2 — Backend & portal             | 18–24 | 7      | 3      | 1      | 3                    |
| 3 — Monetization                 | 25–29 | 5      | 1      | 2      | 2                    |
| 4 — Depth & growth               | 30–34 | 5      | 2      | 3      | 0                    |
| 5 — Closing PR-18                | 35–36 | 2      | 2      | 0      | 0                    |
| — OG images (backfilled)         | 39    | 1      | 0      | 1      | 0                    |
| **Shipped**                      |       | **37** | **13** | **16** | **8**                |
| 6 — Hardening & SEO debt (plan)  | 40–46 | 7      | 2      | 2      | 3                    |
| 7 — Growth & polish (plan)       | 47–51 | 5      | 0      | 3      | 2                    |
| 8 — Quality hardening (shipped)  | 52–58 | 7      | 7      | 0      | 0                    |
| 9 — Launch (plan)                | 59–66 | 7      | 2      | 1      | 4                    |
| **Total incl. planned**          |       | **63** | **24** | **22** | **17**               |

Across the 37 shipped PRs Sonnet wrote **24 (65%)** and, weighted by lines of code, closer
to **80%** — the heavy-line-count PRs (pages, admin CRUD, components) are all Sonnet's.
The planned Phases 6–7 keep the same shape: Opus owns the decisions that are expensive to
unwind (caching interface, the money-path review), Sonnet writes everything downstream of a
decided interface, and the review lane is enforced this time (PR-46's going-forward rule).
