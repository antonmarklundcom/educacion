# Pull Request Plan

**Status (2026-08-20):** PR-01–36, PR-39 and PR-40–46 are merged; the rest of Phases 6–7
below are planned and not started. PR-37 and PR-38 were never used — the numbering jumped to 39 and the gap is
left as-is rather than backfilled, so branch names in git history stay truthful.

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
**Shipped as:** everything above except the two lead CTAs. "Solicitar info" needs `POST /api/leads` with versioned consent and rate limiting, and the WhatsApp CTA needs `institutions.whatsapp` with per-program prefill — both are PR-14's, which owns the lead pipeline end to end. The hero's primary CTA is "Comparar con otras universidades" (pre-selects the program in the comparador) and the slot is laid out for the lead CTAs. JSON-LD stays with PR-16 as planned.

### PR-11 — Institution pages · **Sonnet**

`/universidades` index + `/universidades/[slug]`: profile, campuses, full program list with inline filters, contact block, accreditation summary.
**Deps:** PR-10.
**Accept:** all ~59 universities + institutos render; program list paginates; no N+1 queries.
**Shipped as:** as specified, plus one interface decision — `/universidades` needed a list of _institutions_, which the search contract cannot produce (no institution facet), and the profile needed `institutions.website/email/phone/description`, which do not belong in `program_search`. `src/db/queries/institutions.ts` + `src/lib/institutions/` were added for those; all program, price and accreditation data still comes from `searchPrograms()`. See `architecture.md` §11.

### PR-12 — Career hubs & area pages · **Sonnet**

`/carreras/[carreraSlug]` (the primary SEO surface: "Medicina en Paraguay — N universidades"), `/areas/[areaSlug]`, and the gated `/carreras/[carrera]/[ciudad]` variant that only generates where supply justifies it.
**Deps:** PR-11.
**Accept:** each hub has ≥ 150 words of unique intro copy (not templated filler); city variants only generated above the supply threshold in `seo.md` §4; no two routes target the same query.
**Shipped as:** as specified, plus one gap the plan didn't have an answer for — `careers.description_md` and `areas.description_md` are editorial fields nobody has written yet (no admin UI exists before PR-19/20, and `seo.md` §8 lists this copy as first-90-days content work, not a PR-12 deliverable). Rather than fabricate 150 words per career to satisfy the acceptance bar today, a hub with no qualifying `description_md` (`src/lib/careers/copy.ts`, `MIN_EDITORIAL_WORDS = 150`) renders an honest paragraph built only from real `program_search` counts and ships `noindex, follow` until real copy lands — the page stays crawlable and starts indexing itself the moment an editor writes it, with no code change. The gated city variant has no such gap: its intro is composed entirely from the offerings already fetched for that city (institution names, modalities, price range, accreditation), so it is genuinely unique per city without being editorial, and ships indexed as soon as it passes the supply gate. The gate itself (`passesCityGate`, `src/lib/careers/index.ts`) and the career hub read the exact same `getCareerCitySupply()` query, so a city can never appear as a link on the hub and 404 underneath it.

### PR-13 — Homepage · **Sonnet**

Hero + search, entry points by area, "carreras más buscadas", the accreditation explainer teaser, institution logo strip (real logos only), final CTA.
**Deps:** PR-12.
**Accept:** passes the 3-question hero test at 390px; LCP element not lazy-loaded; zero fabricated trust signals.
**Shipped as:** every section specified, with "carreras más buscadas" renamed to what it actually is. We have no per-career search volume — `events` is counted by type, by day and by institution, and at launch it is empty — so the section ranks careers by published supply through an exact, bounded walk over the áreas (`src/lib/home/top-careers.ts`) and says on the page that the order is options, not popularity. Six other decisions are recorded in `design-system.md` §14: the page ships **zero client components** (the hero search is the existing `SearchBar` GET form, so it produces a real `/carreras` URL in the `FILTER_PARAMS` vocabulary and the route carries 0 B of route-level JS); there is no hero image, so the LCP element is the `h1`; the accreditation teaser's numbers come from `listInstitutions()` rather than the `vigente` facet, which also contains CONES habilitaciones; the teaser links to `/carreras?acreditacion=vigente` because `/acreditacion` is still a PR-30 placeholder; the logo strip renders real logos or disappears below six, with a plain `<img>` and the reason it is not `next/image` yet; and the fade-up reveal `design-system.md` §6 reserved for this page is deliberately not spent.

### PR-14 — Lead capture · **Sonnet → Opus review**

"Solicitar info" modal, `POST /api/leads` with rate limiting (per IP + per phone), honeypot, origin check, versioned consent, `age_bracket`, `leads` persistence, email notification, WhatsApp deep links with per-program prefill, `events` logging for `whatsapp_click`.
**Deps:** PR-10.
**Accept:** consent checkbox unchecked by default and required; no lead stored without `consent_at` + `consent_text_version`; rate limits verified; only minimum fields collected (see `risks.md` §R-06); spam submission blocked in a manual test.
**Shipped as:** as specified, plus the three CTA holes PR-08/PR-10/PR-11 left open — the result card gains "Solicitar info" (accent) and a WhatsApp icon button with "Ver carrera" dropping to secondary, and the detail hero's primary slot goes to the lead CTA with comparar moving beside it. Four design decisions are recorded rather than rediscovered: rate limiting is an in-process window plus a durable quota **derived from `leads` itself** rather than a `rate_limits` table (`architecture.md` §6.1); `whatsapp_e164` stays **off** the search contract and is fetched once per page (§6.2); the interfaces PR-23 and PR-28 build against are fixed now (§6.3); and both stored hashes are salted with a secret `PRIVACY_SALT`, the session one rotating daily and needing no cookie (§6.4). The table view still has no per-row "Solicitar" — its action is multi-select → comparar (`design-system.md` §13).

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
**Shipped as:** as specified. PR-14 had already built the write path (`recordEvent`, `POST /api/events`, the salted daily session hash), so this adds the callers — `offering_view`, `profile_view`, `compare_add` — the Plausible half and `/admin/stats`. Four decisions in `architecture.md` §12: the banner governs the **third-party** script and not the first-party `events` table, and why; views are reported from the browser rather than the render, so crawlers are not counted; the aggregation surface takes an optional `institutionId` so PR-28 needs no second set of queries; and `/admin/stats` **fails closed** behind `ADMIN_STATS_TOKEN` until PR-18 replaces the gate with `requireRole()`. The consent cookie, its format and the `ec:consent-changed` event are fixed now as the interface PR-15's banner writes against.

**Phase 1 exit:** live on educacion.com.py, indexed, complete index browsable and comparable, leads landing in the DB.

---

## Phase 2 — Backend, admin & institution portal (PR 18–24)

### PR-18 — Auth foundation · **Opus**

`iron-session`, bcrypt, `users` + `institution_members`, `requireRole()`, `scopeToInstitution()`, login/logout, password reset by email, session hardening, first admin bootstrap script.
**Deps:** PR-02.
**Accept:** `requireRole` and `scopeToInstitution` unit-tested including the negative cases; cookies httpOnly/secure/sameSite; no role information trusted from the client; seeded default credentials impossible to leave in place (bootstrap forces a password change).

**Shipped as:** as specified, with **two deliberate deviations** and **one deferral**, all recorded in `architecture.md` §7.1.

_Deviation 1 — `crypto.scrypt`, not bcrypt._ bcrypt is a native module compiled against the Node ABI at install time; this deploys to Hostinger's managed Node, where a platform upgrade turns every login into a 500 until someone SSHs in and rebuilds. scrypt is in the standard library at OWASP parameters, with a self-describing `scrypt$N$r$p$salt$key` hash so the cost can be raised later without invalidating existing hashes.

_Deviation 2 — PR-17's stopgap is gone._ `src/lib/analytics/admin-access.ts` and `ADMIN_STATS_TOKEN` are deleted and `/admin/stats` calls `requireRole(user, ['admin'])`, exactly as §12 said PR-18 would do.

_Deferred — password reset by email._ It needs a `password_reset_tokens` table (a schema change, and migrations run from a local machine) plus the first Resend integration in the codebase, and neither is testable from here. What ships instead closes the loop the bootstrap opens: `/cambiar-contrasena` re-authenticates with the current password, clears `must_change_password` and re-issues the cookie, so the one-time bootstrap credential buys exactly one sign-in. Until reset lands, a locked-out user is recovered by an admin. **Do not ship `/panel` to real institutions (PR-21) without it.**

Beyond the brief: `/admin` and `/panel` were static placeholders, which meant any guard added to them would never have run — both are now `force-dynamic` with a layout gate (`/admin` 404s, `/panel` redirects, because `/panel` is advertised publicly and its existence is not a secret).

### PR-19 — Admin CRUD: core entities · **Sonnet → Opus review**

`/admin` shell + CRUD for institutions, campuses, careers, programs, offerings. Shared table/list component, one form component for create+edit, `activity_log` on every write. Includes the **file-upload decision from `risks.md` §R-08** (R2/Bunny or persistent path) for logos.
**Deps:** PR-18.
**Accept:** every mutation calls `requireRole`; every write logs before/after; uploaded logo survives a simulated redeploy; search index rebuild triggered after writes.

### PR-20 — Admin: prices, accreditations, admissions & moderation queue · **Sonnet → Opus review**

CRUD for `prices`, `accreditations`, `admissions`; the import moderation queue (approve/reject/merge conflicts from PR-06); bulk verify action; staleness dashboard.
**Deps:** PR-19.
**Accept:** accreditation form refuses to save a positive status without a source; approving a conflict writes through the same code path as the importer; queue handles a full import cycle without manual SQL.
**Shipped as:** as specified. Five decisions the plan did not settle are recorded in `architecture.md` §14: an arancel is **superseded, not edited** (the previous current row becomes history in the same transaction), and `updatePrice` survives only as a _correction_, logged distinguishably — because an edit destroys the record of what we published last year, which is what a disputing institution asks about; retirement uses each table's honest field (`is_current = false`, `sin_datos`, `is_active = false`) rather than an `archived` status that would have been a restructure; `deriveEnrollmentStatus` is pure and exported so PR-33's cron and this module cannot disagree, with a narrower admission scope beating a wider one and a dateless period deriving `sin_datos` rather than `cerradas`; the citation rule is asserted **twice** on the admin path, in the form for the message and in the query module because the form is not the only caller; and `bulkVerify` is framed, capped, unselected-by-default and id-logged as a dated human assertion, since it is the one action that can quietly extend the life of a wrong number. The queue's "approve" calls the importer's own `insertEntity` / `updateEntity` — now exported from `src/db/queries/curation.ts`, which is the only change to PR-06's code — so an approved conflict cannot take a path the importer would have refused, and merge is approve with a narrower diff rather than a third write path.

### PR-21 — Institution portal `/panel` · **Opus**

Dashboard, edit own programs/offerings/prices/admissions (scoped), submit-for-review workflow for fields we curate, member management for `institution_admin`.
**Deps:** PR-18, PR-20.
**Accept:** an institution user cannot read or write any other institution's data — verified by a test that attempts it directly against the route handlers, not just the UI; changes to curated fields enter review rather than publishing directly.
**Shipped as:** as specified, with the decisions recorded in `architecture.md` §15. The review workflow reuses **PR-20's queue** rather than inventing a second one — an institution's request to change a register-derived field becomes a `curation_conflicts` row and is applied through the importer's own write path. Aranceles and convocatorias are deliberately **not** review-gated (the institution is the authority on its own commercial facts, and §6 of `plan.md` makes that the point of the panel); accreditation and `status` are **not editable at all**, the first because R-09 and the second because un-publishing a live programme is undetectable from outside. The access test (§15.2) found two real bugs before merge: the price action validated fields **before** authorizing, and the test's own first version passed with the guard deleted — it now canaries on writes rather than on "an error came back". **PR-18's deferral still stands:** `/panel` is built, guarded and tested but must not be announced to real institutions until password reset by email lands (§15.4); the invite form says so in plain words instead of promising a mail that never arrives.

### PR-22 — Claim-your-profile flow · **Opus**

Public "¿Es tu institución?" CTA, email-domain verification, tokenized claim link, admin approval fallback for mismatched domains, `claims` table.
**Deps:** PR-21.
**Accept:** claim only completes from an email on the institution's verified domain or after explicit admin approval; tokens single-use, hashed at rest, expiring in 72 h.

### PR-23 — Lead inbox & delivery · **Sonnet → Opus review**

`/panel/leads` list + detail, status transitions, CSV export, email digest, delivery retry, `lead_intent` (WhatsApp click) counts.
**Deps:** PR-21.
**Accept:** leads scoped to the owning institution; export contains only that institution's leads; retry is idempotent; free-plan institutions see counts but not contact details.
**Shipped as:** as specified, no schema change. `panel/leads.ts` layers free-plan
redaction (`institutions.plan_id → plans.rank`, `PLAN_RANK.gratis === 0`) on top
of PR-14's `LeadRecord`/`listLeadsForInstitution` interface rather than
widening it, so `/panel/leads/export` cannot forget the redaction the way a
second implementation could. `/api/cron/[job]` — a routing stub since PR-14 —
now handles `lead-retry` (hourly) and `lead-digest` (daily); the digest is a
live "leads waiting right now" snapshot rather than "since last sent", because
there is no persisted digest clock and this PR was told to ask before adding
one (`architecture.md` §10.1). `lead_intent` counts are the existing
`whatsapp_click` event aggregate (`architecture.md` §12), surfaced on
`/panel/leads` rather than duplicated.

**Reviewed 2026-08-20 (PR-46)**, by a session that wrote none of it, against
`agent-workflow.md` §5. All four acceptance criteria hold. Scoping was checked
by enumerating every surface that can reach a lead row — the list, the detail
page, the status action, the CSV export and the two crons — and confirming each
resolves the institution from the session rather than from the request;
`listLeadsForInstitution` has no unscoped overload, so an unscoped inbox query
cannot be written. The free-plan redaction was checked on all eight surfaces
that could show a lead, including the digest mail and the analytics screens, and
is decided from a **live** `getEntitlements` read, so a lapsed plan redacts on
the next request with no cron involved. No fabricated data anywhere in the path.
No cross-institution read was constructible.

**What the review changed.** Two guards were correct and untested — deleting the
redaction entirely, or downgrading `getPanelLead`'s ownership check so
`/panel/leads/<A's id>` rendered A's lead to B, each left 1084/1084 green;
`leads.access.test.ts` now pins both. `retryLeadDelivery` marked its whole batch
in one `UPDATE` after the loop, so a single failed write re-sent every one of up
to 200 students' contact details on the next tick, and the next; each lead is
now marked the moment its mail is accepted. `MAX_KEYS` in the in-process rate
limiter bounded nothing under a rotating-`x-forwarded-for` flood — the one case
it exists for — because only stale keys were evictable; it now evicts live ones
too. And the lead route logged raw mysql2 errors, which quote the student's own
row (`Duplicate entry 'ana@example.com' …`), now redacted.

**Filed, not fixed:** permanently undeliverable leads (an institution with no
email on file) sit at the head of the retry queue forever and can starve it.
Fixing it properly needs a `delivery_attempts` column, so it is a schema change
and its own PR rather than a widening of this one. Overlapping cron invocations
can still double-send; §10.1 now states that trade instead of claiming
idempotency by construction.

### PR-24 — Dispute & right-of-reply · **Sonnet**

Institution-initiated dispute on an accreditation or price record → flips the badge to "en revisión", notifies admin, resolution workflow (`risks.md` §R-09, §R-14).
**Deps:** PR-21.
**Accept:** a dispute changes public display within one page revalidation; resolution is logged; public record retains provenance.
**Shipped as:** accreditation only, no schema change. `architecture.md` §15 — settled after this line was originally written — already gives an institution a faster remedy for a wrong price than a dispute could: it supersedes its own arancel directly from `/panel/ofertas`, live immediately, no waiting on staff. Building a second, slower path to the same write would be exactly the duplicate mechanism CLAUDE.md rule 10 warns against, so price disputes are deliberately not built; `db/queries/panel/disputes.ts` records the reasoning inline. The dispute record reuses `curation_conflicts` — the same reuse PR-21 established for review requests — distinguished from an import-pipeline conflict by `import_run_id IS NULL`, so `/admin/disputas` is a separate queue from `/admin/moderacion` rather than a filter on it (that queue's "approve" applies a proposed field diff; a dispute proposes nothing). `accreditations.is_disputed`, the column this PR was built against, was already wired into `lib/search/accreditation.ts` and `rebuild-search.ts` before this PR started, so the public display change is a rebuild, not a "business day" — it happens in the same request that files the dispute.

**Phase 2 exit:** an institution can claim, correct and receive leads without you touching the DB.

---

## Phase 3 — Monetization (PR 25–29)

### PR-25 — Plans, subscriptions & entitlements · **Opus**

`plans` + `subscriptions` tables, `lib/entitlements` (single source of truth for feature gating), band logic by program count, admin UI to activate/renew a subscription with an invoice reference.
**Deps:** PR-21.
**Accept:** every gated feature checks entitlements server-side; downgrading immediately revokes gated features; no pricing logic duplicated in components.
**Shipped as:** as specified, with **one schema change beyond the brief** and **two corrections to `monetization.md` §3**, all in `architecture.md` §17 and `monetization.md` §7.

The tables already existed from PR-02, so the schema work was the opposite of adding: migration `0004` **drops `institutions.plan_id`**. A plan pointer on the institution cannot say _until when_, so it could only agree with the subscription rows by accident — and it had two live readers (PR-23's lead redaction, `rebuild-search`'s `plan_rank`), which is exactly how a second source of truth gets used before anybody notices it is one. The same migration adds `subscriptions.invoiced_amount_pyg` (we quote in USD and invoice in guaraníes — `monetization.md` §5 asked for this column and nothing had it) and an index on `ends_on` for PR-29's sweeps.

`resolveEntitlements` is pure and is where every expensive-to-reverse rule about money lives: `cancelled` never counts even inside its paid period, a lapsed period stops granting **without any cron**, `past_due` counts only inside a grace window measured from `ends_on` (0 days here; PR-29 owns making it configurable), and features **union** across subscriptions because Destacado is an add-on held alongside Verificado. `program_search.plan_rank` is the single derived copy, recomputed by the same resolver on every subscription write and nightly — so it can affect ordering for a few hours at most, never a badge, which PR-27 reads live.

The two corrections: **editing your own data is free for every institution** (§3 said Gratis meant "no editing"; `plan.md` §6 and `risks.md` §R-03 make charging for the correction of a wrong price the one trade this product cannot make), and **the lead delivery email is never gated** (§3 said Gratis meant no lead delivery; the consent text promises the student their data reaches the institution they chose, so gating it would make our own consent text false). What a plan buys is presentation, reach and the lead _inbox_ — contact details, export, status workflow.

Billing is `admin`-only including the read, `assertClaimed` gates activation (§16.5), and `seed:plans` writes the §3 price list idempotently.

### PR-26 — `/para-instituciones` sales page · **Sonnet**

Value proposition, the plan table from `monetization.md` §3, real screenshots of the panel, FAQ, contact/demo CTA.
**Deps:** PR-25.
**Accept:** prices match `plans` in the DB (rendered from it, not hardcoded); no fabricated customer logos or testimonials.
**Shipped as:** as specified except the screenshots, which are **deferred rather than faked**, and the deferral is the PR's one real decision. A useful screenshot of `/panel` is a capture of a real institution's own data taken from a real signed-in session; there is no such account yet, and a mocked panel populated with a plausible university and plausible aranceles would be a fabricated screenshot of a product claim — CLAUDE.md rule 1 applies to marketing assets exactly as it applies to the comparador. `PANEL_SHOTS` in the page is the empty slot: fill it with real captures and the section appears with no other change. Until then the section says why there are none and offers a live demo, and the panel is described section by section in the wording `PanelNav` uses.

Prices render from `plans` through `listPlans()`, and the **feature ticks render from `FEATURES_BY_RANK`** — the same matrix the server gates on — so the page cannot promise something the server would refuse. An unseeded `plans` table produces an honest "escribinos" line, never a hardcoded fallback price. There are no logos, no testimonials, no customer counts and no "empresas que confían en nosotros" strip, for the same reason PR-13 refused the homepage logo strip below six real logos.

Two things the page states that are worth having in writing: the free tier still receives the lead **email** (the consent text promises it — `monetization.md` §7), and paid placement is always labelled and never overrides a filter or a sort the student chose. No JSON-LD: `FAQPage` markup belongs to PR-16's SEO pack, which has not shipped, and inventing the codebase's first JSON-LD convention inside a sales page is not this PR's concern.

### PR-27 — Verified & Destacado presentation · **Sonnet → Opus review**

"Perfil verificado" badge, enhanced profile blocks (photos, video, longer description), `plan_rank` ordering in search results with a **visible "Destacado" label**, area-page placements.
**Deps:** PR-25, PR-07.
**Accept:** paid placement is always visibly labelled; default sort remains relevance-based with `plan_rank` as a tiebreaker only — never overriding a filter the user set; disclosure line present on results pages.
**Shipped as:** the badge, the label and the disclosure, plus **one feature removed from the plan rather than faked**. `architecture.md` §17.1 has the detail.

`plan_rank` orders; `getPlacementFlags(ids)` labels — live, one query per results page. A label is a claim about a commercial relationship at the moment the page renders, and `program_search.plan_rank` is a nightly-refreshed copy; nothing in the label path reads it. (PR-46 verified that claim across every consumer and it holds — but `placement.test.ts`, cited here as the pin, varies `plans.rank` rather than the index column, so it was never the guard this sentence said it was.) The ordering half needed no work: PR-07 built `plan_rank` as a trailing tiebreaker and `engine.test.ts` asserts that a Destacado row never jumps ahead of a cheaper one and never enters a filtered set it does not belong in — **though PR-46 found both of those tests vacuous and rewrote them, and found the boost itself going to a plan that had not bought it.**

**`enhanced_profile` is gone from the feature matrix.** PR-25 declared it for "logo, fotos, video y descripción larga"; there is no media schema, no upload path and no panel screen for any of that, and the logo and description are already shown for every institution — so the only ways to "gate" it were to hide public information from students or to tell an institution we would not display what it wrote. An empty row on a price table is a promise we cannot keep, so the key was removed and comes back with the migration that creates institution media (`monetization.md` §7, correction 0).

**Area-page banner placements are not built**, and deliberately: they need a placement table (which institution, which área, which period) that no schema has, and building one would create a second way to sell placement alongside the subscription. Destacado is a labelled tiebreaker wherever results appear.

**Reviewed 2026-08-20 (PR-46)**, by a session that wrote none of it — the review this PR was labelled for and never got, having been written and reviewed by the same session that wrote PR-25.

**It found a blocker, and it is the one this PR existed to prevent.** `plan_rank` was written from the entitlement's *rank*, so **Verificado** — which does not buy `priority_placement` (`monetization.md` §7) — was boosted on every default-sorted page, where §4.1 says every row ties on relevance and the tiebreaker decides the whole result. `placementFlags().destacado` is `false` for those rows, so they carried **no "Destacado" badge and triggered no `PlacementDisclosure`**: paid, unlabelled ranking, which §3 closes by naming as the one practice that "destroys the only asset you have". `planRanksByInstitution` now gates on the entitlement, and `rebuild-search.plan-rank.test.ts` asserts the equivalence directly — a row is boosted **iff** the label path would label it — so the two halves cannot drift apart again.

**Three more surfaces were placing without labelling**, all now fixed: the programme page's "carreras relacionadas" block (chosen by `plan_rank` alone out of fifteen candidates — the highest-value internal link on the page), `/acreditacion`'s result list (ordered *and truncated* by it), and, in the opposite direction, the institution profile, which printed "Destacado" on every row of a single-institution list where no placement had occurred. §17.1's rule cuts both ways.

**And the test that was supposed to pin the ordering criterion was vacuous.** Promoting `plan_rank` to the *primary* sort key — paid placement fully overriding the user's choice — left all 28 tests green, because the fixture has enough rank-2 rows to fill the page the test scanned. It is now a property over every cross-rank pair, plus a filtered-set test that names a boosted excluded row instead of re-checking the filter.

**What holds, verified rather than assumed:** `plan_rank` is appended after the user's key for all seven sort keys (each `case` checked, not just the default), never enters `buildConditions`, and cannot promote a priceless Destacado row past a priced one under `arancel_asc`; `offering_id` closes both chains so pagination is stable. Nothing in the label path reads `program_search.plan_rank` — checked across every consumer in `src/components`, `src/lib/seo` and `src/app`. Band boundaries match §3 exactly. Rule 7 is not violated: `VerifiedBadge` uses `bg-accent-subtle`, which `design-system.md` prescribes for badges, never `#0d6e86` itself.

### PR-28 — Institution analytics dashboard · **Sonnet**

Views, WhatsApp clicks, leads, comparador appearances, month-over-month, per-program breakdown, exportable monthly report PDF/CSV — the artefact used in renewal conversations.
**Deps:** PR-23, PR-17.
**Accept:** numbers reconcile with `events`; free-tier sees a limited version (this is the upsell); no cross-institution leakage.
**Shipped as:** as specified, with the PDF being the browser's print dialog rather than a rendering library, and one correctness decision the brief did not anticipate. `architecture.md` §18 has it all.

Solicitudes are counted from **`leads`**, not from the `lead_submit` event: the two can differ, and the row is both the truth and the number an institution can check against its own inbox — the page says so rather than presenting one as the other. `compare_add` needs a join to `program_search` to find its institution, which is a direct consequence of §12's decision not to widen a persisted client structure for an analytics need.

**Month-over-month means two different things.** A rolling 7/30/90-day window compares against the equally long window before it; the _monthly report_ compares against the previous **calendar** month, because July shifted back by its own 31 days lands on 31 May and counts a day of May as June. The first version of this PR had the second case wrong and the test caught it.

`deltaPct` returns null rather than a percentage when the previous period was zero — "subiste 100%" from nothing is arithmetic dressed as a result, and every institution's first month would be full of them.

**PDF:** `puppeteer` is a second Chromium on a shared Hostinger slot and a PDF layout library is a second layout engine to keep in sync forever, so the report page is designed to print instead — `print:hidden` shell, single column, selectable text. One layout, one set of numbers, no dependency.

The leakage test (`analytics.access.test.ts`) is aimed at the query parameters rather than at an error message: it records every value that reaches the database and fails if another institution's id ever appears, or if the session's own is missing. It also pins that no function in the module takes an institution id at all.

### PR-29 — Billing ops & renewals · **Sonnet → Opus review**

Manual invoice reference tracking, renewal reminders (90/30/7 days), past-due state and its effect on entitlements, admin revenue view.
**Deps:** PR-25.
**Accept:** past-due degrades to free-tier features after a configurable grace period; reminders idempotent; no payment gateway integrated (deliberate — see `monetization.md` §5).
**Shipped as:** as specified, with **one schema change** (migration `0005`, `subscription_reminders`) and the reminder recipient decided rather than assumed. `architecture.md` §19 has it all.

**Idempotency is the UNIQUE key `(subscription_id, period_ends_on, threshold_days)`,** not a flag: sending is inserting the row, a second run inserts nothing, and because the period end is in the key, renewing re-arms the 90/30/7. Reminders fire "at or inside" a threshold rather than on an exact day, so a cron that missed three days catches up instead of silently dropping a notice — the failure mode that would only surface as a missed renewal.

**The digest goes to the operator, not to the institution.** The sales motion is a WhatsApp thread, a meeting and a hand-issued factura (`monetization.md` §5); an automated "tu suscripción vence" to a university nobody has quoted yet is a dunning notice in a relationship that is not transactional. Adding the institution is a one-line recipient change once there is a quote to send.

**Past-due extends, it never revokes.** An `active` subscription that runs out already stops granting at `ends_on` — entitlements read dates, not statuses — so marking it `past_due` is what _starts_ the grace window. A sweep that fails to run can therefore only under-grant, never keep features nobody paid for. `BILLING_GRACE_DAYS` defaults to **15**, not 0: a bank transfer plus a hand-issued factura does not clear in a day, and an unparseable value falls back to the default rather than to 0 so a typo cannot cancel every customer.

**No cron cancels anything.** Grace expiry is reported and acted on by nobody: the subscription already grants nothing, and ending a commercial relationship is a person's decision.

`/admin/facturacion` says **contratado**, never cobrado — the app does not know whether a transferencia arrived. `activity_log.user_id` became nullable in the type as well as the column, so the sweep's writes are distinguishable from a person's forever.

**Reviewed 2026-08-20 (PR-46)**, by a session that wrote none of it. No blocker: no over-granting defect exists. `active` past `ends_on`, `past_due` inside and outside grace, `cancelled`, `past_due` with a null `ends_on`, an unstarted subscription and two overlapping subscriptions for one institution were each walked against a test, and the grace boundary is inclusive on the last day and null on the day after on both sides of the mirror (`resolveEntitlements` and `graceExpired`). `BILLING_GRACE_DAYS` was checked value by value — unset, blank, `"abc"`, `"-5"`, `"15.5"`, `"3650"`, `"0"` — and only unparseable or negative falls back, exactly as claimed. The reminder UNIQUE key exists in the schema **and** in the shipped migration, the insert cannot abort the sweep, and the row is written only after the mail is accepted, so a Resend outage delays a reminder and never loses one. No payment gateway anywhere.

**What the review changed.** `dueReminders` fired the *next-widest* unsent threshold once the narrowest had been consumed, so a subscription first seen five days out got three mails on three consecutive days — "faltan 4 días" under the 30-day heading, then "faltan 3 días" under the 90-day one — which is exactly the catch-up case the design exists for. It now takes the narrowest applicable threshold and nothing else. The sweep wrote `before: { status: 'active_or_trial' }` into `activity_log` — a value the enum cannot hold, invented and recorded as fact in the one table whose purpose is saying what happened (rule 1), and rendered to an operator since PR-44; it now logs the row's real prior status. `/admin/facturacion` counted **trials at list price** in "USD/año contratado" and put every free-plan row permanently into "vigentes sin referencia de factura"; the money aggregates are now `active` rows on priced plans, with trials counted in their own labelled tile. The three `billing.ts` reads could all be downgraded to `['editor']` with the suite green — now pinned. And `defaultOptions` let an explicit `{ graceDays: undefined }` collapse the window to zero.

**One correction reaches further back than PR-29:** every billing date was computed in UTC on a site whose day is `America/Asuncion`, so between 21:00 and midnight a subscription ending *today* already resolved to nothing — a paying institution losing its badge, its lead contacts and its placement three hours early on its last day. Always an under-grant, never an over-grant, which is why it survived. `asuncionToday()` (new here, beside PR-44's `parseAsuncionDay`/`nextAsuncionDay` and on the same stated offset) is now the single source, and `addDays` keeps its own UTC arithmetic — routing that through the new helper shifted every grace window a day and was caught by the boundary test.

**Phase 3 exit:** first paid institution invoiced and live.

---

## Phase 4 — Depth & growth (PR 30–34)

### PR-30 — Editorial system & the accreditation hub · **Sonnet**

`/blog` (MDX or DB-backed), `/acreditacion` hub, and the "¿Está acreditada tu carrera?" checker tool. Internal linking rules from `seo.md`.
**Deps:** PR-16.
**Accept:** every post links to at least one money page with descriptive anchor text; `Article` + `Person` schema; the checker reads live accreditation data with sources.
**Shipped as:** as specified, plus the admin editors that make it maintainable, and **one schema change** (migration `0006`, `posts`). `architecture.md` §20.

Posts are DB-backed rather than MDX — the writer is the operator, in a browser, and MDX makes every typo a deploy. The "no orphans" rule is enforced in `parsePostInput` rather than left to discipline: publishing is refused until the body links to a money page with anchor text that describes it. Markdown is a small subset **rendered to React elements**, never to an HTML string, so no sanitizer and no markdown dependency were added and an editorial `<script>` is text by construction.

The accreditation explainer is deliberately **in the page file, not the database**: it is what we assert about ANEAES and CONES, and R-09 makes that a thing to review in a diff. The checker is a GET form over `searchPrograms` — live badges with their sources, never "no acreditada" inferred from silence, and every answer has a shareable URL.

`/admin/blog` and `/admin/areas` follow the PR-19 form pattern; áreas expose the description and sort order only, since their slugs are in indexed URLs. The área list shows each description's word count against the 150 that decides `noindex`. JSON-LD begins here at three types (`Article`+`Person`, `BreadcrumbList`, `FAQPage`) as the shape PR-16 can extend; the sitemap gains the editorial URLs, which are the ones with no other way in.

### PR-31 — Becas module · **Sonnet**

`becas` entity, listing, filters (institución, área, tipo, monto), detail pages, deadlines, `ItemList` + `BreadcrumbList` schema.
**Deps:** PR-30.
**Accept:** only real, sourced becas; deadlines auto-expire; no fabricated amounts.
**Shipped as:** as specified, plus the `/admin` CRUD, and **one schema change** (migration `0007`, `becas`). `architecture.md` §21.

`source_url` is **NOT NULL** — the acceptance criterion as a column, not as a habit. Coverage is an enum with an explicit `sin_datos` and a CHECK tying the amount to it, so "cubre el 100%" cannot carry a guaraní figure and "parcial" cannot omit its percentage; the unknown case renders as "no sabemos cuánto cubre" rather than as blank space.

**Auto-expiry is a predicate, not a job**: a beca past its deadline leaves the listing and the sitemap the same day, because the query compares against the request's own date — a cron would leave a window in which a student plans around a date that has passed. A closed beca still renders at its own URL (`noindex, follow`) saying so, because the link may be in somebody's WhatsApp thread and a 404 teaches nothing.

`ItemList` + `BreadcrumbList` on the listing, `BreadcrumbList` on the detail. No `Offer` markup: the amounts here are somebody else's promise, not ours to mark up as a price.

### PR-32 — Salida laboral & empleos relacionados · **Opus**

Qualitative `salida_laboral_md` per canonical career, plus real dated job postings matched to careers with attribution. **No salary or employability statistics** unless a citable source exists (`risks.md` §R-11).
**Deps:** PR-30.
**Accept:** zero numeric employability or salary claims without an on-page citation; job postings show source and date; expired postings hidden.
**Shipped as:** as specified and no wider, with **one schema change** (migration `0008`, `job_postings`) and **no scraper**. `architecture.md` §22.

`salida_laboral_md` gains four suggested sections and, more importantly, the R-11 rule in the admin field label — the constraint cannot be enforced by a validator (no regex separates "cinco años de carrera" from "el 80% consigue trabajo"), so it is enforced where the writing happens. `hasSalidaLaboral()` treats an empty template as absent so a form somebody opened and saved does not render four empty headings.

`/carreras/[carrera]/empleos` shows the qualitative copy plus a few real, dated, attributed postings and then links to trabajo.com.py with the career pre-filled — no application form, no candidate profile, no employer account, no affiliate parameter. **The scraper is deliberately not built**: scraping a job board without an agreement answers a ToS question on somebody else's behalf and adds a parser to maintain against a site we do not control. The table, the attribution and the entry form ship; an integration can fill the same table later without changing the page.

Expiry reuses PR-31's predicate-not-cron rule (`expires_on`, or `posted_on + 45 days`), and `UNIQUE (url)` stops the same aviso being listed twice.

### PR-33 — Data-freshness system · **Opus**

Staleness scoring per record, the weekly admin digest, public "última actualización" surfaces, automatic hiding of stale aranceles, re-verification queue, all crons from `architecture.md` §10.
**Deps:** PR-20.
**Accept (rewritten in PR-33 — the policy reversed):** an arancel older than 12 months **is** displayed everywhere it used to be hidden — programme page, comparador, OG image — and **never without** a visible "dato desactualizado" and the month it was last verified; `Offer` JSON-LD still requires a price verified within 12 months; every public page that shows maintained data carries an "última actualización"; staleness is scored and ranked, not just counted; crons idempotent and secret-guarded; the 24-month lead purge really deletes.

**Shipped as:** the policy change plus the whole scheduled half of `architecture.md` §10. `architecture.md` §23, and the reasoning in `risks.md` §R-03.

The reversal in one line: hiding a stale number left the same number on the university's own site, unlabelled, while our page said nothing — so we now show it and date it. `priceFreshness()` replaced `isPriceDisplayable()`, `PriceSummary` carries `freshness` + `hasAmount` instead of `isDisplayable`, and `priceDisplay()` returns the amount **and** its warning in one call so a component cannot render one without the other. Stale prices also became filterable and sortable, because a visible number that vanishes from "hasta Gs. X" reads as a bug and hides the cheap options a family is hunting for.

Five crons landed: `rebuild-search`, `admissions` (a pure re-derivation through the admin's own `applyEnrollmentStatus`, so the precedence rule has one implementation), `staleness` (a weekly digest that reports and never acts — and stays silent when there is nothing to do), `purge-leads` (the one destructive job, keeping the promise `/legal/privacidad` makes), and `sitemap`, which answers `not_needed` because the sitemap is generated per request.

`scoreFreshness()` ranks the re-verification queue instead of counting it: overdue days × a stated weight, with a never-verified record scored as exactly one interval overdue rather than infinite — otherwise unverified rows bury the ones we published a number for and then let rot, which are the ones that actually mislead somebody.

### PR-34 — Performance, accessibility & CI budgets · **Sonnet → Opus review**

Lighthouse CI with budgets, bundle-size check in CI, a11y pass (keyboard nav through filters and the comparador, focus states, labels, contrast), image optimisation sweep.
**Deps:** all public pages.
**Accept:** LCP < 2.5 s, CLS < 0.1, INP < 200 ms on a throttled mid-range mobile profile; public JS ≤ 150 kb gz enforced in CI; comparador fully keyboard-operable.
**Shipped as:** the budget and the a11y rules **enforced in CI**; Lighthouse **on demand against a deployed URL**, not in the PR check, and that split is the PR's one real decision. `architecture.md` §24.

`npm run perf:budget` reads the manifest `next build` just wrote, gzips every chunk a route loads and fails when a public route exceeds 150 kB — no database, no server, runs in CI. `/admin` and `/panel` are exempt with the reason stated: staff tools on a laptop, where `useActionState` keeping a half-filled form alive is worth its kilobytes.

**Lighthouse cannot run in the PR check honestly.** Every SEO surface is `force-dynamic` against MySQL and CI has no `DATABASE_URL`, so a run there would audit error pages and report a number that means nothing — a green build that measured 500s is worse than no measurement. `lighthouserc.json` carries the budgets (LCP < 2.5 s, CLS < 0.1, TBT < 200 ms, a11y and SEO at 100) and `workflows/lighthouse.yml` is `workflow_dispatch` against a URL you pass it. **The acceptance thresholds are therefore configured and not yet measured** — the first real run needs a deployed site with real data.

Promoting `next/core-web-vitals`' a11y rules from warnings to errors found two real defects: `Button`'s anchor form spread its children so a link's text was invisible to the linter, and `LeadModal`'s backdrop was a `div` with a mouse handler that no keyboard could reach. One skip link in the root layout targets a `#contenido` wrapper in each of the three shells (three edits, not eighty), and `globals.css` gained a `:focus-visible` floor plus a global `prefers-reduced-motion` block.

### PR-35 — Password reset by email · **Opus**

The deferral PR-18 recorded and PR-21 restated: `password_reset_tokens`, the request form, the tokenised reset page, and the Resend mail.
**Deps:** PR-18, PR-21.
**Accept:** the request form answers the identical sentence for an unknown address, a suspended account and a real one, and writes **no row** in the first two cases; tokens hashed at rest, 60-minute TTL, single-use enforced by `UPDATE … WHERE used_at IS NULL`; opening the link does not spend it; a successful reset invalidates the user's other outstanding links and does **not** start a session; spent rows purged by the existing cron.
**Shipped as:** as specified. `architecture.md` §25, and §15.4 rewritten — the "do not open `/panel` to real institutions without it" block is lifted, and `/panel`'s invite note now points a new member at `/recuperar-contrasena` instead of at us.

This PR needs migration `0009_password_reset_tokens.sql`, which — like every migration in this repo — is generated in CI and applied from a local machine.

The one deliberate leak: a **send failure** is reported to the user, which is only reachable for an address that exists. The alternative is a locked-out person watching a success screen for a mail that is not coming, now that admin recovery is no longer the fallback.

### PR-36 — Accounts & onboarding without email · **Opus**

`/admin/usuarios`: create an account, issue a one-time access link, suspend and reactivate.
**Deps:** PR-35.
**Accept:** admin-only, asserted against `editor` with a write canary; an account is created inert (no password, `status='invited'`); the link is the PR-35 token, digest at rest, shown once and never logged; issuing one invalidates the previous; no link for a suspended account and suspending kills every outstanding one; an admin cannot suspend themselves.
**Shipped as:** as specified. `architecture.md` §26. No schema change — it reuses `password_reset_tokens`.

**Why it exists:** PR-35 closed the deferral but left every route into an account running through a mailbox — claims mail a token, reset mails a link, and the bootstrap script mints one staff account and then refuses to run again. With Resend unconfigured, nobody could onboard a single institution. This is the door that does not touch the network: the admin generates the link and hands it over by WhatsApp.

The link's TTL is **72 h, not the self-service hour**, because a member of staff verified who they are handing it to and the channel is not an inbox. Everything else about the token is identical, deliberately — one implementation of single-use, one redemption page.

### PR-39 — OG images for blog, becas and programme pages · **Sonnet** _(backfilled entry)_

Shipped before this entry was written — recorded here so `pr-plan.md` stays a complete map
of `main`. New route handlers `/og/blog`, `/og/beca` and `/og/programa` mirror
`/og/comparar`'s structure, dimensions and stale-price handling; `openGraph.images` and
`twitter` (`summary_large_image`) wired into the three detail pages' `generateMetadata`,
plus a `twitter` block in the root layout. Documented in `seo.md` §5.
**Deps:** PR-30, PR-31, PR-33.
**Accept (as shipped):** every OG image renders only real data; a stale arancel carries its
"dato desactualizado" warning inside the image exactly as on the page (the PR-33 rule).

Two unnumbered commits also live on `main` and are deliberately not retro-numbered: the
admin sidebar rework (`design-system.md` §16) and the PowerShell migration runbook
(`deployment.md` §3.1). They were maintenance, not plan items; this note is their ledger.

---

## Phase 6 — Hardening & SEO debt (PR 40–46) — planned

The 2026-08-19 audit found the build complete but carrying exactly the debt that matters
before the October–February traffic peak (`plan.md` §5): the money pages are not in the
sitemap, the primary catalog pages carry no structured data, every public request hits
MySQL uncached, login is the one endpoint without rate limiting, and production errors are
invisible. Phase 6 pays that down. **PR-40 and PR-41 come first; everything except PR-43
is independent and safe to run as a parallel batch.**

### PR-40 — Sitemap index for the catalog · **Sonnet** _(built by Opus 5)_

The sitemap PR-16 owed and never shipped (the current `src/app/sitemap.ts` says so in its
own comment): a sitemap index split at 5,000 URLs with children for careers, institutions,
programmes and the gated city pages, per `seo.md` §6, replacing today's static+blog+becas-only
file. The single highest-ROI change in the audit — the money pages exist and render but are
not being submitted for indexing.
**Deps:** none (all data queries exist).
**Accept:** every indexable public 200 appears exactly once across the children; nothing
`noindex` (comparador, closed becas, under-threshold hubs, gated-out city pages) appears at
all; `lastmod` comes from real row timestamps, never `now()`; index + children validate
against the sitemap schema; generation stays per-request (the PR-33 `sitemap` cron stays
`not_needed`) unless PR-43's caching decides otherwise, in which case the two PRs say so in
the same words.

**Shipped as:** as specified, with three decisions the brief left open. (1) **Route handlers,
not `sitemap.ts`.** Next's `generateSitemaps()` enumerates its children at build time and CI
builds without a `DATABASE_URL` (`architecture.md` §3), so the child set would have been
frozen to the empty build. `/sitemap.xml` and `/sitemap/[child]` are `force-dynamic` route
handlers instead; generation stays per-request and the PR-33 `sitemap` cron stays
`not_needed`, unchanged. (2) **Seven children, not four.** The brief lists careers,
institutions, programmes and city pages; `paginas` (the static routes), `areas` and
`editorial` are also indexable families and would otherwise have been dropped from the
sitemap this PR replaced. `/carreras/[slug]/empleos` is likewise indexable — it has a
self-canonical and no `noindex` — and rides in the `carreras` child with its hub. (3)
**`lastmod` omitted, not invented, for the static routes**: they have no row behind them, and
a synthesised timestamp would be the same lie as the `now()` the brief forbids. A city page
whose parent hub is itself below the editorial gate is excluded too — the gate alone would
have admitted an orphaned doorway under a `noindex` parent. The gates are imported from
`@/lib/careers`, never re-implemented, so `src/lib/seo/sitemap.ts` cannot drift from the
pages; it is pure and unit-tested (14 tests) with no database.

### PR-41 — JSON-LD on the primary catalog pages · **Sonnet → Opus review** _(built by Opus 5)_

The `JsonLd` helper (`src/lib/seo/jsonld.tsx`) exists and is used on blog, becas and
acreditación — but not on the three page types `seo.md` §5 calls the money pages. Wire:
`Course` + `CourseInstance` (+ `Offer` only where the price passes the 12-month freshness
rule) on programme pages; `CollegeOrUniversity` on institution pages; `ItemList` +
`BreadcrumbList` on career hubs; `WebSite` + `SearchAction` + `Organization` sitewide.
**Deps:** PR-40 (ship the sitemap first so indexing and rich results land together).
**Accept:** every block mirrors visible content only; no `aggregateRating`, no `review`,
anywhere, ever; `Offer` is emitted **only** with a `verified_at` inside 12 months — the
JSON-LD half of the PR-33 rule, unit-tested; pages with `noindex` emit no schema.

**Shipped as:** as specified, with two decisions the brief left open. (1) **The sitewide
blocks live on `/`, not in the layout.** Google reads `SearchAction` only from a site's
homepage, and the public layout also wraps `/comparar`, which is `noindex` — emitting schema
there would have broken this PR's own last acceptance criterion. (2) **`Offer` is withheld
from more than a stale price.** It ships only where the row composes an honest annual figure
— a recurring fee and an installment count — because `computeAnnualCost` returns the **bare
matrícula** for a matrícula-only row (the `annual_cost` generated column carries the same
CASE), and publishing that as an annual arancel would label an enrolment fee as a year of
tuition. It is also withheld where the row has amounts but no currency, since `priceDisplay()`
treats that as the honest gap and the page shows no number at all; and from a stale
"gratuita", an old free claim being as wrong as an old number.

`hasEditorialCopy()` and `priceFreshness()` are **imported** by the schema builders rather
than re-implemented, so the JSON-LD cannot drift from the page's own `robots` or from the
comparador and OG images. `siteUrl()` moved from `jsonld.tsx` to a JSX-free `site-url.ts`
(re-exported, so no import path changed) purely so the pure builders can be unit-tested —
vitest parses `.ts`, and nothing else needed a `.tsx` in that graph. 29 tests, database-free.

**Independent review** (a session that did not write the code, `agent-workflow.md` §5) found
three blockers, all fixed here and each now covered by a test that fails without the fix:
(a) the partial-price guard **did not exist** — its premise, that `computeAnnualCost` returns
`null` for a matrícula-only row, is false, and the original test passed only because its
fixture hand-set `annualCost: null`, a row the schema cannot produce; (b) `logo` prefixed the
site origin onto an already-absolute S3 URL, emitting
`https://educacion.com.pyhttps://cdn…`; (c) every institution was typed
`CollegeOrUniversity`, telling a search engine an instituto técnico is a university — a
status claim the page itself contradicts. It also flagged, and this PR fixes: a misused
`Schedule`/`repeatCount` as a duration (dropped — `timeRequired` already carries it),
Course-level `timeRequired`/`educationalCredentialAwarded` read off an arbitrary
`offerings[0]` (now emitted only where every offering agrees), `ItemList` emitted on
filtered/paginated/empty hub views against a canonical pointing elsewhere, duplicate
`ListItem`s for one programme taught at two sedes (deduplicated), and a re-typed href where
`offeringHref()` exists. A second review pass then caught that the `ItemList` gate was still
incomplete — `countActiveFilters()` counts neither `q` nor `sort`, so a text search or a
re-sort slipped through the "canonical view only" claim the first fix had already written
into this file; both are now checked explicitly, and the currency rule was made uniform for
`isFree` rows. Not taken: adding `Course.description`, which
Google wants for the rich result — there is no programme description on the page to mirror,
and inventing one is rule 1. The hub `ItemList` order follows `searchPrograms`, which sorts
`planRank` first, so paid placement influences the emitted positions; it mirrors the visible
order and the page carries `PlacementDisclosure`, and is recorded here as a conscious choice.

**Not done, deliberately:** the brief's §5 table also lists `BreadcrumbList` on programme
and institution pages, and `ItemList` on `/areas/[area]` and `/universidades`. This PR's own
scope line names only the four blocks above, so those are left for a follow-up rather than
widened into here — both pages already render visible breadcrumbs, so it is wiring, not
design.

### PR-42 — Login rate limiting & route-group error boundaries · **Sonnet → Opus review** _(built by Opus 5)_

The audit's one security inconsistency: `checkRate` already guards password reset, leads
and claims, but `/ingresar`'s `loginAction` calls `authenticate()` bare. Wire the same
two-tier limiter (per hashed IP, plus per-email) into login. Same PR, second small concern
of the same "harden the shell" kind: `error.tsx` boundaries for the `(public)`, `admin` and
`panel` route groups, so a crash deep in one shell fails inside that shell instead of
falling to the root boundary.
**Deps:** none.
**Accept:** the limiter never changes the uniform login error message or its timing
behaviour (`src/lib/auth/login.ts`'s decoy-hash design stays intact); limits unit-tested
including the negative case; a thrown error in a panel page renders the panel boundary with
the disclaimer footer still present; no boundary leaks stack traces in production.

**Shipped as:** specified as "per hashed IP, plus per-email"; shipped as **per hashed IP,
plus per hashed (address, IP) pair**, which is the one deliberate deviation and the reason
this entry is long. A global per-address counter with a hard refusal is a remote account
lockout: the key is a string the attacker types, `checkRate` charges rejected attempts too,
so ~21 requests an hour from one ordinary IP — no header spoofing — holds any named account
blocked indefinitely, with the victim's own retries topping the window up. Online guessing is
already bounded by the KDF's cost; locking a paying institution out of its panel during
admissions is not. Keying on the pair keeps the realistic protection and raises a
lockout's price from "know the address" to "know the address *and* the IP it will be used
from" — a higher bar, not an impossibility, since `x-forwarded-for` is forgeable. Full reasoning in `architecture.md` §6.1.1.

Second deviation, same kind: **a success costs nothing.** `checkRate` records every attempt
including successes, which would let a school lab or cyber café behind one NAT lock itself
out by signing in — the exact case §6.1 says the limits must tolerate. The first attempt at
this peeked and charged the failure afterwards, which the review measured as a total bypass:
three `await`s sit between peek and charge, so 50 concurrent requests against a cap of 5 all
reached `authenticate()`. The attempt is now charged at decision time (atomic, both calls
synchronous and adjacent) and *refunded* on success — the pair key cleared, the single IP
timestamp given back — and refunded again if the lookup or the hash comparison throws, so a
database blip does not spend a waiting user's quota. The cost of charging first is that the
per-minute rules become concurrency caps as well; `LOGIN_IP_RULES`' burst limit is 30 rather
than 10 for exactly that reason, measured against 20 simultaneous correct sign-ins from one
NAT. This needed `peekRate`/`recordRate`/`clearRate`/`refundRate` alongside
`checkRate` in `src/lib/leads/rate-limit.ts`; the existing four callers are untouched, and
the new primitives have their own tests.

Three supporting changes. (1) `hashEmail()` in `src/lib/privacy/hash.ts`, because the key map
outlives the request and a plaintext address in it is PII we never agreed to hold; it
normalises case and whitespace, so capitalising a letter cannot buy a fresh quota. The same
argument applied to the pre-existing `console.warn` on a failed sign-in, which logged the
address in plaintext to a far more durable place than the map — it now logs the hash. (2)
the IP-hashing helpers consolidated into the privacy module, where `clientIp()`
already lived — `hashClientIp(Headers)` in `request.ts` and the server-only `clientIpHash()`
in `server-request.ts`, split so `request.ts` does not drag `next/headers` into the import
graph of `lib/leads` and `lib/events`. The login, reset **and claim** actions now share one
implementation, where there had been three that already differed. (3) The four boundaries
share one `ShellError` client component so the rule that matters is written once: **nothing
derived from the error reaches the page** — not `error.message`, which on a `force-dynamic`
route against MySQL is routinely a connection string or a failing SQL fragment, and not
`error.stack`. Only Next's opaque `digest`. The root boundary keeps its own `Footer`, having
no shell layout above it, and is the only one that sets `id="contenido"` — the three shell
layouts already render that id and the boundary renders inside it.

31 tests: 11 on the limiter, 14 on `loginAction` itself and 6 on the new shared primitives.
The action-level suite exists because a test that calls a helper twice and compares answers
is a tautology over its own fixture — it would pass unchanged if the limiter moved *below*
`findAccountByEmail`, which is what the "no enumeration oracle" claim actually rests on. Two
of its cases were written specifically to fail against earlier revisions of this PR: a
50-request concurrent burst, and a full run of failures after a success (a single trailing
failure passes with or without the settle, which is why the first version of that test proved
nothing).

**Independent review** (`agent-workflow.md` §5, two passes) found the global-per-address
lockout as a blocker, along with successes consuming quota, the duplicate `id="contenido"`,
the surviving third copy of the IP helper, and prose claiming two properties the tests did not
hold. The second pass then measured the concurrency bypass the first round's fix had
introduced, found that nothing tested the success-settling wiring at all, and found this
file and §6.1.1 again claiming more than the code delivered — "an attacker can only ever
block a pair they already control" is false where `x-forwarded-for` is forgeable. All fixed
here; the trade and what remains unsolved are recorded as `risks.md` §R-16, and the
server-only `clientIpHash` moved to `privacy/server-request.ts` so `request.ts` does not drag
`next/headers` into `lib/leads` and `lib/events`. It also found that `src/lib/privacy/hash.ts` contained a literal NUL byte in its
`join()` separator, which made git classify the file as **binary**: the entire `hashEmail`
addition, a new function on the PII path, showed only "Binary files differ" and was invisible
to review. The byte is now the `\u0000` escape; digests were verified unchanged against an
independent reimplementation, since `leads.ip_hash` values are stored.

### PR-43 — Caching layer for the public surfaces · **Opus**

The deferral `architecture.md` §8 recorded and PR-16/PR-34 restated: every public route is
`force-dynamic` against shared-host MySQL, which is the site's real performance risk at
peak. Decide and build the caching interface — `unstable_cache` (or on-demand ISR) around
the public read paths, **without** `generateStaticParams` (CI has no `DATABASE_URL`;
first-hit population + revalidation instead), invalidated by the admin/panel writes that
already call `revalidatePath` and by the nightly `rebuild-search` cron.
**Deps:** none, but lands before Phase 7 features add more read paths.
**Accept:** p95 on `/carreras`, a career hub and a programme page measurably drops on a
deployed environment (numbers recorded in `architecture.md`); a price superseded from
`/panel` and a dispute's "en revisión" badge are publicly visible within one revalidation,
same as today; stale-price warnings can never outlive a cache entry's price (one object,
per PR-33's `priceDisplay()` contract); cache keys include every searchParam that changes
the result.

**Shipped as:** the interface is `src/lib/cache/`, and `architecture.md` §27 is
the decision record the brief asked for. Four decisions the brief left open.
(1) **The cache sits around the read paths, not the routes.** The App Router's
full-route cache does not vary by `searchParams`, so `/carreras` — the heaviest
page and a pure function of its query string — could not have used ISR at all;
`unstable_cache` around `searchPrograms`, `getOfferingsByIds`,
`listInstitutions` and `getInstitutionBySlug` covers every public surface
instead, and the routes stay `force-dynamic`. `getPlacementFlags` and
`getWhatsappNumbers` are deliberately excluded: §17 and §6.2 already decided
those two are read live, and an hour is still a refresh clock.
(2) **One tag, not one per entity**, because one `program_search` row carries
the institution, the career, the city, the arancel, the badge and the
`plan_rank`, so for nearly any write the honest answer to "which entries could
this have changed?" is *any of them*. The expiry lives inside
`rebuildProgramSearch()`, which almost every catalog write already funnels
through, rather than at ~40 call sites.
(3) **The cache holds rows, never derived facts.** `toOfferingSummary(row, now)`
runs on every read, hit or miss, so `price.freshness` — the PR-33 warning — is
always this request's clock against the cached `verified_at`. The twelve-month
boundary falls at an arbitrary moment, so the test that pins it reads one entry
twice on either side of the boundary within one day.
(4) **`experimental.isrFlushToDisk: false`.** `unstable_cache` entries are
written to `.next/cache/fetch-cache` with no eviction, and the cache key comes
from the URL — an unbounded keyspace anybody can mint into, against a fixed
Hostinger disk quota. Memory-only makes LRU eviction the bound (§27.2.1).

**The p95 numbers are not recorded, and nothing was invented in their place.**
The measurement needs the real dataset on the real host, and this build
environment has neither a production database nor a deploy. §27.5 holds the
empty table, the exact command to fill it, and says plainly that it is
outstanding — **the operator records it after the next deploy**. This is the one
acceptance criterion PR-43 does not meet, and it is stated rather than papered
over (CLAUDE.md rule 1). The other three are met and each has a test that fails
without the code that meets it.

**Independent review** (`agent-workflow.md` §5, a session that wrote none of
this) found no blocker and five should-fixes, all fixed here. (a) The
"every catalog write funnels through `rebuildProgramSearch()`" invariant — the
reason one tag is enough — was **false**: claim redemption writes
`institutions.claimed_by_user_id`, which is not in the index and is
`isClaimed` on the newly cached institution profile, so a redeemed claim would
have left the public page telling the new owner to claim it for up to an hour.
That path now expires the cache itself, with a test; the docs name the remaining
exception (`npm run curate`, out of process) instead of claiming there is none.
(b) `expirePublicReads()` had **no test at all** — both guards could be deleted
with the suite green, because the only thing near it asserted a predicate
against its own hand-built error. It is now exercised inside Next's real work
storages: the tag genuinely lands in `pendingRevalidatedTags`, a call during
render still throws, and an unrelated error still propagates. (c) `JsonPlain`
caught `Date` and nothing else while three comments claimed it caught everything
JSON changes — a `Map` or an optional property would have passed. It now covers
`Map`, `Set`, `bigint`, `symbol`, functions and optional keys, and
`json-plain.test-d.ts` compiles one `@ts-expect-error` per kind so the claim is
checked by `tsc`. (d) A comment cited a `Wire extends JsonPlain<Wire>`
constraint that does not exist (it is circular — TS2313); the guard is `load`'s
return type and the comment now says so. (e) The unbounded, attacker-reachable
keyspace was not discussed at all — hence decision (4) and §27.2.1. It also
found two wrong cross-references, corrected in §27.

While here, two sentences elsewhere in `architecture.md` that PR-33 should have
updated and did not: §8 still said an arancel older than 12 months is **hidden**,
which CLAUDE.md rule 3 and §23 reversed; and §3's `force-dynamic` note now says
what PR-43 did and did not change. One-line corrections to statements this PR's
own code depends on, rather than a widened scope.

### PR-44 — Activity-log viewer & deletion-request tooling · **Sonnet → Opus review**

The audit's "built but orphaned" finding: `activity_log` records every write with
before/after snapshots and nothing renders it. `/admin/actividad` — filterable by entity,
actor and date, snapshots diffed, read-only. Plus the operator tooling for the R-06
deletion path: the request channel stays the documented email (deliberately not
self-service, `risks.md` §R-06), but executing one becomes a single admin action — look up
by the submitted phone/email, see every matching `leads` row, delete, logged.
**Deps:** none.
**Accept:** the viewer is `editor`-gated and strictly read-only; the deletion action is
`admin`-gated, removes the person's lead rows and any PII echoes, and writes its own
`activity_log` entry (actor, count, hashed key — never the deleted values); the R-06 table
in `risks.md` gains its row in this PR.

**Shipped as:** specified, with **one migration** (`0010`, two indexes, not applied yet) and
three decisions the brief left open. `architecture.md` §28 and `risks.md` §R-06 hold the
reasoning.

(1) **The viewer is `editor`-gated; three payload classes are not.** Four entity types —
`user`, `institution_member`, `subscription`, `personal_data` — have `admin`-only screens of
their own, and their snapshots carry what those screens carry. The **actor's email address**
is withheld the same way, for the same reason. The row stays visible to an editor either
way: that an account was created, by whom, when, is what an audit log is for. `claim` is
deliberately excluded from the list — `/admin/reclamos` is editor-gated and shows the same
address, so hiding it would protect nothing. The rule is "does another screen already refuse
this reader", not "does it look sensitive".

(2) **The restriction lives in the query, not the page.** An access-control rule rendered in
JSX is the layer CLAUDE.md rule 4 calls UX. `listActivity` returns the row this reader is
allowed to have.

(3) **The date filter reads in Asunción.** Rows render `America/Asuncion` and the column is
UTC, so a UTC-midnight bound dropped every entry after 21:00 local from the day it belongs
to. `parseAsuncionDay`/`nextAsuncionDay` are in `src/lib/format/date.ts` with the offset as
a documented constant (Paraguay abolished DST in 2024).

**Migration `0010` is generated but NOT applied** — `deployment.md` §3.1. It adds
`activity_log (created_at)` and `(entity_type, created_at)`: this PR is the table's first
reader and its default view was a full scan plus filesort over a table that grows with every
write and is never purged. Nothing on the site reads the new indexes to decide anything, so
the deploy is safe before or after.

**Independent review** (`agent-workflow.md` §5, a session that wrote none of it) found **one
blocker** and eight lesser items; all fixed here.

The blocker: the entries join `users` for "who did this", and the query handed an `editor`
`users.email` for every account that has ever written a row — **including institution
members**, whose address the same function was withholding one line below as
`institution_member` snapshot data. The withheld list was the PR's own headline rule and the
actor column walked straight around it. Fixed by moving both restrictions into
`listActivity`, which is also what fixed the review's separate finding that the redaction
existed only at the call site in `page.tsx`.

The review then mutation-tested the guards, and **four claims survived being deleted**:
(a) "exact match, never a prefix" — the fake database captured the `WHERE` and never read
it, so replacing `eq` with `LIKE '+59598%'` (the exact privacy incident `risks.md` names)
left all 20 tests green; the clause is now rendered through `MySqlDialect` and asserted.
(b) "the `DELETE` and the log entry are one transaction" — the fake `transaction` handed the
callback the connection back, so removing atomicity entirely was invisible; it now hands
back a distinct handle, and there is a rollback case where the log write throws.
(c) the read-only canary caught a write only on a path some other test walked — the reviewer
added a `redactEntry` export and the suite stayed green; the test now enumerates the module's
exports and calls each one.
(d) `personal_data`, the entity type **this PR introduced**, was missing from the withheld
list, and the test that was supposed to pin the list asserted a constant against a copy of
itself. The test now scans every `logActivity` call site under `src/db/queries` — literals
and constants — and fails until each entity type is classified.

Also fixed: `diffSnapshots` used `key in obj`, so a snapshot key called `constructor` or
`toString` reported a phantom change and handed the formatter a function (`Object.hasOwn`
now, plus a guard for a `before_json` holding a string or an array — the column is untyped
`json` and a 500 on the audit page is the worst possible time for one); a raw `discarded`
enum shown to a Spanish-speaking operator (rule 8 — the label map moved to
`src/lib/leads/labels.ts`, which also removed the duplicate in `/panel/leads`); a no-op
`revalidatePath` on a `force-dynamic` route; the deleted person's contact details staying on
screen after the deletion; and four doc sentences that claimed more than the code did.

### PR-45 — Observability: Sentry · **Sonnet**

Production errors currently die in Hostinger's console retention. Add `@sentry/nextjs`:
server + client capture, sourcemaps, env-gated DSN (absent DSN = fully inert, so CI and
local runs send nothing). One shared free-tier Sentry organization covers this and the
operator's other sites as separate projects; the SDK is in-process and adds zero processes
on the Hostinger slot.
**Deps:** none.
**Accept:** an error thrown in a server component, a Server Action and a client component
each arrive in Sentry with a readable stack; events carry **no PII** — no lead fields, no
emails, no session cookie contents (`beforeSend` scrubber, unit-tested); per-project rate
limit configured so a crash loop cannot eat the shared quota; bundle budget (`perf:budget`)
still passes on public routes.

**Shipped as:** the server half as specified. The client half **without
`@sentry/browser`**, which is the one deliberate deviation and the reason this
entry is long. `architecture.md` §29 has the whole record.

**Why no browser SDK.** Measured here, `import('@sentry/browser')` produces a
**144.5 kB gzipped** chunk — Replay, Feedback and BrowserTracing included,
because Turbopack does not tree-shake the package's index despite its
`sideEffects: false`. The public page budget is 150 kB *in total* (§9). An error
reporter larger than the application it reports on is not a trade this site
makes, and the person who would pay for it is the student on 4G in October that
§9 was written for. So the error boundaries post a **fixed five-string report to
`POST /api/client-error`**, and the server hands it to the Node SDK. Client
capture still works; the cost, stated in §29.1 rather than implied, is no
`window.onerror`, no unhandled-rejection capture and no breadcrumb trail. What
it buys besides the kilobytes is that the payload is an allowlist rather than
whatever the SDK collected — there is no field through which a lead's form data
could reach Sentry from a browser.

Measured, all three reproducible with `npm run build && npm run perf:budget`:
129.3 kB before, **129.9 kB** with no Sentry env (CI, local), 132.4 kB with a
DSN and an auth token. Budget 150 kB.

**Absent DSN = fully inert, in four places:** `serverDsn()` rejects a blank
value, the config skips `init`, `capture.ts` does not `import` the SDK at all,
and `next.config.ts` applies the build plugin only when a DSN *and* an auth
token are both present — so CI's `next build` runs no plugin and attempts no
upload.

**Not verified from here, and not asserted:** "an error in a server component, a
Server Action and a client component each arrive in Sentry with a readable
stack" needs a real DSN and project. The smoke test is `deployment.md` §8.1
step 5, next to the per-key rate limit the operator must set — which is also the
only half of the crash-loop protection that survives a process restart.

**Independent review** (`agent-workflow.md` §5, a session that wrote none of it)
found **three blockers** and six lesser items, all fixed here.

(a) **The new endpoint was an open tap on the shared Sentry quota.** The only
bound was "rate limited per hashed IP", and `hashClientIp` reads
`x-forwarded-for` — which the caller writes. `beforeSend`'s per-fingerprint
throttle was no backstop either: the fingerprint is derived from the `name` and
`stack` *in the report*. The reviewer demonstrated 300/300 forwards with a
rotating header and a per-request fingerprint. Now: a same-origin check, a
`content-length` gate, a byte cap (`Buffer.byteLength`, not `String.length` —
8 000 emoji is 32 kB), and, the bound that actually holds, a **process-wide
budget of 20 forwards a minute keyed on a constant**.

(b) **Anyone could forge a server incident.** `name` and `stack` were copied
verbatim onto a real `Error`, so a POST of
`{name:'DatabaseError', message:'ECONNREFUSED 127.0.0.1:3306'}` produced a
convincing "the database is down on /carreras" in the dashboard. The type is now
prefixed `ClientReported:` and every such event is tagged `unverified: true`.

(c) **The bridge to Sentry had no test at all** — wrapping its
`captureException` in `if (false)`, so that PR-45 reported nothing ever, left
the whole suite green. `capture.test.ts` now covers all of it.

(d) **`scrub.ts` called itself an allowlist and was a five-key denylist.** Its
own inline comment conceded it. That let `server_name` (`os.hostname()`, and
*not* covered by `sendDefaultPii: false`), `modules`, `threads` and
`attachments` through — and, worse, never looked at
`exception.values[].value`, which is where PII on this site most plausibly
appears: a mysql2 duplicate-key error is
`Duplicate entry 'ana@example.com' for key 'leads.email'`. It is now a real
top-level allowlist (keeping `debug_meta`, without which stacks are not
readable), plus a named pattern-denylist that redacts addresses and phone
numbers *inside* the message and keeps the sentence.

(e) **A bad `SENTRY_AUTH_TOKEN` produced a green, silent deploy with no
sourcemaps anywhere** — the plugin's failure handler is non-throwing by default,
`silent: true` suppressed the error line, and the local `.map` files were
deleted regardless. An `errorHandler` that throws makes it a failed build.

Also fixed: the 8 kB cap that only avoided the *parse*, not the *read*;
attacker-controlled strings reaching a console line unescaped (log-line forgery
on the no-DSN path, which is the default locally and in CI); a module-level
`NextResponse` singleton returned from every request; a throttle-eviction test
whose fixture was satisfied without the code it was testing; and four doc
sentences that claimed more than the code did.

### PR-46 — Review remediation: PR-23 / PR-27 / PR-29 · **Opus**

Three money-path PRs were merged carrying their own written caveat that the independent
review their _Sonnet → Opus review_ label promises never happened (PR-27 was even reviewed
by its own author). This PR is that review, performed by a session that wrote none of them:
the lead-redaction path (PR-23), the entitlement→label path and disclosure wording (PR-27),
and the reminder/grace sweeps (PR-29) — plus whatever fixes the review finds, in the same
PR if small, split out if not.
**Deps:** none. **Do this before Phase 7 builds on billing or leads.**
**Accept:** each of the three caveat paragraphs in this file is replaced by a dated
"reviewed by" note stating what was checked and what changed; any finding either fixed here
or filed as its own numbered PR; the going-forward rule lands in `agent-workflow.md`: a
_Sonnet → Opus review_ PR does not merge until a session other than its author has reviewed
it — CI green is not a reviewer.

**Shipped as:** the review, performed by **three** sessions that wrote none of the code —
one per PR, run in parallel — plus the fixes. Each PR's caveat paragraph above is replaced
by a dated "reviewed 2026-08-20" note saying what was checked and what changed; the
going-forward rule is `agent-workflow.md` §5.1.

**One blocker, in PR-27's path.** `plan_rank` was written from the entitlement's *rank*, so
**Verificado** — which does not buy `priority_placement` — was boosted on every
default-sorted page, where `architecture.md` §4.1 says every row ties on relevance and the
tiebreaker decides the whole result. `placementFlags().destacado` is false for those rows,
so they carried no badge and triggered no disclosure: **paid, unlabelled ranking**, the one
practice `monetization.md` §3 closes by naming as fatal. Fixed by gating on the entitlement,
and pinned by an equivalence test — a row is boosted **iff** the label path would label it —
so the two halves cannot drift apart again.

**Nine guards were correct and untested**, each verified by deleting it and watching the
whole suite stay green: the free-plan lead redaction, `getPanelLead`'s ownership check, the
three `billing.ts` role checks, `plan_rank`'s subordination to the user's sort, the
filtered-set guarantee **on the SQL path**, `MAX_KEYS`, and `defaultOptions`' grace window. That count is the argument for §5.1 existing —
`agent-workflow.md` §5.1 quotes the same nine.

**Six behavioural defects fixed.** A reminder cascade that mailed three notices for one
renewal, each labelled with a threshold the period had already passed. A fabricated
`'active_or_trial'` written into `activity_log` as if it were a real prior status (rule 1),
now readable by an operator since PR-44. Trial subscriptions counted at list price as
"USD/año contratado", and free-plan rows sitting permanently in the unpaid-invoice queue
(rule 1 again). `retryLeadDelivery` re-sending up to 200 students' contact details on every
tick after one failed write. `MAX_KEYS` bounding nothing under the rotating-IP flood it
exists for. And every billing date computed in UTC on a site whose day is
`America/Asuncion`, costing a paying institution its badge, its lead contacts and its
placement three hours early on its last day.

**Three surfaces were placing without labelling**, all fixed: the programme page's related
block, `/acreditacion`'s result list, and — in the opposite direction — the institution
profile, which printed "Destacado" on a single-institution list where nothing had been
placed.

**Filed, not fixed** (each needs more than this PR should contain): permanently undeliverable
leads can starve the retry queue, which needs a `delivery_attempts` column and therefore a
migration; and overlapping cron invocations can still double-send a lead, which is now
stated as a trade in `architecture.md` §10.1 rather than papered over as idempotency.

**Doc corrections in the same PR** (rule 10): `architecture.md` §10.1, §17.1 and §19 each
claimed a property its test did not hold; `monetization.md` §7 said a plan buys the CSV
export and the status workflow, which the code has never gated — the sentence moved to match
the code, and a new Correction 3 flags that §3 still sells two Destacado extras that were
never built and **must be edited before the next quote goes out**.

**Operational note for the next multi-reviewer round:** the three reviewers shared one
checkout and read each other's mutation-tests as their own. §5.1 says to give each its own
copy.

---

## Phase 7 — Growth & polish (PR 47–51) — planned

Independent quality-of-life and conversion work, deliberately after Phase 6's debt is paid.
All five are parallel-safe; none blocks another.

### PR-47 — i18n seam: the copy catalog · **Sonnet**

Not a language toggle — the seam that keeps one possible. A central message-catalog module
for UI copy, the highest-churn shared surfaces (header, footer, lead modal, browse
labels) migrated as the worked example, and the rule added to `CLAUDE.md`: **new copy goes
through the catalog, never inline in JSX.** The `src/lib/*/copy.ts` generator functions
(career/city intros) are explicitly out of scope — they are data-provenance copy with
Spanish grammar as logic, and rewriting them is a decision for a real second locale
(guaraní before English — `student-engagement.md` §4).
**Deps:** none.
**Accept:** catalog keys are typed (a missing key is a type error, not a runtime fallback);
migrated components render byte-identical Spanish; the CLAUDE.md rule is one sentence and
present; no i18n library added yet — the seam must not cost a dependency before a second
locale exists.

**Shipped as specified.** `architecture.md` §30 has the record. The catalog is a plain
object and lookup is property access (`copy.nav.searchCta`), which is what makes the
typing claim true rather than aspirational: there is no `t('key')` string lookup, so
there is no miss to fall back from and no way for a key to render as its own name. No
dependency added. Migrated: `Header`, `Footer`, `nav-links`, `LeadModal` and the browse
chrome — `SearchBar`, `SortControl`, `ViewToggle`, `ActiveFilters`, `EmptyState`,
`MobileFilterSheet`.

Byte-identical is a test, not a claim: `copy.test.ts` pins all 62 migrated keys to the
literal Spanish that was inline before, so editing a character while extracting it goes
red. The same test scans every leaf — functions included, called with markers — for the
tuteo forms rule 8 bans, and pins the R-07 disclaimer separately now that one string
feeds every footer. CLAUDE.md gains rule 12, one sentence.

Two boundaries drawn rather than discovered later (§30.4): the `copy.ts` generators stay
out, as the entry specified; and labels keyed by an enum the server also owns
(`LEAD_ERROR_MESSAGES`, `SORT_LABELS`) stay beside that enum, where a new variant is a
type error in the same file.

**What the perf gate caught, and the deviation it forced.** The catalog started as one
module and `perf:budget` rejected it at **+2.2 kB gzipped on every public route** — the
whole catalog, empty-state paragraphs included, in the shared browser chunk. The cause was
invisible in the diff: `Footer` imported the composed barrel, and `src/app/error.tsx` is a
client boundary that imports `Footer`. So the catalog ships as **one file per surface**
with `es-py.ts` composing them, and the rule is about the import graph rather than the
`'use client'` directive — anything a client boundary can reach imports its slice,
everything else reads `copy`. `client-bundle.test.ts` walks the transitive closure of every
client entry and fails if the barrel, `es-py.ts` or the server-only `browse.ts` is
reachable; `footer.ts` is allowed through, because the error page renders the footer and
rule 9's disclaimer is required there too. Shipped cost: **130.5 kB** on `/carreras` and
129.8 kB elsewhere against 129.9/129.2 before, all of it module overhead — the copy itself
was already in those bundles as inline JSX. Budget 150 kB.

### PR-48 — Total-cost calculator · **Sonnet**

On programme pages and the comparador: matrícula + cuotas + derecho de examen composed over
the programme's duration, per option — pure arithmetic over verified `prices` rows and
`duration_months`, the question every family actually asks. No new data collected.
**Deps:** none (PR-43 caching should be in first so the added reads are cheap).
**Accept:** a total renders **only** when every component amount exists and is current
enough to display; any gap renders the honest partial ("sin datos de matrícula — total
incompleto"), never an extrapolation; stale inputs carry the PR-33 warning on the total
itself; comparador totals sort correctly with incomplete rows last.

**Shipped as specified**, with the per-option requirement taken literally after review.
`architecture.md` §31 has the record. No schema change, no new query, no new cron:
`total-cost.ts` is arithmetic over the `PriceSummary` the search layer already returns plus
the offering's `durationMonths`.

`total = annual_cost × años + derecho de examen`, and the per-year half is
**`computeAnnualCost()` itself**, imported — `data-model.md` says that function and the
generated column must stay in lockstep, and a third copy here is how that stops being true.

Three decisions the criteria implied rather than stated:

- **A partial carries no figure at all** — not a lower bound, not a "desde", and not a
  component it does happen to hold. A floor reads as a total to anyone skimming, and this is
  the number a family budgets against.
- **A fractional year is undetermined, not missing.** It is reported, but worded as our
  limitation ("la carrera no dura un número entero de años, así que no sabemos cuántas
  matrículas se pagan") rather than as absent data. How often it fires is **not measured**:
  18- and 30-month programmes are ordinary at `tecnicatura` and `maestria` level and this
  environment has no database to count against.
- **"Sort with incomplete last" landed as a cheapest-column marker**, since the comparador
  orders columns by the URL and has no sort control. `cheapestTotalIndex` is built on
  `compareTotalCost` so the ordering has one definition, and the marker is withheld on a
  tie, on fewer than two complete totals, or on mixed currencies.

**What the independent review caught** (a session that wrote none of it, per §5.1 — this PR
is not in the review lane, but the arithmetic is money-adjacent enough to warrant one, and
it found ten things):

1. **`TotalCostBlock` had no test at all.** Replacing its stale-warning condition with
   `false` left all 1190 tests green — on the highest-stakes new surface in the PR. Fixed
   with `TotalCostBlock.test.ts`, rendering the component through
   `renderToStaticMarkup` (no new dependency; one line of vitest config for the JSX
   transform). Both guards now go red when removed.
2. **"A test pins the agreement with `computeAnnualCost()`" was false** — the test asserted
   against a fixture literal, and gutting `computeAnnualCost` left it green. The module now
   calls that function instead of restating the formula, and the test compares the two.
3. **`duracion_parcial` said "sin datos de duración" about rows that have a duration.**
   Reworded; the "overwhelmingly 48/60/72 months" claim in the docs was unmeasured and is
   withdrawn rather than defended.
4. §31.2's "only when matrícula, cuota, cuotas por año … are all present" contradicted the
   free branch. Corrected.
5. **The comparador showed a stale total as `· dato de mayo de 2026`** — provenance, not the
   warning rule 3 asks for. Now `· Dato desactualizado (mayo de 2026)`, and **the arancel
   cell was changed to match**: the two sit in one column and must not warn differently.
6. **The total was `offerings[0]`'s, on a page listing several sedes with different
   aranceles** — so not "per option" as this entry requires. `OfferingsBlock` now carries a
   total per sede, and the aside block names its sede when there is more than one.
7. **Four guards had no failing test** (`duration <= 0`, `currency == null`, the gap
   ordering, staleness on a partial). All four now do. The currency one mattered: without it
   the comparador emitted a bare "total incompleto" as a *non-gap* cell, eligible for the
   "el más barato" marker with no number in it.
8. **The free branch trusted `is_free` over the amounts.** `program_search` carries no
   `prices_free_has_no_fees` CHECK, so `is_free = 1` beside a matrícula turned a
   Gs. 22.650.000 carrera into a Gs. 150.000 one. Now refused as `incoherente`.
9. **A total of Gs. 0 with `is_free = 0`** stated a free carrera without saying so. It now
   says the amounts on file are all zero.
10. **`compareTotalCost` was dead code** documented as if it were live. `cheapestTotalIndex`
    is built on it.

Smaller, all applied: the cheapest marker used `text-ok`, which `globals.css` reserves for
status; the scope note now admits that some institutions charge differentiated aranceles
(`prices.notes_md` holds those and the calculator cannot read them); and `copy.test.ts` went
back to whole-object equality, with the PR-48 keys pinned in their own map, after the review
noted the subset comparison was a pre-existing guard loosened by an additive PR.

**Doc divergence fixed in passing** (rule 10, and the standing instruction that prose
overstating the code is a defect): six places still described the pre-PR-33 rule where a
stale arancel is hidden — `PriceSummary`'s doc comment, `prices.verified_at`'s schema
comment, `data-model.md` §PR-07, `PRICE_MAX_AGE_MONTHS`' comment, `/admin/frescura`'s header
— and one of them, `src/lib/legal/sources.ts`, is **user-facing copy on
`/legal/fuentes`** telling readers the opposite of what the site does. Those six now say
what the code does. **The sweep was under-scoped and fifteen more were found in PR-48b**,
which is why that entry exists.

### PR-48b — the second review pass on PR-48 · **Opus**

PR-48's second review landed after it merged, so its findings are a follow-up PR rather than
more commits on the same branch. Four defects, one of them money — and then PR-48b's own
independent review found seven more, which is the reason this entry is longer than the one
above it.

1. **`installments_per_year = 0` produced a complete total with every cuota deleted.**
   Gs. 22.650.000 rendered as Gs. 2.650.000 — no gap, no warning, eligible for "el más
   barato". `computeAnnualCost` multiplies by `coalesce(installments_per_year, 0)`, so a 0
   does not fail; it deletes the cuotas.
2. **Rule 3, in the branch PR-48 did not fix.** The comparador's arancel cell warned
   properly when it had a date and emitted only "Sin fecha de verificación" when it did
   not — a price shown with no warning at all.
3. **The PR-48 doc sweep was under-scoped**, including on `/legal/fuentes`, where the page
   contradicted itself paragraph to paragraph.
4. **PR-48's own per-option fix was untested**: deleting the per-sede total from
   `OfferingsBlock`, or the sede-name gate in the programme page, left all 1212 tests green.

**What the independent review then found, all fixed here:**

5. **The same defect class, twice more.** `prices` has **three** CHECKs, not two:
   `prices_non_negative` was not mirrored either, so a negative matrícula subtracted from
   the total exactly as silently (Gs. 17.650.000 for the same carrera). And
   `catalog-schema.ts` is a **second** boundary reading the same unconstrained copy — an
   `installments_per_year` of 0 published a Gs. 2.650.000 `Offer` to Google. There is now
   one statement of the rules, `priceCheckViolations()`, which `assertPriceIsCoherent`,
   `total-cost.ts` and `catalog-schema.ts` all read, so a fourth constraint cannot be
   missed by three modules independently.
6. **Rule 3 was still broken on both OG images** — the surface with the *least* context
   around it, read in a WhatsApp preview with no page attached. Same "Dato de mayo de 2026"
   string the PR had just removed from `PriceLabel`, duplicated in two route files.
7. **`PriceLabel` had no test**, and deleting its badge outright left 1231 green: the price
   on every result card, both table layouts, `RelatedPrograms` and `OfferingsBlock`. Now
   `PriceLabel.test.ts`.
8. **The área/ciudad intro printed a price range with no warning.** PR-48b removed the
   false clause ("con datos verificados en el último año") and put nothing in its place, so
   a range built from a 2024 price rendered bare. Rule 3 does not exempt prose.
9. **`/panel`'s replacement copy was false in the more dangerous direction** — it told an
   institution its *unpublished* prices were live on the site, and called never-verified
   rows "con más de 12 meses". The stat counts both; the copy says so now.
10. **§31.8 claimed `computeAnnualCost` has three callers.** It has one. The decision it
    justified is right and stands — the function is a mirror of a generated column and must
    not refuse what the column cannot — but the invented count is what made finding 5's
    `catalog-schema.ts` exposure invisible to the author.
11. **Seven more survivors of the hide rule**, including `architecture.md`'s "Two price
    predicates, deliberately" — which named `isPriceDisplayable()`, a function PR-33 deleted
    and that exists nowhere in the repo, and cited a `row.test.ts` assertion that does not
    exist. The dead `today` parameter that paragraph described is removed with it.

Smaller, all applied: the `computeAnnualCost` agreement test was a tautology (both sides
were the same call) and now asserts against literals; the comparador's "N de M datos
difieren" counted a differing arancel twice by counting its total as a second datum, so
derived rows no longer vote; `cuotas_por_ano`'s gap copy was a clause, making "sin datos de
matrícula y cuántas cuotas se pagan por año"; `GAP_ORDER`'s comment claimed an ordering it
does not control; three comments described files or pipelines inaccurately
(`TotalCostBlock.tsx` naming a `.tsx` test that is `.ts`, `TotalCostBlock.test.ts` calling
the transform pipeline unchanged when the PR added the `oxc` JSX line, `vitest.config.mts`
saying it matches `tsconfig.json` when tsconfig sets `jsx: preserve`); `withDisplayablePrice`
in the rebuild summary counts fresh prices and is named for it; and `eslint.config.mjs`
ignores `.claude/worktrees`, without which a reviewer's scratch checkout makes `npm run
lint` report 1234 errors that are not ours.

**One rule-1 fix taken in passing**, because it is the same surface and one conditional:
`/panel/ofertas/[id]` printed `formatMonthYear(price.verifiedAt ?? new Date())` — *today's*
month, presented to the institution as the date it last verified a price that has no date
at all. It now says it has none.

And `architecture.md` §31.7 no longer implies more than `renderToStaticMarkup` proves: a
substring in one component's HTML, in PYG, with no RSC pipeline exercised and nothing said
about visibility, since CSS is not applied. §31.8 is new and states the rule the whole
entry is about — **a module reading `program_search` re-asserts the constraints of the
table it was copied from**, because "the source table has a CHECK" is not a property of the
copy.

**Deps:** PR-48 (merged).
**Accept:** an impossible or negative amount never reaches the arithmetic, never renders a
figure and never reaches JSON-LD; no price renders anywhere without rule 3's words once it
is stale — cards, table, comparador, programme page, per-sede list, área/ciudad prose and
both OG images; every guard above has a test that goes red when the guard is removed; no
statement of the pre-PR-33 hide rule survives in `src/` or `docs/`.

### PR-49 — Panel: lead SLA nudges & in-panel plan status · **Sonnet → Opus review** · ✅ shipped

Two willingness-to-pay gaps in `/panel`. First: a lead sitting in `new` beyond 48 h is
visually flagged in the inbox, and the existing daily digest states the count — the status
pipeline exists, this makes neglect visible. Second: the institution's own plan, its
`ends_on` and the grace state rendered in `/panel` — today renewal state is visible only to
the operator (`monetization.md` §5's reminder stays operator-only; this is a banner, not a
dunning mail).
**Deps:** PR-46 (it touches the paths that review covers).
**Accept:** the nudge is derived at render from `created_at` + status, no new cron and no
schema change; plan status reads through `resolveEntitlements`' dates, never a cached rank;
free-tier institutions see their tier stated plainly with the `/para-instituciones` link —
no dark-pattern countdown.

**Shipped as:** `src/lib/leads/sla.ts` is the one statement of the 48-hour rule — the badge,
the dashboard tone, the inbox banner and the digest all read it, and the SQL that counts
overdue leads takes its cutoff from the same function rather than restating the threshold.
`src/lib/panel/plan-status.ts` is the plan banner's state machine, six states, taking an
`Entitlements` value and nothing else. Two things the review should check are pinned by
tests: the free tier's rendered sentences match no digit at all (`plan-status.test.ts`), and
`LeadSlaBadge` / `LeadSlaBanner` are components with `LeadSla.test.ts` rather than JSX that
could be deleted silently — PR-48b's lesson applied before the fact. One incidental fix in
scope: `formatAsuncionDay()`, because `formatDate` on a `date` column's string renders the
day before on a process set to `America/Asuncion`, and `ends_on` is exactly such a column.
`architecture.md` §32 records all of it.

### PR-50 — Admin import & cron console · **Sonnet → Opus review** · ✅ shipped

`plan.md` §6 calls data operations the real bottleneck; today every import runs from a
shell. `/admin/importaciones`: trigger `import:cones`, `import:aneaes` and `curate` from
the browser, watch `import_runs` progress, and a read-only cron panel showing each
`/api/cron/[job]`'s last run and outcome with a "run now" button.
**Deps:** none.
**Accept:** triggers are `editor`-gated and reuse the scripts' own entry functions — no
second import code path (the PR-20 rule); a running import cannot be started twice
(`import_runs` is the lock); "run now" calls the cron route with the server-held secret,
never exposing `CRON_SECRET` to the browser; every trigger lands in `activity_log`.

**Shipped as:** `/admin/importaciones`, plus three things the criteria forced into the
right shape. The lock is one conditional statement — `INSERT … SELECT … WHERE NOT EXISTS`
in `claimImportRun` — because a `SELECT`-then-`INSERT` from the application is a race;
`lock.test.ts` pins the branch. `beginImport` splits the import at the claim, so the
operator is told "ya hay una corrida en curso" on the click while the ~65-request crawl
outlives the Server Action, and `runImport` is that function plus `await done` — one code
path with the CLI, not two. The cron half needed a history and got `activity_log`
(`entity_type='cron_job'`) rather than a migration, with failures recorded too, which is
what tells a job that has been throwing for three days apart from a job hPanel never
scheduled. In passing: `curate()` now closes its `import_runs` row as `failed` when it
throws (it used to leave it `running` forever, which stopped being cosmetic the moment
`running` became the lock), and the admin rail and the `/admin` index — two lists whose
own docstrings say they match — are now held together by a test, having already drifted by
two screens. `architecture.md` §33 records all of it.

### PR-51 — Server-Action tests & input validation · **Sonnet** · ✅ shipped

The audit's test gap: the query layer is thoroughly tested, but the Server Actions wiring
forms to it (`src/app/admin/*/actions.ts`, `src/app/panel/actions.ts`) are not — a
mis-wired argument passes CI today. Add action-level tests (auth refused, malformed input
refused, arguments reach the query function intact), and introduce `zod` on the
**public-facing** input surfaces (lead form, auth forms) where hand-rolled validation risk
is highest. Admin/panel forms keep `src/lib/admin/validation.ts` until a real defect says
otherwise — one PR does not rewrite working validation for symmetry.
**Deps:** none.
**Accept:** every public Server Action and API route has a test proving bad input is
rejected before any query runs; zod schemas are the single definition their forms and
handlers both use; `vitest.config` gains a coverage report (visibility, not a gate — a
threshold arrives only when the number is known).

**Shipped as:** 158 new tests, and two decisions worth reviewing. **zod is server-side
only**: the client forms keep their `required` / `minLength` / `maxLength` attributes,
driven by the same constants the schemas read, because shipping zod to every public route
is weight the 150 kB budget does not have spare — measured, and the public routes are
unchanged at 129.8 kB. **The schemas decide shape, never outcome**: `loginSchema` accepts
anything that could be a credential, since a "correo inválido" for a malformed address
beside a generic refusal for a real one is an account oracle; password strength stays
`passwordProblem`'s, so three forms and a script give one answer. `validateLead` kept its
rules and their order — honeypot first and answered as success, phone normalised, consent
version compared — and its 45 existing tests were the safety net for the rewrite. In
passing, `client-bundle.test.ts` learned that `'use server'` is a boundary: it was walking
the entire server graph through every client form's actions import, which made its
"reached from" reports meaningless. First measured coverage: **55.7 % of statements**, no
threshold, and `npm test` is untouched so the CI check costs what it did before.

### PR-52 — PR-49/PR-50 review remediation · **Opus**

PR-49 and PR-50 are both in the review lane and merged on green CI without that pass
(#56). The review ran afterwards, against `main`, and confirmed the designs that were
expensive to get wrong — the `import_runs` lock, `curate()`'s failure-closing path, the
`beginImport`/`runImport` split, one `slaCutoff` behind both the SQL and the badge. It
found six defects, fixed here.

Two were **false statements**, which is rule 1 in other clothes: `past_due_grace` read
"el período terminó el {fecha futura}" whenever an operator marked a subscription past_due
mid-period (every test used a past `ends_on`, so nothing saw it), and the import audit row
was written *before* the lock was claimed, so a lost race left `activity_log` and
`import_runs` disagreeing about whether an import ever started. One was a screen breaking
another: ~30 cron rows a day made `/admin/actividad`'s unfiltered default view entirely
machine rows within two days. Three were HTTP hazards — an unbounded await on "ejecutar
ahora" (and cron jobs, unlike imports, have no lock, so the re-click is a second pass),
`x-forwarded-proto` used verbatim when it is a list, and `formatAsuncionDay` still
zone-dependent in exactly the way PR-49 wrote it to stop being.

**Deps:** PR-49, PR-50 (merged).
**Accept:** every fix has a test that goes red without it — the date helper is asserted
from four zones rather than against the composition that was wrong; the activity default
is mutation-checked; the past-due branch is covered on both sides of the end date. No
behaviour is dropped: the cron rows stay in the table and stay reachable by filter.
`architecture.md` §35 records all six, and §32.3 no longer claims what it did not have.

---

## Phase 8 — Quality hardening (PR 53–55) — in progress

Feature-complete against the plan, so this phase adds no features. It measures the
things earlier phases configured and never ran, raises the coverage floor on the
paths that move money and data, and re-reads what the last few PRs shipped.

### PR-53 — Lighthouse, actually run · **Opus**

PR-34 wrote `lighthouserc.json` and `.github/workflows/lighthouse.yml`; nobody ever ran
them, and `deployment.md` §7.2 said so. Run locally against `next build && next start`
over a seeded taxonomy and an empty catalog (the CONES/ANEAES sources 403 this network,
`data-sources.md` §1), three runs per URL.

The harness was wrong first: `preset: "desktop"` sat above four mobile overrides and won
the one field none of them mentioned, the user agent. That made Lighthouse a browser
rather than a crawler, so Next 15 streamed metadata to it and `meta-description` audited
as missing on all four pages — SEO 0.91 everywhere, on a site whose `<head>` is correct
for every HTML-only crawler that matters. It also made the CLS reading unstable.

Underneath it were two real defects. `(public)/loading.tsx` was a ~200 px skeleton
standing in for whole pages, so the streamed shell painted the footer inside the viewport
and the arriving content shoved it down: CLS 0.235 on `/carreras`, **0.556** on
`/acreditacion`, against a 0.1 budget, on every first visit. And `next/font` preloads by
default, so Plex Mono's two files were fetched on `/`, `/acreditacion` and
`/universidades` — pages that do not paint a monospace glyph between them.

**Deps:** none.
**Accept:** `lhci autorun` exits 0 on every `error`-level assertion where before it failed
nine. `scripts/lighthouse.ts` re-hosts the configured paths onto any origin and is what
both the workflow and a developer run, with tests pinning the two settings that were
wrong. `architecture.md` §36 records the before/after numbers, the aggregation caveat, and
what was measured and deliberately not fixed.

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
| **Total incl. planned**          |       | **49** | **15** | **21** | **13**               |

Across the 37 shipped PRs Sonnet wrote **24 (65%)** and, weighted by lines of code, closer
to **80%** — the heavy-line-count PRs (pages, admin CRUD, components) are all Sonnet's.
The planned Phases 6–7 keep the same shape: Opus owns the decisions that are expensive to
unwind (caching interface, the money-path review), Sonnet writes everything downstream of a
decided interface, and the review lane is enforced this time (PR-46's going-forward rule).
