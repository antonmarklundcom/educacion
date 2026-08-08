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

**`/carreras` is `force-dynamic`, and the detail pages are too until a build-time database exists.** The browse page is a function of `searchParams`, so there is nothing to prerender; the SEO surfaces are dynamic for a more boring reason — CI runs `npm run build` without a `DATABASE_URL`, so any `generateStaticParams` would have to fabricate or fail. Server-rendered HTML is fully crawlable either way, and the ISR cache on Hostinger is per-instance and wiped on redeploy, so the loss is an optimization rather than an SEO property. Revisit in PR-16, which owns the SEO pack.

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

- Selection = an ordered list of offering IDs, **max 4**.
- Source of truth is the URL (`?comparar=a,b,c`) mirrored into `localStorage` so it survives navigation between the card and table views.
- The sticky compare bar is a client component; everything else on the page stays a server component.
- `/comparar?ids=a,b,c` renders server-side so the link previews correctly when shared on WhatsApp (OG image generated per comparison — this is a real growth loop in Paraguay).
- Differences between compared programs are highlighted; identical values are dimmed. That is the whole value of a comparison table and it is cheap to implement.

### 5.1 What PR-09 settled

**Toggling a checkbox does not navigate.** The obvious implementation — `router.replace` on every check — refetches the whole RSC payload of a `force-dynamic` page, i.e. a database round-trip per click. Instead the selection lives in client state, is mirrored into `localStorage`, and the address bar is updated with `history.replaceState`. The URL stays shareable and the server tree is not re-rendered. The stated cost: links the server already rendered carry the selection as of page load, which is exactly what the `localStorage` mirror exists to repair on the next navigation.

**The labels travel with the selection.** The URL carries ids because ids are what `/comparar` re-reads. The sticky bar has to _name_ what you picked, and a program selected three pages back is not in the current results — so the display string the user already saw is stored alongside the ids rather than costing a query. It is display text only; nothing is ever asserted from it, and an id whose label was never seen renders as "Carrera seleccionada", not as a guessed name.

**The 3-on-mobile cap is dropped; 4 is the only ceiling.** `MAX_COMPARE_MOBILE` existed because a 4-column table does not fit a phone. `/comparar` does not render a table on mobile — it stacks by attribute (`design-system.md` §7), so four columns are usable at 390px and a second ceiling would only mean the same link showing different things on different devices. `MAX_COMPARE_MOBILE` remains in the contract, unused.

**Overflowing the ceiling refuses, it does not evict.** Adding a fifth is rejected with a visible message rather than silently dropping the first pick. The checkbox is never `disabled` when full — a control that silently does nothing is worse than one that explains itself.

**`src/lib/compare/` is a new module**, holding the selection rules as pure functions so the URL (server), the checkbox (browser) and the mirror obey the same ones.

**Client components must import `@/lib/search/contract`, never the `@/lib/search` barrel.** The barrel re-exports `searchPrograms`, which pulls Drizzle and `mysql2` into whatever imports it; from a `'use client'` file that is a build failure (`Can't resolve 'net'`) and, worse, would have been a shipped server driver had it resolved. The contract is types and constants only.

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

WhatsApp CTA is a parallel, non-form path: `https://wa.me/<institution_whatsapp>?text=<prefilled>` with the program name pre-filled. That click is logged as a `whatsapp_click` event (we never see the conversation, but we can prove volume to the institution — this is the number that sells the plan).

**PII rules:** consent is explicit and versioned; phone/email are never exposed to any institution other than the one the lead was submitted to; leads are purged after 24 months; see `risks.md` §R-06 for the minors question.

### 6.1 What PR-14 settled — rate limiting without Redis

`architecture.md` §1 excluded Redis, so the limiter has to live on one Hostinger Node instance with a MySQL. Three designs were viable.

**An in-process sliding window** is free — a `Map` of timestamps, no I/O — and it is the only tier that can see attempts which never become rows. But it is per-process and per-boot: Hostinger restarts the app on every deploy and on idle recycling, so a patient submitter waits one out, and the day the app runs behind two workers the effective limit silently doubles. **A dedicated `rate_limits` table** fixes durability with an atomic `INSERT … ON DUPLICATE KEY UPDATE`, at the cost of a table that exists only to be written to, a write on every request _including every rejected one_ — a cheap way for an attacker to make us do disk I/O — and rows that need another cron job to sweep.

**What shipped is both halves of the problem solved separately.** An in-process sliding window (`src/lib/leads/rate-limit.ts`, 8/min and 30/hour per hashed IP) absorbs floods before the database is touched. Everything that survives it is checked against a durable quota **derived from `leads` itself**: how many rows carry this phone in the last 24 h (max 5), how many carry this `ip_hash` (max 25).

The reason to derive rather than to count: the limit that actually matters is per _phone_ per day, and that is a fact about leads that exist. Deriving it means it survives a redeploy, survives a second worker, and cannot drift from what was really stored — there is no counter to reconcile and nothing to sweep. The cost is one `SELECT COUNT(*)` per surviving attempt and two additive indexes (`0002_lead_rate_limit_indexes.sql`), without which those counts are a table scan on the one path an attacker controls.

**Stated limits.** `x-forwarded-for` is client-forgeable, so the per-IP tier is defeated by rotating it; that is why the durable tier is per phone, which a submitter has to keep for the lead to be worth anything to them. The per-IP numbers are deliberately loose because a school lab, a cyber café and a carrier NAT all put many genuine students behind one address.

### 6.2 What PR-14 settled — `whatsapp_e164` is not on the search contract

The CTA needs one value per _institution_; `program_search` is one row per _offering_. Denormalizing it would mean ~10 000 copies of ~59 values, and — the reason that actually decides it — the number's invalidation clock would become the nightly rebuild. A number corrected in the admin at 09:00 would stay wrong on every card until 03:00, and a wrong number under a WhatsApp CTA starts a conversation with a stranger. §11 already settled that institution contact fields live on `institutions`; this is the same field class.

So `/carreras` calls `getWhatsappNumbers(institutionIds)` once per render, keyed by the ids the rows already carry — one extra query per page, never one per row — and a detail page reads the profile it already loads. **An institution with no published number renders no button.** There is no fallback to the landline and no guess (CLAUDE.md rule 1).

### 6.3 What PR-14 settled — the interfaces PR-23 and PR-28 build against

Fixed here so neither has to change when it lands (`agent-workflow.md` §2):

```ts
// @/lib/leads — PR-14 implements createLead, markLeadDelivered, submitLead.
type LeadStatus = 'new' | 'sent' | 'contacted' | 'qualified' | 'discarded';
interface LeadRecord {
  id; institutionId; offeringId; name; phoneE164; email; message;
  ageBracket; status; consentTextVersion; consentAt; sourcePage;
  deliveredAt; createdAt;
}
createLead(input: LeadInsert): Promise<number>
markLeadDelivered(id: number, at?: Date): Promise<void>
listLeadsForInstitution(q: { institutionId; status?; limit?; offset? }): Promise<LeadRecord[]>
```

`ip_hash` and `user_agent` are **not** on `LeadRecord`. They are written and read inside `src/db/queries/leads.ts` for abuse control and nowhere else, so PR-23's inbox and its CSV export cannot include them by accident. There is no overload of `listLeadsForInstitution` that omits `institutionId`, so an unscoped inbox query cannot be written — the shape is the first half of the access-control story that PR-21's `requireRole()` completes.

```ts
// @/lib/events — PR-14 implements recordEvent + the session hash.
recordEvent(e: { type: EventType; offeringId?; institutionId?; request: Request }): Promise<void>
```

`recordEvent` derives the session hash from the request itself, so no caller passes one and no caller can. PR-17 adds the remaining call sites (`offering_view`, `compare_add`, `profile_view`), the consent-banner interaction and `/admin/stats`; PR-28 aggregates by `(institution_id, type, day)`. PR-14 writes `whatsapp_click` from the browser and `lead_submit` server-side.

**`lead_submit` is not in `CLIENT_EVENT_TYPES`.** `POST /api/events` accepts only what a browser may legitimately claim; the event that an institution is invoiced against is written by the lead route, from the path that created the row.

### 6.4 What PR-14 settled — the two hashes

`leads.ip_hash` and `events.session_hash` are both salted with a secret `PRIVACY_SALT` (`deployment.md` §6). A bare `sha256(ip)` is not anonymisation — IPv4 is 2^32 values and the whole space enumerates on a laptop — and a salt committed to the repository is a salt the attacker has.

The session hash additionally mixes in the UTC date, so yesterday's cannot be joined to today's and a "session" is one device on one day. It needs **no cookie and no client-side storage**, which is what keeps first-party event counting outside the cookie-consent question entirely. The IP hash cannot rotate, because the window it answers for is 24 hours.

With `PRIVACY_SALT` unset the module warns once and uses a random per-process salt rather than a constant: abuse control degrades across restarts (the per-phone quota, derived from `leads`, does not) and no reversible value is ever produced.

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

Sessions: `iron-session` cookie, httpOnly, secure, sameSite=lax.

### 7.1 What PR-18 settled

**The signatures PR-19, PR-20 and PR-21 build against**, both pure over a `SessionUser` so their negative cases are testable without a browser, a cookie or a database:

```ts
requireRole(user, allowed): SessionUser        // throws AuthError, never returns false
scopeToInstitution(user, requested?): number   // the ONLY id that may reach a WHERE clause
```

`requireRole` **throws rather than returning a boolean**: a caller who ignores a returned `false` still ships, while a caller who drops this does not survive review. `AuthError.reason` distinguishes `unauthenticated` from `forbidden` for logs; both render identically to the user, because "this exists but you may not see it" is itself information.

**Roles are not a ladder.** `admin > editor > institution_admin > institution_editor` reads like one, and modelling it as a numeric level invites `level >= INSTITUTION_ADMIN` checks that hand an institution user a staff screen. Each role instead names what it satisfies: `admin` satisfies `editor`, `institution_admin` satisfies `institution_editor`, and **no staff role satisfies an institution role or vice versa**. The institution boundary is enforced separately, by scope.

**`scopeToInstitution` never coerces.** An institution user asking for another institution's id gets an `AuthError`, not their own id back quietly — a request for someone else's data is a bug or an attack, and both deserve to be loud. Staff may act on any institution but must name one: a missing id throws rather than meaning "all".

**Sessions carry three fields and no more** — id, role, institution scope. Name, email and plan are read from the database at use time, so revoking access takes effect on the next request. The scope is resolved at login from `users.institution_id` plus `institution_members`; a user belonging to **two** institutions is scoped to neither, because silently picking the lower id grants access nobody asked for. TTL is 8 hours, which is also the bound on how long a revoked membership can survive in a live cookie.

**Password hashing is `crypto.scrypt`, not bcrypt** — a deliberate deviation from `pr-plan.md`. bcrypt is a native module compiled against the Node ABI at install time, and this deploys to Hostinger's managed Node, where a platform upgrade would turn every login into a 500 until someone SSHs in and rebuilds. scrypt is in the standard library at OWASP parameters (N=2^17, r=8, p=1 — note `maxmem` must be raised or Node silently runs at N=16384). The stored string is self-describing, `scrypt$N$r$p$salt$key`, so the cost can be raised later without invalidating a single existing hash; `needsRehash` tells the login path when to upgrade one in place.

**Login answers one message for every failure.** Unknown address, wrong password, suspended account and never-set password are indistinguishable in the response — and in the _timing_: a miss verifies against a decoy hash of the same cost, because returning early on "no such user" is a user-enumeration oracle over a slow KDF.

**Password reset by email is not built.** It needs a `password_reset_tokens` table and the codebase's first Resend integration, neither of which is verifiable from the environment PR-18 was written in, so shipping a half-tested credential-recovery path was the worse option. `/cambiar-contrasena` closes the loop the bootstrap opens — re-authenticate with the current password, clear the flag, re-issue the cookie — and until reset lands a locked-out user is recovered by an admin. **PR-21 must not open `/panel` to real institutions without it**; telling a university to email us for a password is acceptable for staff and not for customers.

**The bootstrap script cannot leave a default credential in place.** There is no default password: it generates a random one, prints it once, sets `must_change_password`, and refuses to run at all once an active admin exists — so it is the bootstrap, not a shell back door for minting admins.

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

---

## 11. The institution directory (settled in PR-11)

`searchPrograms()` is still the only way to read the _index_, and every program list on the site — including the one on an institution profile — goes through it. `/universidades` is the first page that is not a list of offerings, and it needed one thing the search contract does not have.

**Why a second query module exists.** The contract has no institution facet: `institutionSlug` narrows a search, it is not counted. Deriving ~59 institutions from the index would mean paging through every offering in the country (~100 queries), and adding a ninth facet group would reopen a layer PR-07 deliberately closed. The institution _profile_ fields settle it either way — `website`, `email`, `phone_e164`, `whatsapp_e164`, `description_md`, `founded_year` live on `institutions` and should not be denormalized into `program_search`, which is one row per offering.

So `src/db/queries/institutions.ts` (SQL, per rule 5) and `src/lib/institutions/` (the typed surface components import) exist alongside the search layer.

**What it deliberately does not do.** It returns no price, no accreditation status and no program. Those still come from `searchPrograms()`, which is the only place the 12-month arancel rule and the accreditation precedence rule are applied. The institution module knows about institutions and counts, and nothing else — so there is no second implementation of a rule that must never have two.

**Query count is fixed at two, always.** One for the institutions, one grouped aggregate over `program_search` for every institution's counts at once, merged in JS. Never one query per row. The institution profile page is likewise two: the profile, and one `searchPrograms()` page for the program list.

**Counts are facts about what we published, and the copy says so.** `aneaesAccreditedCount` is "how many of the carreras _we have published_ carry an ANEAES accreditation _we could verify_" — never "how many the institution has". A zero therefore reads "no encontramos", never "no tiene" (risks.md §R-09).

---

## 12. Analytics & the event log (settled in PR-17)

PR-14 built the write path — `recordEvent()`, `POST /api/events`, the session hash. PR-17 adds the callers, the third-party half and the internal read.

**There are two things called analytics here and they do not have the same standing.** The third-party script is a request to another company's server carrying the visitor's IP and the page they are on; that is what a cookie banner exists to govern, and it does not load until `hasAnalyticsConsent()` says so. The first-party `events` table is not gated: it sets no cookie and touches no client storage, the session hash is derived server-side and rotates daily (§6.4), and the row is a type, two foreign keys and a non-reversible digest. It is also what an institution's own numbers are computed from — a purpose we have to be able to state plainly rather than one that disappears when a banner is dismissed. `/legal/privacidad` (PR-15) names that purpose, the 24-month retention and the deletion path.

**No cookie means no.** Nothing writes the consent cookie until PR-15's banner lands, so the third-party script does not load at all today. `src/lib/analytics/consent.ts` fixes the cookie name, its format and a `ec:consent-changed` window event the banner dispatches after writing it — that is the interface PR-15 builds against.

**Plausible, not GA4** (§1 allowed either): cookieless, no cross-site profile, ~1 kb against GA4's ~50 kb on a 150 kb budget. It is a paid service, so with `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` unset the component renders nothing — no half-configured script reaches production.

**Views are reported from the browser, not from the render.** Counting `offering_view` server-side during a page render counts every crawler, uptime check and prefetch as a student, and the number PR-28 shows an institution has to survive being questioned. The cost is stated: where JavaScript never runs a view is not counted. An undercount is honest; an overcount is not.

**`compare_add` carries only an offering id**, because `CompareLabel` — a structure PR-09 persists to `localStorage` — has no institution on it, and widening a persisted client structure for an analytics need is the wrong trade. PR-28 resolves the institution by joining `events.offering_id` to `program_search`.

**`lead_submit` is not client-reportable.** It is written server-side by the lead route, from the path that created the row (§6.3).

**Every aggregate takes the same range and the same optional `institutionId`.** `countEventsByType`, `countEventsByDay` and `countEventsByInstitution` in `src/db/queries/events.ts` are the whole read surface; PR-28's dashboard is the same questions asked with that argument set. Because the scoping is a parameter of the query rather than a filter applied to its result, there is no shape in which "all institutions" leaks into an institution-scoped page. Ranges are UTC — the session hash buckets its day in UTC and `created_at` is stored UTC, so reading the range in `America/Asuncion` would put two numbers on the same page four hours out of step.

**The query layer never invents a zero.** `countEventsByDay` returns only days that have events; `fillDays()` in `src/lib/analytics/range.ts` fills the rest, because there the caller knows the range it asked for and the zero is measured rather than guessed.

**`/admin/stats` is admin-only.** PR-17 gated it on a URL token because authentication did not exist, and said PR-18 would delete that file. PR-18 did: `src/lib/analytics/admin-access.ts` and `ADMIN_STATS_TOKEN` are gone, and the page calls `requireRole(user, ['admin'])`, 404ing rather than 403ing so an admin surface does not confirm its own existence. A token in a query string was a token in a browser history, a proxy log and a shared screenshot; a session cookie is none of those.

---

## 13. Admin CRUD (settled in PR-19)

`/admin` grows CRUD for the five entities `data-model.md` §1 calls the central modelling decision: institutions, campuses, careers, programs, offerings. Prices, accreditations, admissions and the moderation queue are PR-20's; `/panel` is PR-21's.

**`requireRole` is called inside every mutation in `src/db/queries/admin/*.ts`, not only in the calling server action or the `/admin` layout.** A server action is a reachable endpoint on its own — Next.js does not re-run the layout guard for it — so the boundary that actually matters is the query module every mutation goes through (CLAUDE.md rule 4). `institutions.test.ts` and `mutations-require-role.test.ts` call `createInstitution`/`updateInstitution`/`archiveCampus`/etc. directly with no session and assert `AuthError`, the same negative-case shape `roles.test.ts` established for PR-18.

**One table component, one form component, for all five entities.** `AdminTable` (`src/components/admin/AdminTable.tsx`) takes a column config and a row array; every list page supplies both and nothing else. `AdminForm` (`src/components/admin/AdminForm.tsx`) takes a field-schema array (`FieldDef[]`) and a bound server action; every create and every edit page for every entity renders through this one component — adding an entity means writing a field list, not a new form. It is the one client component PR-19 adds: `useActionState` is what lets a failed submission show field errors inline without losing what the user typed, which throwing to the nearest `error.tsx` would not do. Every other component and page in this PR is a server component.

**`management` has no default.** The `<select>` ships with an empty leading option and nothing pre-selected; `parseInstitutionInput` (`src/lib/admin/validation.ts`) rejects a blank submission with a field error rather than writing `'privada'`. The column stays `NOT NULL` — data-model.md is not restructured — so "we don't know yet" is enforced by refusing to save, not by a nullable column (CLAUDE.md rule 1). Accreditation is not a field anywhere in this PR's forms; PR-20 owns it.

**`match_key` is never a form field.** Institutions and programs created here call the same `buildMatchKey`/`buildCareerMatchKey` the import pipeline uses (`src/lib/curate`), so a manually created row matches exactly the way an imported one would. `enrollment_status` on offerings is likewise not a field — data-model.md §2 already says it is derived daily from the active admission window, not hand-maintained, and admissions are PR-20's.

**"Eliminá" archives; nothing in this PR hard-deletes.** All five entities' delete action sets `status = 'archived'`, logged like any other write. data-model.md §3 already forbids hard-deleting an institution or a program; PR-19 applies the same rule to campuses, careers and offerings for one uniform, predictable action rather than three different ones.

**Every write logs `activity_log` and rebuilds the search index, inside the same function as the mutation.** `logActivity` (`src/db/queries/admin/activity-log.ts`) is called from inside the same `db.transaction` as the insert/update, with `beforeJson: null` on a create, `afterJson: null` on an archive, and both populated and differing on an update — asserted directly in `activity-log.test.ts` rather than trusted by inspection. `rebuildProgramSearch()` runs after the transaction commits, on every write to institutions, campuses, careers, programs and offerings — all five denormalize into `program_search` (institution/campus/career names, slugs), so all five invalidate it. It runs inline rather than queued: §4's own comment on the rebuild script says a full replace "costs a couple of seconds" at this row count, and admin writes are a staff member saving a form, not a request path with a latency budget — the honest failure mode of queuing it instead would be a "saved" screen while the index is still stale with no visible sign of that. If the catalog grows enough that this becomes noticeable, the fix is the same one-file swap §4 already reserves for the in-memory fast path; nothing about the interface changes.

**The R-08 decision: object storage, not a persistent path.** `risks.md` §R-08 asked for one of two options. This PR takes the preferred one — an S3-compatible bucket (Cloudflare R2, or any S3-compatible provider) — over the persistent-path alternative, because the persistent path couples the app to one Hostinger box and complicates local dev, and the bucket is what `.env.example`'s `S3_*` block was already reserved for. Rather than pull in the AWS SDK for one call, `src/lib/uploads/s3.ts` is a hand-written SigV4 signer for a single `PUT`; `src/lib/uploads/storage.ts` validates the file (type, size) before touching configuration and **fails closed**: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_PUBLIC_BASE_URL` are read fresh on every call, and their absence throws `UploadConfigError` before any network request — an upload that silently no-ops, leaving `logo_url` unset with no explanation, is worse than one that refuses outright. Nothing is ever written to `public/` or anywhere inside the app directory.

**Not verified from this environment.** This PR was written without a live R2/S3 bucket or `DATABASE_URL` to test against, so "the uploaded logo survives a simulated redeploy" is verified by construction — the bytes never touch disk inside the app directory, there is nothing for a redeploy to wipe — but not by an actual upload-then-redeploy run. The SigV4 signing was written to spec and covered by validation tests (bad type, empty file, oversized file, missing/partial config), not by a request that reached a real bucket. Whoever merges this should do one real upload against the production `S3_*` values before relying on it.

---

## 14. Prices, accreditations, admissions and the moderation queue (settled in PR-20)

PR-19 covered the catalogue. PR-20 covers the three tables that carry a
`verified_at` clock — the ones a student actually acts on — plus the queue
PR-06 has been filling since Phase 0 with nothing able to read it.

**An arancel is superseded, never edited.** `data-model.md` §2 specifies "one
current row per offering + history", and until now nothing enforced which of
those two a save meant. Saving a new price flips the previous current row to
`is_current = false` and inserts a new one, in one transaction — the UNIQUE on
the generated `current_offering_id` makes any other ordering a constraint
violation, and more to the point an offering with two current prices, or none,
is a state the comparador cannot render honestly. `updatePrice` still exists but
is a **correction** — fixing a row that should never have said what it says —
logged as `update` rather than `create` so the two are distinguishable in
`activity_log` forever. The edit page says which is which, because the
difference is invisible from the form and expensive to get wrong: an edit
destroys the record of what we published last year, which is exactly what an
institution disputing an arancel asks about (`risks.md` §R-14).

**Retirement has no `status` column to use, so it uses the honest field.** A
price stops being current; an accreditation goes to `sin_datos`; a convocatoria
goes `is_active = false` and its offerings fall back to `sin_datos`, **not** to
`cerradas`. In all three cases the row survives with its source and its history.
Adding an `archived` status to these tables would have been a restructure, and
the honest operation was available in each.

**`offerings.enrollment_status` is derived here and by PR-33's cron, from one
function.** `deriveEnrollmentStatus` (`src/db/queries/admin/admissions.ts`) is
pure and exported for exactly that reason. Saving a convocatoria restates the
badge for everything it covers immediately rather than leaving the site a day
stale, and a **narrower scope wins**: an offering with its own convocatoria is
not overwritten by the institution-wide one, the same precedence rule §4.1
settled for the accreditation badge. A period with no dates at all derives
`sin_datos`, never `cerradas` — a student reading "cerradas" skips a carrera
that may well be enrolling.

**The accreditation rule is enforced twice on the admin path, deliberately.**
`parseAccreditationInput` turns it into a sentence beside the field the
moderator has to fix; `createAccreditation` / `updateAccreditation` re-assert it
in the query module because the form is not the only caller — PR-21's panel and
PR-22's claim flow reach the same module. `src/db/invariants.ts` is the single
definition both call, so the duplication is in the _calling_, never in the rule.
The form also refuses `CONES` + `acreditacion` outright: CONES habilita, ANEAES
acredita, and the importer is already forbidden to conflate them, so a human
should not be able to do by hand what the pipeline may not do automatically.

### 14.1 The moderation queue

> _approving a conflict writes through the same code path as the importer_

Literally. `resolveConflict` calls `insertEntity` and `updateEntity` from
`src/db/queries/curation.ts` — the same two functions `applyProposals` calls,
exported for this. There is no second mapping from a proposal to a row, so the
column allow-lists and the invariants that guard an imported accreditation guard
an approved one identically. `apply-rules.ts` carried that as a comment before
this PR existed; this is the comment made true.

**Approval answers one of the two reasons a conflict is queued, and not the
other.** A row queues either because _nobody may write this automatically_ (a
protected field changed, a fuzzy match, a new institution whose `management`
neither register prints) or because _nobody may write this at all_ (an
accreditation with no citation). Human review is precisely what
`PROTECTED_FIELDS` was holding out for, so an approved change applies protected
fields too — that is the point of the queue, not a hole in it. The invariants
run inside the write functions, so approving an uncited `vigente` throws and the
conflict stays open. A rule a human can click past is not a rule.

**Merge is approve with a narrower diff, not a third code path.** The moderator
ticks which differing fields to take from the source; `resolveConflict` takes an
optional allow-list. An empty selection is refused rather than silently applying
everything or silently applying nothing. A `new` proposal offers no choices —
half a create would violate a NOT NULL — so it applies whole or not at all.

**Resolving one conflict supersedes the others aimed at the same entity.** Two
import runs against a register that moved twice leave two open rows for one
program, and the older one is then a decision about a state that no longer
exists. `CONFLICT_STATUS` already had the word; this is what uses it.

### 14.2 Bulk verify is an assertion, and is logged as one

`bulkVerify` stamps `verified_at` and `verified_by_user_id`. It re-checks
nothing — nothing in this codebase can — so what it records is "on this date,
this person said these are still true". That is why it takes an explicit list of
ids, why **nothing is pre-selected**, why it refuses an empty list, why it caps
at 200 rows, and why the ids themselves go into `activity_log`. It is the one
action in the admin that can quietly extend the life of a wrong number, and the
log is what makes it answerable afterwards (`risks.md` §R-03). The page says
this in the words a person reads, not only in a comment.

`/admin/frescura` reports the consequences rather than opinions: an arancel past
12 months **is already hidden** from the comparador, the JSON-LD and the OG
images, so `pricesExpired` counts carreras currently showing "Consultá el
arancel" where we used to have a number. PR-33 owns the automated half — the
weekly digest, the cron, the public "última actualización" surfaces. This is the
manual half, which had to exist first: there is no point scheduling a reminder
about a queue nobody can work.
