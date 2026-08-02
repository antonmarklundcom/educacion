# Architecture — educacion.com.py

## 1. Stack decision

| Layer     | Choice                                         | Why                                                                                                                                        |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework | **Next.js 15, App Router, TypeScript**         | Server-rendered SEO pages + API routes + admin in one deployable. Matches the house stack.                                                 |
| Styling   | **Tailwind CSS**                               | The two mockups are inline-style prototypes; Tailwind is the fastest faithful translation.                                                 |
| ORM       | **Drizzle ORM** (`drizzle-orm/mysql2`)         | Typed SQL without a query-engine binary. Avoids the Prisma/Hostinger networking class of problems documented in `nextjs-deploy-hostinger`. |
| DB        | **MySQL 8 on Hostinger**                       | Already paid for, one slot, no extra service. Dataset is ~10k rows — trivially within capacity.                                            |
| Auth      | **`iron-session` + bcrypt** (own tables)       | Phase 2 only needs admin + institution logins. No social login needed. Adding Auth.js/OAuth is Phase 4-if-ever.                            |
| Scripts   | **tsx**                                        | Importers, seeds, cron jobs.                                                                                                               |
| Search    | **MySQL FULLTEXT + a denormalized flat table** | See §4. Explicitly **not** Elasticsearch/Meilisearch — extra service, extra slot, unjustified at this scale.                               |
| Email     | **Resend** (or Hostinger SMTP)                 | Lead notifications, claim verification.                                                                                                    |
| Hosting   | **Hostinger managed Node.js**, 1 of 30 slots   | See `deployment.md`.                                                                                                                       |
| Analytics | **Plausible or GA4** + first-party event log   | Institution-facing stats must come from our own DB, not GA.                                                                                |

### Deliberately excluded

- **No Elasticsearch/Meilisearch/Algolia.** 10k rows. MySQL handles it. Revisit only if p95 search latency > 300 ms with real data.
- **No Redis.** Next.js `unstable_cache` + in-process LRU is enough on a single instance.
- **No headless CMS.** Editorial is MDX in-repo (Phase 4) or DB-backed; a CMS is another subscription and another failure mode.
- **No microservices.** One Next.js app, one DB.

---

## 2. Application shape

```
src/
  app/
    (public)/                      # public site, shared layout
      page.tsx                     # /
      carreras/
        page.tsx                   # /carreras  — the two-view browser
        [carreraSlug]/page.tsx     # /carreras/medicina — canonical career hub
        [carreraSlug]/[ciudad]/    # /carreras/medicina/asuncion (gated, see seo.md)
      universidades/
        page.tsx
        [instSlug]/page.tsx
        [instSlug]/[programSlug]/page.tsx   # program detail = the lead page
      areas/[areaSlug]/page.tsx
      comparar/page.tsx
      becas/
      acreditacion/                # editorial hub + checker (the wedge)
      blog/[slug]/
      para-instituciones/page.tsx  # B2B sales page
      legal/{privacidad,terminos,fuentes}/page.tsx
    panel/                         # institution portal (role: institution_*)
    admin/                         # internal admin (role: admin|editor)
    api/
      leads/route.ts
      revalidate/route.ts
      cron/[job]/route.ts
  components/
    ui/                            # design-system primitives
    browse/                        # FilterRail, ResultCard, ResultTable, CompareBar
    program/                       # detail page blocks
  db/
    index.ts                       # single pool
    schema.ts                      # Drizzle schema (see data-model.md)
    queries/                       # all SQL lives here, never in components
  lib/
    search/                        # filter parsing, facet counts, index rebuild
    auth/                          # session, requireRole, scoping
    entitlements/                  # plan → feature gating
    seo/                           # metadata + JSON-LD builders
    format/                        # Gs. formatting, durations, dates (es-PY)
  scripts/                         # tsx one-offs: import-*, seed-*, rebuild-*, cron-*
drizzle/                           # generated migrations
docs/
```

**Rules:**

- No SQL outside `src/db/queries/`. Components receive plain typed objects.
- Every mutating route/action calls `requireRole()` server-side. Hidden buttons are UX, not security.
- Every institution-scoped query filters by `institutionId` from the session unless the role is `admin`.

---

## 3. Rendering strategy

| Route                                                     | Strategy                                                         | Notes                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/`, `/carreras/[slug]`, `/universidades/**`, `/areas/**` | **Static + ISR** (`revalidate: 3600`) via `generateStaticParams` | These are the SEO surfaces. Must be crawlable HTML with no client fetch.             |
| `/carreras` (browser, filtered)                           | **Server component, dynamic**, filters read from `searchParams`  | Filter state lives in the URL — shareable, back-button-correct, indexable base case. |
| `/comparar`                                               | Server component, `noindex`                                      | Selection encoded in URL so it can be shared on WhatsApp.                            |
| `/panel`, `/admin`                                        | Fully dynamic, `noindex`, auth-gated                             |                                                                                      |

**ISR caveat on Hostinger:** the ISR cache is per-instance and is wiped on redeploy. Treat it as an optimization only — never as the source of truth. On-demand revalidation (`/api/revalidate` with a secret, called by admin saves) invalidates tags for the affected program/institution.

---

## 4. Search & faceting (the one genuinely tricky piece)

The dataset is small (~10k offerings) but the UX is facet-heavy: 8 filter groups, live counts per option, sort by arancel/duración, all combinable.

**Design:**

1. **`program_search`** — a denormalized, flat, read-only table rebuilt by a script. One row per offering, containing every filterable and displayable field already resolved (institution name, career name, city, department, level, modality, management type, duration months, monthly fee in guaraníes as an integer, accreditation status, enrollment status, area, plus a `search_text` FULLTEXT column). No joins at query time.
2. **Filtering** is a single `WHERE` over that table. Free-text uses `MATCH ... AGAINST` in boolean mode against `search_text` (institution + career + city + keywords, accent-stripped and lowercased at index time — never rely on collation for accent-insensitivity).
3. **Facet counts** are computed with one extra grouped query per facet group, each applying _all other_ filters but not its own (standard "faceted count" semantics). That is ~8 small aggregate queries. At 10k rows with the right indexes this is single-digit milliseconds.
4. **Optional fast path:** if latency ever matters, load the whole `program_search` table into a module-level in-process array on boot (10k × ~400 bytes ≈ 4 MB) and filter in JS. This is a legitimate endgame at this scale and removes the DB from the hot path entirely. Ship the SQL version first; keep the interface (`searchPrograms(filters): {results, facets, total}`) identical so swapping is a one-file change.

**Indexes required on `program_search`:** composite on `(level, management, modality)`, single on `city_id`, `career_id`, `institution_id`, `accreditation_status`, `monthly_fee_gs`, FULLTEXT on `search_text`.

**Rebuild:** `npm run search:rebuild` — a full replace inside a transaction, safe to re-run, called automatically after any admin write via a debounced job and nightly by cron.

### 4.1 What PR-07 settled

The shape above survived implementation. These are the decisions it forced, each of which is a thing not to rediscover.

**The rebuild deletes, it does not truncate.** `TRUNCATE TABLE` is DDL in MySQL and performs an implicit commit, so inside a transaction it cannot be rolled back: a failure during the insert phase would leave the live site with an empty index. `DELETE FROM program_search` is transactional — if anything throws, the old index is still serving. At ~10k rows the cost is negligible and the guarantee is the point. The FULLTEXT index survives either way and the rebuild never drops it.

**The eight facet groups are `areas, levels, managements, modalities, shifts, cities, accreditationStatuses, enrollmentStatuses`.** `institutionTypes`, `careerSlugs` and `departmentSlugs` are filters without a facet group — they narrow, they are not counted. Fixed vocabularies always render every option including zero counts (a checkbox that disappears makes the rail jump under the user's finger); cities render only where there is something to find, plus whatever the user has selected.

**One extra query for area labels.** `program_search` carries `area_slug` but not the area's name, so the areas facet reads its labels from the seeded `areas` table — 14 rows, one small query. Adding an `area_name` column would remove it; it is not worth a migration.

**Today comes from Node, not `CURDATE()`.** The 12-month arancel boundary decides what may be displayed, the pool is pinned to UTC, and the MySQL session timezone on shared hosting is not ours to guarantee. The query layer passes the date in as a parameter.

**Two price predicates, deliberately.** Rendering uses `isPriceDisplayable()` (timestamp precision, `src/db/invariants.ts`, the single decision point). Filtering and sorting use `price_expires_on > :today` (date precision), because that is what an index can answer. The date form is never more permissive than the timestamp form, so a row can drop out of an arancel range on its last day while still showing its price — never the reverse. `row.test.ts` asserts the property.

**Short queries are the one place FULLTEXT is not enough.** InnoDB does not index tokens below `innodb_ft_min_token_size` (3), so "UC" is invisible to it and falls back to a prefix `LIKE` on `institution_short`. But two-letter Spanish function words are everywhere — "medicina de la UC" — so a short token only _filters_ when the whole query is short; alongside real words it only raises the rank of rows whose acronym it matches. The alternative, requiring every short token, returns an empty page for ordinary Spanish.

**`plan_rank` is appended after the user's sort key, always.** It can only reorder rows that already tie on what the user asked for. With no query and the default sort every row ties on relevance, so `plan_rank` decides — that is a tiebreaker doing its job, and PR-27 still owes the visible "Destacado" label.

**One accreditation badge, by a written rule.** An offering can be covered by institution-, program- and offering-scoped rows at once. Precedence: drop disputed rows, drop uncited claims (including uncited `no_acreditada`), demote a lapsed `vigente` to `vencida`, then specificity (offering > program > institution) wins outright, then status, then recency, then id. Documented in full at the top of `src/lib/search/accreditation.ts`.

**The in-memory fast path (§4.4) exists already**, as `searchInMemory()` in `src/lib/search/engine.ts`. It was built to make facet, sort and pagination semantics testable in CI without a MySQL, and both engines share the filter definitions, the sort chain and the facet assembly. The SQL engine remains authoritative; the two are knowingly approximate only in free-text ranking, where MySQL's term weighting is not reproduced in JS.

---

## 5. Comparador state

- Selection = an ordered list of offering IDs, **max 4** (3 on mobile).
- Source of truth is the URL (`?comparar=a,b,c`) mirrored into `localStorage` so it survives navigation between the card and table views.
- The sticky compare bar is a client component; everything else on the page stays a server component.
- `/comparar?ids=a,b,c` renders server-side so the link previews correctly when shared on WhatsApp (OG image generated per comparison — this is a real growth loop in Paraguay).
- Differences between compared programs are highlighted; identical values are dimmed. That is the whole value of a comparison table and it is cheap to implement.

---

## 6. Lead pipeline

```
User clicks "Solicitar info"
  → modal: nombre, teléfono, email(opt), mensaje(opt), consent checkbox (unchecked by default)
  → POST /api/leads   (rate-limited per IP + per phone, honeypot field, origin check)
  → INSERT leads (status='new', consent_text_version, consent_at, ip_hash, user_agent)
  → notify institution: email + (Phase 2) WhatsApp Business template
  → lead visible in /panel/leads for that institution
  → institution marks contacted/qualified/discarded → feeds their dashboard stats
```

WhatsApp CTA is a parallel, non-form path: `https://wa.me/<institution_whatsapp>?text=<prefilled>` with the program name pre-filled. That click is logged as a `lead_intent` event (we never see the conversation, but we can prove volume to the institution — this is the number that sells the plan).

**PII rules:** consent is explicit and versioned; phone/email are never exposed to any institution other than the one the lead was submitted to; leads are purged after 24 months; see `risks.md` §R-06 for the minors question.

---

## 7. Authentication & roles

```
users        (id, email, password_hash, name, role, institution_id?, status, created_at)
role enum    'admin' | 'editor' | 'institution_admin' | 'institution_editor'
```

- `admin` — everything, including plans and billing.
- `editor` — data curation, no billing, no user management.
- `institution_admin` — own institution: programs, prices, admissions, leads, members.
- `institution_editor` — own institution, no member management, no plan changes.

`requireRole(session, allowed[])` on every mutation. `scopeToInstitution(query, session)` applied to every institution-facing read. Both live in `lib/auth/` and are unit-tested — these two functions are the entire security boundary.

Sessions: `iron-session` cookie, httpOnly, secure, sameSite=lax, 7-day rolling.

---

## 8. Data integrity & provenance

Every fact that a user could act on carries provenance. This is non-negotiable given the accreditation wedge.

- `source_records` — raw imported rows kept verbatim (source name, fetched_at, payload JSON, checksum). Never edited.
- Curated tables reference the source record they came from.
- `verified_at` + `verified_by` on prices, accreditations and admissions.
- The UI shows "Actualizado: {date}" on every price and accreditation badge, and **hides** an arancel older than 12 months rather than showing a stale number.
- Admin edits write to `activity_log` (actor, entity, before/after JSON, timestamp).

---

## 9. Performance budget

Inherited from `conversion-design` and `seo-web-builds`:

- LCP < 2.5 s on 4G, CLS < 0.1, INP < 200 ms.
- Total JS ≤ 150 kb gzipped on public pages. The browser page is the risk: keep FilterRail and ResultTable as server components, only the compare bar and the modal are client.
- Fonts: IBM Plex Sans + IBM Plex Mono, self-hosted via `next/font`, max 4 weights total.
- Institution logos: WebP, explicit dimensions, ≤ 20 kb each, lazy below fold.
- Enforced in CI with a bundle-size check (PR-34).

---

## 10. Cron / scheduled work

Hostinger managed Node has no built-in scheduler you should rely on. Use hPanel cron hitting authenticated route handlers:

| Job                                                         | Cadence           | Route                      |
| ----------------------------------------------------------- | ----------------- | -------------------------- |
| Search index rebuild                                        | nightly 03:00 -04 | `/api/cron/rebuild-search` |
| Data-staleness scan → admin digest                          | weekly Mon        | `/api/cron/staleness`      |
| Convocatoria status transitions (abiertas/cerradas by date) | daily 05:00       | `/api/cron/admissions`     |
| Lead-delivery retry for failed notifications                | hourly            | `/api/cron/lead-retry`     |
| Sitemap regeneration                                        | nightly           | `/api/cron/sitemap`        |

All guarded by `CRON_SECRET` in a header. All idempotent.
