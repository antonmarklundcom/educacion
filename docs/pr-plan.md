# Pull Request Plan — 34 PRs

**Sizing principle:** one PR = one reviewable concern, deployable on its own. If explaining the scope takes a paragraph, split it.

**Owner column:**
- **Opus** — Opus 5 writes it. Decisions that are expensive to reverse: schema, matching, search, security, permissions, money.
- **Sonnet** — Sonnet 5 writes it against a decided interface.
- **Sonnet → Opus review** — Sonnet writes, Opus must review before merge (touches data integrity, PII, access control or money).

Branch naming: `claude/pr-NN-short-slug`. Every PR merges to `main`; `main` is what Hostinger deploys.

---

## Phase 0 — Foundation (PR 01–07)

### PR-01 — Repo scaffold & CI · **Sonnet**
Next.js 15 (App Router, TS, Tailwind), ESLint + Prettier, `tsconfig` strict, `.env.example`, `CLAUDE.md`, GitHub Actions running typecheck + lint + build on every PR, `README`.
**Deps:** none.
**Accept:** `npm run build` passes locally and in CI; `.env.example` documents every variable with a comment on where its value comes from; no secrets committed.

### PR-02 — Database schema & migrations · **Opus**
Drizzle config, pooled connection (`connectionLimit: 8`, `timezone: "Z"`), full schema per `docs/data-model.md`, first migration, taxonomy seed (areas, departamentos, ciudades).
**Deps:** PR-01.
**Accept:** migration applies cleanly against Hostinger Remote MySQL from a local machine; seed is idempotent (re-run leaves identical state); all enums, unique keys and indexes from `data-model.md` present.

### PR-03 — Design system primitives · **Sonnet**
Tailwind theme (tokens from `docs/design-system.md`), fonts via `next/font` (IBM Plex Sans + Mono), and primitives: `Button`, `Badge`, `Chip`, `Card`, `Checkbox`, `Select`, `Input`, `RangeSlider`, `Tag`, `Skeleton`, `Pagination`. Accent `#0d6e86` restricted to primary CTAs.
**Deps:** PR-01.
**Accept:** a `/kitchen-sink` dev-only route renders every primitive in every state; contrast ≥ 4.5:1 on all text; `prefers-reduced-motion` respected; no component imports a font or colour outside the tokens.

### PR-04 — App shell & routing skeleton · **Sonnet**
Root layout, header (desktop + mobile nav), footer with the R-07 disclaimer and NAP, 404, error boundary, loading states, base metadata, `robots.ts`, `sitemap.ts` stub, `es-PY` formatting helpers (guaraníes, durations, dates).
**Deps:** PR-03.
**Accept:** every route in `architecture.md` §2 exists as a placeholder returning 200; footer disclaimer present on every page; mobile nav usable at 390px.

### PR-05 — Source ingestion: raw layer · **Opus**
`source_records` + `import_runs` writing, fetch helpers with polite rate limiting and a real UA, parsers for the CONES habilitación lists and the ANEAES / datos.gov.py accredited-programs dataset. **Raw capture only — no matching, no writes to curated tables.**
**Deps:** PR-02.
**Accept:** `npm run import:cones` and `npm run import:aneaes` populate `source_records` with checksums; re-running the same source produces zero duplicate rows; an `import_runs` summary prints rows in/new/unchanged.

### PR-06 — Entity matching & curation pipeline · **Opus**
`match_key` normalization, `institution_aliases`, career synonym matching, fuzzy proposals, the NEW/UNCHANGED/CHANGED/CONFLICT classifier, and the apply step writing institutions / campuses / programs / offerings / accreditations. Conflicts queue instead of applying.
**Deps:** PR-05.
**Accept:** full import of both sources produces a de-duplicated institution list with no known duplicates; ≥ 60% auto-match rate reported; every conflict lands in the moderation queue; **no accreditation row is written without `source_url` or `resolution_number`** (unit-tested).

### PR-07 — Search index & query layer · **Opus**
`program_search` table, `npm run search:rebuild` (transactional truncate+insert), the `searchPrograms(filters) → { results, facets, total }` interface, filter parsing/serialization to and from `searchParams`, facet-count queries, sorting, pagination.
**Deps:** PR-06.
**Accept:** all 8 facet groups return correct counts with cross-filtering semantics; free-text search is accent-insensitive; p95 < 150 ms on the full dataset; the interface is the only export other code may use.

**Phase 0 exit:** DB seeded with real national data; a rebuild script safe to re-run; nothing user-visible yet.

---

## Phase 1 — Public MVP (PR 08–17)

### PR-08 — `/carreras` browser, card view (Dirección 1) · **Sonnet**
Filter rail, result cards, header/count/sort bar, pagination, empty state, mobile filter sheet. URL-driven state. Server components except the mobile sheet.
**Deps:** PR-07, PR-03.
**Accept:** faithful to the Dirección 1 mockup at 1440 and 390; filters survive reload and back-button; no client-side data fetching; JS ≤ 150 kb gz.

### PR-09 — `/carreras` table view + comparador (Dirección 4) · **Opus**
View toggle sharing one filter state, dense sortable table, checkbox multi-select (max 4), sticky compare bar, `/comparar` page with difference highlighting, `localStorage` + URL sync, share-to-WhatsApp with a per-comparison OG image.
**Deps:** PR-08.
**Accept:** selection survives switching views and navigating to a detail page and back; `/comparar?ids=…` renders server-side and previews correctly when pasted into WhatsApp; `noindex` on `/comparar`; max-4 enforced with a clear message.

### PR-10 — Program detail page · **Sonnet**
`/universidades/[inst]/[program]`: hero, key facts, arancel block with `verified_at` and the 12-month hiding rule, accreditation block with source links, plan de estudio link, campus/map, admission calendar, CTAs (Solicitar info + WhatsApp), related programs.
**Deps:** PR-07.
**Accept:** every displayed fact shows provenance where the model has it; `sin_datos` renders as "Sin datos de acreditación", never as "no acreditada"; primary CTA visible without scrolling at 390px.

### PR-11 — Institution pages · **Sonnet**
`/universidades` index + `/universidades/[slug]`: profile, campuses, full program list with inline filters, contact block, accreditation summary.
**Deps:** PR-10.
**Accept:** all ~59 universities + institutos render; program list paginates; no N+1 queries.

### PR-12 — Career hubs & area pages · **Sonnet**
`/carreras/[carreraSlug]` (the primary SEO surface: "Medicina en Paraguay — N universidades"), `/areas/[areaSlug]`, and the gated `/carreras/[carrera]/[ciudad]` variant that only generates where supply justifies it.
**Deps:** PR-11.
**Accept:** each hub has ≥ 150 words of unique intro copy (not templated filler); city variants only generated above the supply threshold in `seo.md` §4; no two routes target the same query.

### PR-13 — Homepage · **Sonnet**
Hero + search, entry points by area, "carreras más buscadas", the accreditation explainer teaser, institution logo strip (real logos only), final CTA.
**Deps:** PR-12.
**Accept:** passes the 3-question hero test at 390px; LCP element not lazy-loaded; zero fabricated trust signals.

### PR-14 — Lead capture · **Sonnet → Opus review**
"Solicitar info" modal, `POST /api/leads` with rate limiting (per IP + per phone), honeypot, origin check, versioned consent, `age_bracket`, `leads` persistence, email notification, WhatsApp deep links with per-program prefill, `events` logging for `whatsapp_click`.
**Deps:** PR-10.
**Accept:** consent checkbox unchecked by default and required; no lead stored without `consent_at` + `consent_text_version`; rate limits verified; only minimum fields collected (see `risks.md` §R-06); spam submission blocked in a manual test.

### PR-15 — Legal & trust pages · **Sonnet → Opus review**
`/legal/privacidad`, `/legal/terminos`, `/legal/fuentes` (every data source listed and linked), takedown/contact path, cookie/analytics consent banner, the R-07 disclaimer wired site-wide.
**Deps:** PR-04.
**Accept:** privacy policy names purpose, recipients, retention (24 months) and a working deletion request path; `/legal/fuentes` lists CONES, ANEAES, datos.gov.py, MEC with links.

### PR-16 — SEO pack · **Sonnet → Opus review**
`generateMetadata` on every route, canonicals, JSON-LD (`WebSite`+SearchAction, `CollegeOrUniversity`, `Course`, `ItemList`, `BreadcrumbList`, `FAQPage`), sitemap index split at 5k URLs, OG image generation, `hreflang` not needed (single locale) but `lang="es-PY"` set.
**Deps:** PR-13.
**Accept:** the `seo-web-builds` §6 checklist passes in full; every JSON-LD block mirrors visible content; no `aggregateRating` anywhere; sitemap contains only indexable 200s.

### PR-17 — Analytics & first-party events · **Sonnet**
Plausible/GA4, `events` table writes for `offering_view`, `whatsapp_click`, `compare_add`, `lead_submit`, `profile_view`, session hashing, and an internal `/admin/stats` read-only view.
**Deps:** PR-14.
**Accept:** events recorded without PII; session hash not reversible; analytics respects the consent banner.

**Phase 1 exit:** live on educacion.com.py, indexed, complete index browsable and comparable, leads landing in the DB.

---

## Phase 2 — Backend, admin & institution portal (PR 18–24)

### PR-18 — Auth foundation · **Opus**
`iron-session`, bcrypt, `users` + `institution_members`, `requireRole()`, `scopeToInstitution()`, login/logout, password reset by email, session hardening, first admin bootstrap script.
**Deps:** PR-02.
**Accept:** `requireRole` and `scopeToInstitution` unit-tested including the negative cases; cookies httpOnly/secure/sameSite; no role information trusted from the client; seeded default credentials impossible to leave in place (bootstrap forces a password change).

### PR-19 — Admin CRUD: core entities · **Sonnet → Opus review**
`/admin` shell + CRUD for institutions, campuses, careers, programs, offerings. Shared table/list component, one form component for create+edit, `activity_log` on every write. Includes the **file-upload decision from `risks.md` §R-08** (R2/Bunny or persistent path) for logos.
**Deps:** PR-18.
**Accept:** every mutation calls `requireRole`; every write logs before/after; uploaded logo survives a simulated redeploy; search index rebuild triggered after writes.

### PR-20 — Admin: prices, accreditations, admissions & moderation queue · **Sonnet → Opus review**
CRUD for `prices`, `accreditations`, `admissions`; the import moderation queue (approve/reject/merge conflicts from PR-06); bulk verify action; staleness dashboard.
**Deps:** PR-19.
**Accept:** accreditation form refuses to save a positive status without a source; approving a conflict writes through the same code path as the importer; queue handles a full import cycle without manual SQL.

### PR-21 — Institution portal `/panel` · **Opus**
Dashboard, edit own programs/offerings/prices/admissions (scoped), submit-for-review workflow for fields we curate, member management for `institution_admin`.
**Deps:** PR-18, PR-20.
**Accept:** an institution user cannot read or write any other institution's data — verified by a test that attempts it directly against the route handlers, not just the UI; changes to curated fields enter review rather than publishing directly.

### PR-22 — Claim-your-profile flow · **Opus**
Public "¿Es tu institución?" CTA, email-domain verification, tokenized claim link, admin approval fallback for mismatched domains, `claims` table.
**Deps:** PR-21.
**Accept:** claim only completes from an email on the institution's verified domain or after explicit admin approval; tokens single-use, hashed at rest, expiring in 72 h.

### PR-23 — Lead inbox & delivery · **Sonnet → Opus review**
`/panel/leads` list + detail, status transitions, CSV export, email digest, delivery retry, `lead_intent` (WhatsApp click) counts.
**Deps:** PR-21.
**Accept:** leads scoped to the owning institution; export contains only that institution's leads; retry is idempotent; free-plan institutions see counts but not contact details.

### PR-24 — Dispute & right-of-reply · **Sonnet**
Institution-initiated dispute on an accreditation or price record → flips the badge to "en revisión", notifies admin, resolution workflow (`risks.md` §R-09, §R-14).
**Deps:** PR-21.
**Accept:** a dispute changes public display within one page revalidation; resolution is logged; public record retains provenance.

**Phase 2 exit:** an institution can claim, correct and receive leads without you touching the DB.

---

## Phase 3 — Monetization (PR 25–29)

### PR-25 — Plans, subscriptions & entitlements · **Opus**
`plans` + `subscriptions` tables, `lib/entitlements` (single source of truth for feature gating), band logic by program count, admin UI to activate/renew a subscription with an invoice reference.
**Deps:** PR-21.
**Accept:** every gated feature checks entitlements server-side; downgrading immediately revokes gated features; no pricing logic duplicated in components.

### PR-26 — `/para-instituciones` sales page · **Sonnet**
Value proposition, the plan table from `monetization.md` §3, real screenshots of the panel, FAQ, contact/demo CTA.
**Deps:** PR-25.
**Accept:** prices match `plans` in the DB (rendered from it, not hardcoded); no fabricated customer logos or testimonials.

### PR-27 — Verified & Destacado presentation · **Sonnet → Opus review**
"Perfil verificado" badge, enhanced profile blocks (photos, video, longer description), `plan_rank` ordering in search results with a **visible "Destacado" label**, area-page placements.
**Deps:** PR-25, PR-07.
**Accept:** paid placement is always visibly labelled; default sort remains relevance-based with `plan_rank` as a tiebreaker only — never overriding a filter the user set; disclosure line present on results pages.

### PR-28 — Institution analytics dashboard · **Sonnet**
Views, WhatsApp clicks, leads, comparador appearances, month-over-month, per-program breakdown, exportable monthly report PDF/CSV — the artefact used in renewal conversations.
**Deps:** PR-23, PR-17.
**Accept:** numbers reconcile with `events`; free-tier sees a limited version (this is the upsell); no cross-institution leakage.

### PR-29 — Billing ops & renewals · **Sonnet → Opus review**
Manual invoice reference tracking, renewal reminders (90/30/7 days), past-due state and its effect on entitlements, admin revenue view.
**Deps:** PR-25.
**Accept:** past-due degrades to free-tier features after a configurable grace period; reminders idempotent; no payment gateway integrated (deliberate — see `monetization.md` §5).

**Phase 3 exit:** first paid institution invoiced and live.

---

## Phase 4 — Depth & growth (PR 30–34)

### PR-30 — Editorial system & the accreditation hub · **Sonnet**
`/blog` (MDX or DB-backed), `/acreditacion` hub, and the "¿Está acreditada tu carrera?" checker tool. Internal linking rules from `seo.md`.
**Deps:** PR-16.
**Accept:** every post links to at least one money page with descriptive anchor text; `Article` + `Person` schema; the checker reads live accreditation data with sources.

### PR-31 — Becas module · **Sonnet**
`becas` entity, listing, filters (institución, área, tipo, monto), detail pages, deadlines, `ItemList` + `BreadcrumbList` schema.
**Deps:** PR-30.
**Accept:** only real, sourced becas; deadlines auto-expire; no fabricated amounts.

### PR-32 — Salida laboral & empleos relacionados · **Opus**
Qualitative `salida_laboral_md` per canonical career, plus real dated job postings matched to careers with attribution. **No salary or employability statistics** unless a citable source exists (`risks.md` §R-11).
**Deps:** PR-30.
**Accept:** zero numeric employability or salary claims without an on-page citation; job postings show source and date; expired postings hidden.

### PR-33 — Data-freshness system · **Opus**
Staleness scoring per record, the weekly admin digest, public "última actualización" surfaces, automatic hiding of stale aranceles, re-verification queue, all crons from `architecture.md` §10.
**Deps:** PR-20.
**Accept:** an arancel older than 12 months is not displayed anywhere, including the comparador and OG images; crons idempotent and secret-guarded.

### PR-34 — Performance, accessibility & CI budgets · **Sonnet → Opus review**
Lighthouse CI with budgets, bundle-size check in CI, a11y pass (keyboard nav through filters and the comparador, focus states, labels, contrast), image optimisation sweep.
**Deps:** all public pages.
**Accept:** LCP < 2.5 s, CLS < 0.1, INP < 200 ms on a throttled mid-range mobile profile; public JS ≤ 150 kb gz enforced in CI; comparador fully keyboard-operable.

---

## Summary

| Phase | PRs | Count | Opus | Sonnet | Sonnet → Opus review |
|---|---|---|---|---|---|
| 0 — Foundation | 01–07 | 7 | 4 | 3 | 0 |
| 1 — Public MVP | 08–17 | 10 | 1 | 6 | 3 |
| 2 — Backend & portal | 18–24 | 7 | 3 | 1 | 3 |
| 3 — Monetization | 25–29 | 5 | 1 | 2 | 2 |
| 4 — Depth & growth | 30–34 | 5 | 2 | 3 | 0 |
| **Total** | | **34** | **11** | **15** | **8** |

Sonnet writes **23 of 34 PRs (68%)** and, weighted by lines of code, closer to **80%** — the heavy-line-count PRs (pages, admin CRUD, components) are all Sonnet's. Opus owns the 11 PRs where a wrong decision is expensive to unwind, and reviews the 8 that touch data integrity, PII, access control or money.
