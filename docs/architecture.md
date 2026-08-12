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

| Job                                                          | Cadence           | Route                          |
| ------------------------------------------------------------ | ----------------- | ------------------------------ |
| Search index rebuild                                         | nightly 03:00 -04 | `/api/cron/rebuild-search`     |
| Data-staleness scan → admin digest                           | weekly Mon        | `/api/cron/staleness`          |
| Convocatoria status transitions (abiertas/cerradas by date)  | daily 05:00       | `/api/cron/admissions`         |
| Lead-delivery retry for failed notifications                 | hourly            | `/api/cron/lead-retry`         |
| Lead email digest, per institution with `status='new'` leads | daily 08:00 -04   | `/api/cron/lead-digest`        |
| Sitemap regeneration                                         | nightly           | `/api/cron/sitemap`            |
| Past-due sweep (ended subscriptions → `past_due`)            | daily 06:00 -04   | `/api/cron/subscription-sweep` |
| Renewal reminders (90/30/7 days), one digest to the operator | daily 06:15 -04   | `/api/cron/renewal-reminders`  |

All guarded by `CRON_SECRET`, sent as the `x-cron-secret` header (`src/lib/cron/auth.ts`, PR-23). All idempotent.

### 10.1 What PR-23 settled — `lead-retry` and `lead-digest`

`/api/cron/[job]` was a routing stub until this PR (`docs/deployment.md` §6 said so explicitly); it now handles these two jobs and still answers `not_implemented` for the rest, which ship with their owning PRs.

`lead-retry` re-runs `notifyInstitution` for every `status='new'`, `delivered_at is null` row (`src/lib/leads/retry.ts`) — the same call `submitLead` already makes once, inline. It is idempotent by construction: a lead marked `sent` no longer matches the query that finds it, so firing the cron twice in the same hour is a wasted read, not a duplicate email.

`lead-digest` (`src/lib/leads/digest.ts`) is deliberately **not** "leads since the last digest" — there is no persisted "last sent" clock, and PR-23 was told to stop and ask before adding a schema change rather than add one for this. It reports a live count instead ("tenés N solicitudes sin responder"), which is both true and safe to re-send: a double-fire repeats the same honest sentence rather than duplicating or dropping a lead. Read "all jobs are idempotent" above that way for this job specifically — no double-counted data, not "never sent twice".

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

---

## 15. The institution portal (settled in PR-21)

**The boundary is `src/db/queries/panel/scope.ts`, and it is object-level.**
Filtering a list by `institutionId` is necessary and is not sufficient:
`/panel/carreras/57` hands the handler an id an institution user can edit, so
every panel entry point resolves the _owning_ institution of the row it was
given and compares it to `scopeToInstitution(user)` — which never coerces
(§7.1). The decision is split from the fetch: `assertSameInstitution` is pure,
which is what makes the cross-institution cases testable without a database.

**A missing row and somebody else's row answer identically.** Both throw
`forbidden`. Answering 404 for one and 403 for the other turns the URL space
into an oracle for which ids exist.

**Staff are refused at `/panel`, not scoped to everything.** The panel says
"your carreras" throughout, and a staff session has no institution; rather than
silently picking one it sends them to `/admin`, which asks explicitly.

**Authorization runs before validation.** The price action originally parsed
its fields first, and answered "decinos cuántas cuotas" to a request aimed at
another institution's offering — confirming the offering exists and that the
payload was nearly right. The ownership check moved to the first line. The test
below is what found it.

### 15.1 What the institution may change, and what enters review

`src/lib/panel/review.ts` is the list, by one principle: **the institution is
the authority on its own commercial facts; the register is the authority on its
identity.**

- **Direct, live immediately:** aranceles, convocatorias, descriptions, plan de
  estudio, créditos, título. An arancel typed by the institution is stamped
  `source = 'institucion'` — the strongest provenance this dataset has — and
  supersedes rather than edits, exactly as the admin path does (§14). There is
  no review gate on it deliberately: `plan.md` §6 calls arancel collection the
  actual cost centre of this business, and queueing the most valuable thing the
  panel can produce behind a human would mean it arrives days late and only if
  somebody is watching.
- **Review-gated:** `nameOfficial`, `level`, `conesResolution`, `careerId`,
  and an offering's modality/turno/duración/sede. These come from a public
  register, they are what a student checks us against, and they become a
  `curation_conflicts` row — **the same queue PR-20 built**, resolved through
  the importer's own write path (§14.1). One queue, one apply path. A review
  field whose value has not actually changed is not queued: a moderator opening
  a request that proposes what is already stored has been given busywork.
- **Forbidden entirely:** `status` (publishing decides what is in the national
  index; an institution un-publishing a programme it still runs makes the
  directory wrong in the one way nobody can detect from outside — removal goes
  through the R-14 policy) and **accreditation**, which is R-09 pointed at our
  own foot. The institution's remedy there is a dispute, and that is PR-24.

Fields that are none of the three are **reported back**, never silently
dropped: dropping a field we rendered a control for is how a panel teaches its
users that saving does not work.

### 15.2 The access test, and the two bugs it found

`src/db/queries/panel/access.test.ts` builds a session for institution **B** and
calls the real server actions in `src/app/panel/actions.ts` with ids owned by
institution **A**. Nothing in the security path is mocked — only the database,
with one that answers every ownership lookup "institution A owns this", the most
dangerous possible answer.

**Reads are allowed; writes are the canary.** Resolving ownership _is_ the
guard, so a read is expected; an `insert`, `update`, `delete`, transaction or
index rebuild on a cross-institution request sets a flag that every assertion
checks. This matters more than it sounds: the first version of the test asserted
only "an error came back", and **passed with the guard deleted**, because every
action catches its own errors and a missing database produces an error too.
Deleting `assertSameInstitution`'s comparison now turns the file red, which is
the property that makes it a test rather than a decoration.

It also caught the validation-before-authorization ordering in the price action
(§15).

### 15.3 Members

`institution_admin` only — the roles are not a ladder, so this is a separate
check rather than a comparison. Four refusals, each closing a real hole: a
**staff** account can never be attached to an institution from here; a user who
already belongs to **another** institution is refused, because §7.1 scopes a
two-institution user to _neither_ and "inviting" them would lock them out of
their real employer; an admin cannot demote or remove **themselves**, which
would leave the institution recoverable only by us; and a removed member's
`users` row **survives**, because it is referenced by `activity_log` and by
`verified_by_user_id` on every price they verified.

**An invited member cannot sign in until we set their password**, and the panel
says so in those words rather than implying an email is coming. That is PR-18's
deferred password reset surfacing where a customer can feel it — see §15.4.

### 15.4 The password-reset gap, restated

PR-18 deferred password reset by email and wrote: _"Do not ship `/panel` to real
institutions without it."_ That still holds and this PR does not change it.
`/panel` is built, guarded and tested; what it is not is **announced**. The
posture is the one PR-18 already established for staff: a locked-out user is
recovered by an admin, and the invite form says so plainly instead of promising
a mail that never arrives.

Before the first real institution is given a login, PR-18's reset flow —
`password_reset_tokens` plus the Resend integration — has to land. Telling a
university to email us for a password is acceptable for staff and not for
customers.

---

## 16. The claim flow (settled in PR-22)

An institution's only door into `/panel` that does not start with us creating
their account. It is credential-adjacent by construction — a completed claim
mints a login — so the decisions below are stated rather than left to the code.

### 16.1 The token

**Opaque, random, hashed, single-use, 72 h.** 32 bytes of `randomBytes` as
base64url in the link; `sha256(token)` in `claims.token_hash`, which is exactly
64 characters wide and carries the unique index redemption looks up by.

Two alternatives were live. A **signed token** (HMAC/JWT) carries its own claim
id and expiry and needs no row to verify — until single-use is required, at
which point a used-token store has to exist anyway; and it cannot be revoked, so
an admin who rejects a claim after the mail went out has nothing to delete. A
**short numeric code** typed back into the form is friendlier to mangled mail
clients, but 6–8 digits is a brute-force surface that then needs per-claim
attempt counters and lockout — more state, and more state that has to be right,
to buy back the entropy the link already had. The opaque token has all three
properties as columns on a row that already existed in the schema.

**The token hash deliberately does not use `lib/privacy/hash.ts`.** That module
salts with `PRIVACY_SALT` and falls back to a _random per-process salt_ when it
is unset — correct for IP hashes, where instability costs a rate-limit window,
and quietly catastrophic here: every outstanding claim link would stop working
on the next deploy or idle recycle, and a university would be told their
brand-new link was invalid. The salt buys nothing in this case either. It exists
because an IP address has ~2^32 values and is enumerable against a bare digest;
a 256-bit token is not. The property that matters — the database never holds the
token, so a leaked backup or a read-only injection cannot mint a login — is
fully delivered by the unsalted digest.

### 16.2 The domain rule

The claimant's email domain is compared against **`institutions.website`**, and
never against `institutions.email`. The website is a fact we hold _before_
anyone asks to claim, which is what makes it evidence; `institutions.email` is
frequently a `gmail.com` or a `tigo.com.py` address, and matching against it
would let anyone who can open a Gmail account claim that institution.

Three outcomes were possible and only two shipped. `domain` — the address is on
the institution's own domain (equal, or a subdomain in either direction) — sends
the token straight to that mailbox. Everything else routes to **admin
approval**, including the most common row in this dataset: **no website on
file**. That is a gap in our data, not evidence against the claimant, so it is a
queue and never a rejection. There is deliberately no automatic refusal: "wrong
domain" and "we hold the wrong website" are indistinguishable from here.

**DNS TXT verification** was considered and rejected for now — it is the
strongest proof available, and it requires an outbound resolver from Hostinger
and a university IT department that will answer a mail about a DNS record. The
admin fallback is the cheaper form of the same guarantee at this volume.

Free-mail and site-builder domains can never satisfy the check, **on either
side**: an institution whose website is `sites.google.com/view/…` has no domain
of its own, and an institution with `gmail.com` on file is not claimable by
anyone with a Gmail account. A public suffix (`edu.py`, `com.py`) is not a
domain, which is also what makes the subdomain relation safe — without it,
`@edu.py` would "contain" every institution in the country. The lists are in
`src/lib/claims/domain.ts`; a full public-suffix list is a dependency whose
weekly churn we would have to track, and the suffixes a Paraguayan institution
plausibly sits under is the set that matters.

### 16.3 Two states, one enum, and what a token needs before it works

A token is usable only when the claim is `pending`, unexpired, **and** either
`domain_verified` or `decided_by_user_id` is set. That is the acceptance
criterion as a pure function (`claimTokenState`), re-checked at redemption even
though a token can only be _sent_ when one of the two holds — the redundancy is
what survives someone later adding a third way to create a claim row.

`domain_verified` is the one column PR-22 added (plus `contact_name` and `note`,
without which a mismatched-domain claim is not decidable by a human). Admin
approval sets `decided_by_user_id` and **mints a fresh token** rather than
reviving the one generated at request time: the original may be days old with
its 72 hours nearly spent, and a string sitting in a column since before anybody
looked at the claim should not become live retroactively.

**`status = 'expired'` is never written.** Expiry is a fact about the clock, not
a decision anybody made, so it is computed from `expires_at` wherever it is
displayed. A cron that flipped rows into a status the code already derives would
be a moving part that changes no behaviour. The enum value stays unused on
purpose.

### 16.4 What makes the redemption safe

One transaction, and the **order of the writes is the security property**:

1. `UPDATE claims SET status='approved' … WHERE id=? AND status='pending'` —
   zero affected rows means somebody redeemed it first, and the transaction ends
   there. This is single-use; the pure state check above it races and is a
   courtesy.
2. `UPDATE institutions SET claimed_by_user_id=? WHERE id=? AND
claimed_by_user_id IS NULL` — zero rows means the institution was taken
   between the read and now, and the whole transaction rolls back rather than
   re-assigning it. **A second claim never silently re-assigns an institution.**
3. Only then the `institution_members` row.

Three refusals inherited from PR-21 §15.3, for the same reasons: a **staff**
address is never attached to an institution through a self-service path; an
account that already belongs to **another** institution is refused, because
§7.1 scopes a two-institution user to neither; and an **existing account's
password is never touched** — a claim link proves control of a mailbox, which is
enough to create a credential and is not enough to reset one somebody already
has. That case attaches the institution and tells them to sign in as usual.

**The redemption does not start a session.** It mints a credential and redirects
to `/ingresar`. A second, thinner path to a logged-in browser would have to be
kept correct forever; the ordinary login path already has PR-18's uniform
failure message and its timing defence, and one extra form is a cheap price for
this file never becoming an alternative login.

The redemption page is a **read**. Mail scanners and link previewers fetch URLs
out of messages, so a GET that consumed the token would burn every claim link on
delivery; the token is spent by the POST the form makes, and the page sets
`referrer: no-referrer` because the token is in the path.

### 16.5 Who may approve, and what PR-23/PR-25 build against

Approval is **`admin`, not `editor`**. `editor` curates the national dataset;
approving a claim hands a stranger a login and permanent write access to one
institution's commercial facts, which is the same class of act as creating a
user. Reading the queue is `editor` — it decides nothing. The roles are not a
ladder, so both are stated rather than derived.

**Downstream PRs do not import the claim flow.** A completed claim leaves the
database in the state PR-18 and PR-21 already understand — `claimed_by_user_id`
set, an `institution_admin` user, exactly one `institution_members` row — so
`/panel/leads` (PR-23) scopes with `panelInstitutionId(user)` like every other
panel route and needs no claim-specific branch. The claim flow is a way for a
member row to come into existence; it is never a second way to authorize one.
The one thing PR-25 genuinely needs is `getInstitutionClaimState(institutionId)`
(plus `assertClaimed` in guard form), because a plan cannot be activated for an
institution with nobody to hand it to. Both are stable for those PRs and are
re-exported from `src/lib/claims`.

### 16.6 Abuse

Two tiers, mirroring §6.1: the in-process sliding window on the hashed IP (3 per
minute, 10 per hour — stricter than the lead form's, because nobody legitimately
claims three profiles a minute), and a durable cap of five open claims per
institution, which a rotating IP cannot get around. A claim that fails its
checks writes nothing at all, so a prober cannot count rows or time a miss.

---

## 17. Plans, subscriptions & entitlements (settled in PR-25)

The first PR of Phase 3, and the one every other Phase-3 PR reads from.

**`subscriptions` is the only source of truth for what an institution has
bought, and `institutions.plan_id` is gone** (migration `0004`). A plan pointer
on the institution cannot express the one thing billing is about — _until when_
— so it could only ever agree with the subscription rows by accident, and the
day it disagreed the site would show a badge nobody was paying for. PR-23's
lead redaction and `rebuild-search`'s `plan_rank` were the two readers; both now
go through the entitlements layer.

**`src/lib/entitlements` is the single source of truth for gating**, in four
files with one rule each:

| File          | Holds                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------- |
| `contract.ts` | The feature vocabulary and the rank → features matrix. No I/O, importable anywhere.          |
| `resolve.ts`  | `resolveEntitlements(institutionId, subscriptions, { now, graceDays })` — pure, unit-tested. |
| `bands.ts`    | Which Verificado band a programme count is quoted. Pricing only; never consulted to gate.    |
| `index.ts`    | `getEntitlements`, `getEntitlementsForInstitutions`, `requireFeature`.                       |

**Gating is a server-side read on the request that renders or writes the gated
thing**, and `requireFeature` throws like `requireRole` does, for the same
reason §7.1 gives: a caller who ignores a returned `false` still ships. There is
no plan field on the session and no client-readable flag — a component may
_render_ differently, but nothing is decided there.

**Expiry needs no cron.** Nothing stores "revoked"; entitlements are recomputed
from dates every time. A subscription that ends tonight grants nothing on
tomorrow's first request whether or not any job ran, which is what makes
"downgrading immediately revokes gated features" a property of the model rather
than of somebody remembering to do something. `cancelled` never counts, not even
inside its paid period; `past_due` counts only inside a grace window measured
from `ends_on`, which PR-25 ships at 0 days and PR-29 makes configurable.

**Features union across subscriptions.** Destacado is an add-on held _alongside_
a Verificado subscription (`monetization.md` §3), so the answer is the union of
what counts today, not the top plan's set. Taking only the highest rank would
work today and would break silently the first time a high-ranked narrow plan
exists.

**`program_search.plan_rank` is the one derived copy**, and it is computed from
the same resolver during the rebuild (`planRanksByInstitution`). Every
subscription write rebuilds, and the nightly rebuild picks up plans that simply
ran out. Its staleness window is therefore hours and it can only affect
_ordering_: PR-27 reads badges and the "Destacado" label live, per page, through
`getEntitlementsForInstitutions(ids)` — one extra query per page, the same shape
§6.2 established for `getWhatsappNumbers` — so a lapsed plan can never leave a
paid-looking label on a page.

**Two reads, deliberately split across modules.** `src/db/queries/plans.ts`
holds the reads (plans, subscription facts) and `src/db/queries/subscriptions.ts`
the admin mutations. The split is mechanical: mutations rebuild the search index,
so that module imports `rebuild-search.ts`, which itself needs the reads — one
file would be an import cycle.

**Billing is `admin`, never `editor`**, including the _read_ of
`/admin/suscripciones`: §7's role table says an editor curates the national
dataset and does not touch money, and `editor` is the role that satisfies every
other `/admin` screen, so a mutation typed `['editor']` here would have read as
correct in review. `subscriptions.test.ts` asserts the refusal for a null
session, an `editor` and an `institution_admin`.

**A plan may only be activated for a claimed institution** (§16.5's
`assertClaimed`), because a subscription hands somebody a badge, a lead inbox
and a panel. `cancelled` is exempt: recording that a sale ended must never be
blocked by the state of the profile.

**What a plan gates, and the two places `monetization.md` §3 was wrong, are in
`monetization.md` §7** — editing your own data is free for everybody, and the
lead _delivery email_ is never gated because the consent text promises it.

### 17.1 What PR-27 settled — labels are live, ordering is indexed

`plan_rank` in `program_search` decides **order**; `getPlacementFlags(ids)`
decides **labels**, live, one query per page keyed by the institution ids the
rows already carry (the §6.2 shape). The split is the point: a few hours of
staleness in a tiebreaker is invisible, while a stale label would tell a
student a placement is paid when it is not — or hide that it is. Nothing in
the label path reads `planRank`, which `placement.test.ts` pins with a
subscription that is cancelled but still carries rank 2.

**The ordering guarantees were already built and tested in PR-07** (§4.1:
`plan_rank` is appended after the user's sort key, always) and PR-27 changed
none of it. `engine.test.ts` asserts both halves — a Destacado row never jumps
ahead of a cheaper one under `arancel_asc`, and `plan_rank` never pulls a row
into a filtered set it does not belong in.

**"Perfil verificado" says something narrow and true**: somebody at the
institution has an account here and maintains this profile. It deliberately
says nothing about accreditation, quality or price — conflating the badge we
_sell_ with the badge we _cite_ would be selling the wedge itself. The
institution profile spells that out in a sentence under the badge.

**The disclosure line renders only when a paid placement is on the page.** A
permanent notice about advertising on a page with no advertising teaches people
to skip the notice.

**`enhanced_profile` was removed from the feature matrix**, not implemented:
there is nothing to gate until institution media exists. `monetization.md` §7
carries the reasoning.

**Area-page banner placements are not built.** `pr-plan.md` PR-27 mentions
them; they need a placement table (which institution is destacado in which
área, for which period) that no schema has, and inventing one to satisfy a
line item would be a second, parallel way to sell placement alongside the
subscription. Destacado today is exactly what §17 defines: a labelled
tiebreaker wherever results appear.

---

## 18. The institution analytics dashboard (settled in PR-28)

`/panel/estadisticas`, and the monthly report a renewal conversation is built
on.

**Every number is reconcilable, and where they can disagree the page says
which one wins.** Vistas, clics a WhatsApp and apariciones en el comparador
come from `events`; **solicitudes come from `leads`**, not from the
`lead_submit` event. Those two can differ — a lead is a row that exists and can
be answered, the event is a count of a page action — and when they do, the row
is the truth, because it is also the number the institution can check against
its own inbox. Views stay browser-reported (§12), so the number survives being
questioned; an undercount is honest, an overcount is not.

**`compare_add` needs a join, and that is a consequence of §12.** The event
carries only an offering id, because `CompareLabel` (persisted to
`localStorage` by PR-09) has no institution on it. `countCompareAppearances`
resolves the institution by joining `program_search` — the same table the
comparador reads, so a row that could be compared is a row that can be counted.

**Month-over-month means two different things and both are implemented.** A
rolling window (7/30/90 days) compares against the equally long window
immediately before it. The **monthly report compares against the previous
calendar month**, not the previous 31 days: July back-shifted by its own length
lands on 31 May and counts a day of May as June. `analyticsForRange` therefore
takes the comparison range explicitly rather than deriving it, and
`analytics.access.test.ts` pins both.

**A percentage change from zero is not reported.** `deltaPct` returns null when
the previous period was zero and the UI says "sin base de comparación" — "up
100%" from nothing is arithmetic dressed as a result, and the first month of
every institution's data would be full of them.

**PDF is the browser's print dialog, deliberately.** The alternatives were
`puppeteer` (a second Chromium on a shared Hostinger slot) or a PDF layout
library (a second layout engine to keep in sync with the page forever). The
report page is designed to print instead: `print:hidden` on the shell,
single-column layout, selectable text, working links. One layout, one set of
numbers, no dependency.

**The free tier sees the four totals and the comparison; the per-carrera
breakdown, the daily series and the export need a plan.** The gate is
`getEntitlements` inside `db/queries/panel/analytics.ts`, and
`panelMonthlyReport` asserts `monthly_report` itself — the CSV route and the
printable page both read that one function, so a check in either would leave
the other open.

**No function in this module takes an institution id.** The scope comes from
`panelInstitutionId(user)` and nowhere else, which is what
`analytics.access.test.ts` asserts: it records every parameter that reaches the
database and fails if another institution's id ever appears in one, or if the
session's own id is missing — the PR-21/PR-23 shape, aimed at the query
parameters rather than at an error message.

---

## 19. Billing operations & renewals (settled in PR-29)

PR-25 built the model; this is the operating layer around it. No payment
gateway — `monetization.md` §5 rules one out until self-serve cursos exist, and
fifteen contracts a year do not pay for one.

**Reminders fire "at or inside" a threshold, not on an exact day.** The obvious
rule — `ends_on - today === 30` — silently drops a notice whenever the cron
misses that one day (a deploy, a restart, an hPanel cron that skipped), and
nobody finds out until a renewal is missed. So a threshold is due once the
subscription is inside it and that threshold has not been recorded for this
period. A missed run catches up; an hourly run sends nothing extra.

**Idempotency is a UNIQUE key, not a flag.** `subscription_reminders
(subscription_id, period_ends_on, threshold_days)` — sending is inserting the
row, and a second run inserts nothing. `period_ends_on` is in the key so that
**renewing re-arms the notices**: a new period is a new 90/30/7. The row is
written _after_ the mail leaves, because a notice marked sent that never went
is the failure the table exists to prevent, and a duplicate is the cheaper
mistake. Only the **narrowest unsent** threshold fires per run, so an account
first seen five days out gets one mail, not three.

**The digest goes to the operator, not to the institution.** The sales motion
is a WhatsApp thread, a meeting and a factura issued by hand (§5); the useful
artefact 90 days out is the operator knowing which contracts are coming up,
before the institution's budget is set. An automated "tu suscripción vence"
mail to a university that has not been quoted a renewal is a dunning notice in
a relationship that is not transactional. Adding the institution as a recipient
is a one-line change once there is a quote to put in the mail; the thresholds
and the idempotency do not change.

**Past-due extends, it never revokes.** An `active` subscription that runs out
stops granting features at `ends_on` on its own — `resolveEntitlements` reads
dates, not statuses. Marking it `past_due` is what _starts_ the grace window
(`BILLING_GRACE_DAYS`, default 15). So a sweep that fails to run can only
under-grant: the customer loses grace they were owed, and never keeps features
nobody paid for. That is why the sweep is not load-bearing for correctness, and
why the grace default is 15 rather than 0 — a bank transfer plus a hand-issued
factura does not clear in a day.

**A cron never cancels.** `graceExpired` is reported and acted on by nobody:
the subscription already grants nothing, and ending a commercial relationship
is a decision a person makes. The row keeps its invoice and its period.

**`BILLING_GRACE_DAYS` is read per call, not captured at import.** Changing a
grace period on a live site should be an env change and a restart, not a
redeploy. An unparseable or negative value falls back to the default rather
than to 0 — a typo in an env var must not quietly switch off every paying
institution's features — and it is capped at 90.

**`activity_log.user_id` is now nullable in the type as well as the column.**
The sweep is a write nobody made; inventing a "system user" would make an
automated write indistinguishable from a staff member's in every report we ever
build.

**The revenue view says "contratado", never "cobrado".** This app does not know
whether a transferencia arrived. USD figures are list price × subscriptions
currently in force — the same predicate `resolveEntitlements` applies, so the
spreadsheet cannot claim a customer the site is no longer honouring — and the
guaraní figure is the sum of what was actually invoiced.

---

## 20. Editorial & the accreditation hub (settled in PR-30)

**Posts are DB-backed, not MDX.** §1 allowed either; the deciding fact is that
the person writing them is the operator, from a browser, and MDX would make
every typo a git commit and a Hostinger rebuild. `posts` carries its own
`author_name` as a string rather than a `users` reference — a byline is an
editorial fact, and deleting a staff account must not rewrite the authorship of
published work.

**Markdown is a small subset rendered to React elements, not HTML.**
`src/lib/content/markdown.ts` parses (pure, unit-tested) and `Markdown.tsx`
renders. Nothing in the pipeline ever produces an HTML string, so an editorial
body containing `<script>` is _text_ by construction rather than by a
sanitizer's configuration — which is also why no markdown or sanitizer
dependency was added. Unsupported constructs degrade to visible text so an
editor can see that they did not work, and a link whose scheme is neither
relative nor `http(s)` renders as plain text, which closes `javascript:` without
a sanitizer in the loop.

**`seo.md` §7's "no orphans" rule is enforced in validation, not by
discipline.** `parsePostInput` refuses to **publish** a post that does not link
to at least one money page with anchor text that describes it — "acá", "click"
and anything under four characters do not count. A draft is allowed to be
unfinished.

**Publishing stamps `published_at` once.** A later edit is an update, not a
republication; moving the date would reorder the blog every time a typo is
fixed. An explicit date always wins, which is what makes scheduling and
backdating work.

**The accreditation explainer lives in the page file, not in the database.**
That is a deliberate exception to "the operator edits content without touching
code": this text is what we assert about ANEAES and CONES, and getting it wrong
is `risks.md` §R-09 pointed at our own foot — so it is reviewed in a diff by
whoever merges. Career and área copy, where the risk is dullness rather than
defamation, stays editable in `/admin`.

**The checker is a GET form over `searchPrograms`.** It shows the badge we
actually hold with its source, or says we could not verify one; it never
answers "no acreditada" from an absence of data. Being a GET means every answer
has a shareable URL and it works with JavaScript off.

**JSON-LD starts here, deliberately small.** `src/lib/seo/jsonld.tsx` holds
`Article` + `Person`, `BreadcrumbList` and `FAQPage` — the three the editorial
pages need. PR-16's full SEO pack has not shipped; this is the shape it can
extend rather than replace. The FAQ markup is generated from the same constant
the page renders, so schema cannot drift from visible content (§5).

**`/admin/areas` edits descriptions and sort order only.** Áreas are the browse
taxonomy the matcher maps onto and their slugs are in indexed URLs, so creating,
renaming or deleting one is a seed change, not a form field. The list shows each
área's word count against `MIN_EDITORIAL_WORDS`, because that number is what
decides whether its hub is `noindex` (`seo.md` §4.1) and an editor should not
have to discover it by publishing.

---

## 21. Becas (settled in PR-31)

**`source_url` is NOT NULL.** A beca is money somebody is promising a student;
an unsourced one is the most damaging row this site could hold. The column
enforces it, `parseBecaInput` explains it, and the public page renders the link
— publishing it is what earns us the right to publish the rest.

**Coverage is an enum with an explicit unknown.** `total` / `parcial` /
`monto_fijo` / `sin_datos`, and a CHECK ties the amount to the coverage: a
"cubre el 100%" row cannot also carry a guaraní figure, and a "parcial" row
cannot omit its percentage. `sin_datos` renders as "no sabemos cuánto cubre"
rather than as blank space — same rule as "Sin datos de acreditación", and for
the same reason: this is the field a reader fills in optimistically.

**Expiry is a query predicate, not a cron.** A beca past its deadline leaves
the listing and the sitemap on the day it closes, because `livePredicate`
compares against the request's own date. A job would leave a window between the
deadline and the next firing — exactly the window in which a student plans
around a date that has passed. A beca with no deadline stays listed:
"convocatoria permanente" is real, and treating null as expired would hide it.

**A closed beca is not a 404.** The link may be in somebody's WhatsApp thread,
so the detail page still renders, says "esta convocatoria ya cerró", and goes
`noindex, follow` — readable for whoever has the link, and out of the index
because it is no longer an answer to anybody's search.

**Provider is required in one of two forms**: an institution from our index, or
a typed name for the ones that are not (Itaú, MEC, Becal). "Hay una beca"
without saying whose is not information.

**Every save re-stamps `verified_at` with the saving user**, the same argument
§14.2 makes for `bulkVerify`: a beca is a dated claim about someone else's
money, and "who said this was still true, and when" is the question that gets
asked when it turns out not to be.

---

## 22. Salida laboral & empleos relacionados (settled in PR-32)

Two things, scoped deliberately narrow, because `risks.md` §R-11 and §R-15 both
point here.

**No numbers, and the reason is written where the editor sees it.**
`salida_laboral_md` is qualitative: where graduates work, which sectors hire,
what a first job looks like. No average salary, no employment rate, no
"carreras mejor pagadas" — Paraguay has no citable dataset for any of it. That
rule **cannot be enforced by a validator** (a regex cannot tell "cinco años de
carrera" from "el 80% consigue trabajo"), so what is enforced instead is that
the rule and the section template are in the admin field label, at the moment
of writing. `src/lib/careers/salida-laboral.ts` holds both.

**Sections, not a paragraph.** Four suggested `##` headings, because "¿dónde
trabajan?" and "¿cómo es el primer trabajo?" are separate questions a student
asks and separate headings a search engine or an AI answer can quote.
`hasSalidaLaboral()` treats an empty template as absent, so a form somebody
opened and saved does not render four empty sections.

**`/carreras/[carrera]/empleos` is a landing page that sends traffic onward.**
It shows the qualitative copy plus a handful of real, dated, attributed
postings, then links to trabajo.com.py with the career pre-filled. There is no
application form, no candidate profile, no employer account and no saved
search: §R-15 names that drift specifically, and trabajo.com.py already exists.
The outbound link carries no affiliate or tracking parameter — if that ever
changes it is a `monetization.md` decision, not a parameter somebody adds here
quietly.

**No scraper ships, and that is a decision rather than an omission.**
`pr-plan.md` allowed "scraped with attribution or a light integration".
Scraping a Paraguayan job board without an agreement answers a terms-of-service
question on somebody else's behalf and adds a parser to maintain against a site
we do not control. What ships is the storage, the attribution and the entry
form; a handful of curated postings per carrera is what the page needs, and an
integration can fill the same table later without changing a line of the page.

**Expiry is the becas rule again**: shown while `expires_on` — or `posted_on +
45 days` when the source states none — is still ahead of the request's own
date. A vacancy filled a month ago is worse than no vacancy at all, and a cron
would leave a window. `UNIQUE (url)` is what stops the same aviso being listed
twice.

---

## 23. The freshness system, and the stale-price reversal (settled in PR-33)

### The policy change

**Before:** an arancel with `verified_at` older than twelve months was hidden
everywhere — the amounts were nulled in `row.ts` before any component saw them,
and the page said "Consultá el arancel". The reasoning was that a wrong number
is worse than no number.

**After:** the number is **shown, dated and warned about**. `priceFreshness()`
replaces `isPriceDisplayable()` and returns `fresh | stale | unknown`;
`PriceSummary` carries `freshness` and `hasAmount` instead of `isDisplayable`;
`priceDisplay()` returns the amount **and** its staleness in the same call, so
no component can render one without the other. The warning is a badge beside
the number on cards and rows, a banner above the numbers on the programme page,
a dated cell in the comparador, and a line in the OG image — because a shared
image is read with none of the page around it.

**Why.** Hiding produced a directory that shows nothing for most carreras (the
data decays annually and re-verification is manual — `plan.md` §6) while the
same stale number stayed on the university's own site, uncontradicted and
unlabelled. Hiding protected nobody: it removed our one chance to say "this is
from 2024". What did not change is the rule underneath — never present a stale
number as current, never invent one.

**Stale prices are now filterable and sortable too.** While the number was
hidden, excluding it from a range filter was the only coherent option — you
cannot filter on what the reader cannot see. Now the consistent rule is the
honest one: what you can read, you can filter on. The alternative is a carrera
visibly quoting Gs. 1.200.000 vanishing from "hasta Gs. 1.500.000", which reads
as a bug and hides exactly the cheap options a family is looking for.

**`Offer` JSON-LD still requires a price verified within 12 months**
(`seo.md` §5). The two rules only look inconsistent: a warning is something a
human reads, and a rich result is something a machine repeats stripped of its
context. Schema mirrors what is _asserted_, not merely what is drawn.

**The 24-month lead purge is untouched by any of this** and still deletes.
Showing an old arancel with a warning is a judgement about usefulness; keeping
somebody's phone number past what we told them is a broken commitment
(`risks.md` §R-06).

### The freshness system

**Staleness is scored, not just counted.** `/admin/frescura` could say "600
aranceles vencidos"; it could not say which to do first. `scoreFreshness()` is
overdue-days × a **stated** weight (accreditation 4, published price 3,
admission 2, draft price 1 — the only judgement in the formula, written down
rather than tuned). A never-verified record scores as exactly one interval
overdue rather than infinite: infinity would park every unverified row at the
top forever and bury the ones we published a number for and then let rot, which
are the ones that actively mislead somebody.

**Every §10 cron now exists.** `rebuild-search`, `admissions`, `staleness`,
`purge-leads`, plus PR-23's and PR-29's — and `sitemap` answers `not_needed`
rather than staying a scheduled no-op, because `app/sitemap.ts` is generated per
request.

- `admissions` re-derives `offerings.enrollment_status` through the admin's own
  `applyEnrollmentStatus`, widest scope first, so the "a narrower window wins"
  rule (§14) has one implementation rather than two that can drift.
- `staleness` **reports and never acts**. Nothing re-verifies automatically —
  re-verification is a person asserting something is still true (§14.2), and a
  job that did it would be the quiet extension of a wrong number that section
  exists to prevent. It also sends **nothing** when there is nothing to do: a
  weekly "todo al día" is a mail that trains you to ignore the weekly mail.
- `purge-leads` is the only destructive job in the codebase.

**"Última actualización" is on every page that shows maintained data**
(`FreshnessNote`). With nothing verified it says so instead of rendering
nothing — an empty space is not information.

---

## 24. Performance, accessibility & the CI budgets (settled in PR-34)

**The JS budget is enforced, not remembered.** `npm run perf:budget` reads the
manifest `next build` just wrote, gzips every chunk each route loads at level 9
and fails when a **public** route exceeds §9's 150 kB. It runs in CI right
after the build, needs no database and no server. It measures rather than
scraping `next build`'s table, because that table is human output whose format
belongs to Next: a budget that depends on scraping it breaks on an upgrade with
no signal.

`/admin` and `/panel` are exempt, with the reason in the script: they are staff
tools used on a laptop, and `AdminForm`'s `useActionState` — which keeps a
half-filled form alive through a validation error — is worth its kilobytes
there in a way it would not be to a student on 4G.

**Lighthouse runs against a deployed URL, on demand, and is deliberately not a
PR check.** Every SEO surface is `force-dynamic` against MySQL (§3) and CI has
no `DATABASE_URL`, so a run inside the PR check would measure error pages and
report a number that means nothing — a green build that audited 500s is worse
than no audit. `.github/workflows/lighthouse.yml` is `workflow_dispatch` with a
URL input, and `lighthouserc.json` carries the budgets: LCP < 2.5 s, CLS < 0.1,
TBT < 200 ms on throttled mobile, accessibility and SEO at 100.

**The a11y rules `next/core-web-vitals` ships as warnings are errors here.**
Every one of them is a mistake that makes the site unusable with a keyboard or
a screen reader, and "it is only a warning" is how a warning survives for a
year. Promoting them found two real defects: `Button`'s anchor form spread its
children so the linter could not see a link's text, and `LeadModal`'s backdrop
was a `div` with a mouse handler — a control a keyboard could never reach. It
is now a labelled `<button>`.

**One skip link, in the root layout, targeting a `#contenido` wrapper in each
of the three shells.** `/carreras` puts ~40 filter links before the first
result; without a skip link, reaching the results with a keyboard means tabbing
through the entire rail on every navigation. Three edits rather than eighty:
the id lives on the layout's content wrapper, not on each page's `<main>`.

**A focus floor and a motion floor in `globals.css`.** `:focus-visible` on
every interactive element that did not set its own ring, so a control nobody
thought about is still visible to a keyboard; and a global
`prefers-reduced-motion` block, because `design-system.md` §6 says the whole
motion list is disabled under it and a component that ships a transition
without asking should not be an exception.

**Images:** `next/image`'s `remotePatterns` is derived from
`S3_PUBLIC_BASE_URL` — the same variable the uploader writes to, so the bucket
hostname is not hardcoded in two places — with sizes trimmed to what this site
actually renders (square logos; there is no hero photography, §14). Immutable
caching for `/_next/static/*`, whose filenames are content-hashed. The
homepage logo strip keeps its plain `<img>` for the reason `design-system.md`
§14 already records; with a bucket configured, switching it to `next/image` is
now a one-line change rather than a config discussion.
