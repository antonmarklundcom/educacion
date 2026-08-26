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

**`/carreras` is `force-dynamic`, and the detail pages are too until a build-time database exists.** (They still are after PR-43 — the caching sits one layer below the route, in the read paths themselves. See §27.) The browse page is a function of `searchParams`, so there is nothing to prerender; the SEO surfaces are dynamic for a more boring reason — CI runs `npm run build` without a `DATABASE_URL`, so any `generateStaticParams` would have to fabricate or fail. Server-rendered HTML is fully crawlable either way, and the ISR cache on Hostinger is per-instance and wiped on redeploy, so the loss is an optimization rather than an SEO property. Revisit in PR-16, which owns the SEO pack.

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

**Dates come from Node, not `CURDATE()`.** The pool is pinned to UTC and the MySQL session timezone on shared hosting is not ours to guarantee, so any date a comparison needs is passed in as a parameter. Since PR-33 the arancel needs none: age no longer decides what may be displayed.

**One price predicate, since PR-33.** This paragraph used to describe two — `isPriceDisplayable()` for rendering and `price_expires_on > :today` for filtering, with a written rule about which was the more permissive. PR-33 deleted the first (there is no such function in the repo) and stopped filtering on the second, because age no longer decides what may be shown. What survives is `priceFreshness()`: one classification, derived per read from `verified_at`, travelling on every `PriceSummary` as `fresh | stale | unknown` and rendered by `priceDisplay()` as the number **and** its warning in one call. `price_expires_on` is still written by the rebuild and still read by `/admin/frescura` and the `Offer` gate; it filters nothing a visitor sees.

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

### 6.1.1 Login rate limiting (PR-42)

The 2026-08 audit's one security inconsistency: `checkRate` guarded the lead form, the event
beacon, the claim request and the password-reset form, while `/ingresar` — the one endpoint
where a guess *succeeds* — called `authenticate()` bare. `src/lib/auth/rate-limit.ts` closes
it, with two departures from the obvious design that are the whole point of the section.

| Key | Limits | Stops |
| --- | --- | --- |
| hashed IP | 30/min, 60/hour | one machine grinding a dictionary |
| hashed (address, IP) **pair** | 5/min, 20/hour | one machine grinding one account |

**There is no global per-address counter, deliberately.** "Per IP plus per email" is the
obvious second tier and the one PR-42's brief names. A global per-email counter with a hard
refusal is a remote account lockout, and a cheap one: the key is a string the attacker types,
`checkRate` charges rejected attempts too, so ~21 requests an hour — a fifth of the IP budget,
from one ordinary address, with no header spoofing at all — holds any account the attacker can
name locked out indefinitely, and the victim's own retries top the window back up. That is a
denial-of-service tool wearing a rate limiter's clothes, and it is the worse trade: online
guessing is already bounded by the KDF's cost, while locking a paying institution out of its
panel during admissions is not. Keying the second tier on the **pair** keeps the realistic
protection and raises a lockout's price from "know the address" to "know the address *and*
the IP it will be used from". That is a higher bar, not an impossibility, and the honest
statement matters: `x-forwarded-for` is forgeable, so somebody who knows an institution's
static office IP can still construct its pair, and the per-IP tier is itself a lockout of
everyone behind one address — true of every IP-keyed limiter here. What makes both
survivable is the charging rule below: a blocked key is not charged, so a window **drains**
once an attacker stops, rather than being held down by the victim's own retries as it would
have been under a global counter. What is given up — one dictionary spread thin across a
botnet, invisible to both tiers — is not bought at the price of handing every visitor a
lockout button. `risks.md` §R-16 records the trade and what is still unsolved.

**Charged on the way in, refunded on success.** `checkRate` records every attempt, success
included, which is right for a lead or an email and backwards for a credential check: a
school lab or a cyber café — the exact case §6.1 says the limits must tolerate — would lock
itself out by *signing in successfully*. But the obvious repair, "peek now and charge the
failure afterwards", is worse than the problem: discovering the outcome takes three `await`s,
so every concurrent request peeks before any of them records and the limit stops binding at
all — a burst then bounded only by the attacker's connection count, on the one endpoint
running a deliberately expensive KDF. Measured at 50 concurrent requests against a cap of 5,
all 50 reached `authenticate()`.

So the attempt is charged at decision time — `loginAllowed` and `chargeLoginAttempt` are
synchronous and adjacent, which is atomic on one event loop — and a success is *refunded*:
`settleLoginSuccess` clears the pair key outright and gives back the single IP timestamp the
attempt cost (`refundRate`). An attempt that throws before it was verified — the database
unreachable, hashing itself failing — is refunded too (a wrong password is not one of
these: `verifyPassword` returns `false` rather than throwing, by design), because nothing was checked and a blip
of ours must not spend a waiting user's quota. Failures stay charged, and a concurrent burst
is counted as it arrives. The IP key is refunded by one rather than cleared: clearing it
would let an attacker owning one valid account reset their whole budget at will.

**A success costs nothing once settled — but it holds its charge while it is in flight**, so
the per-minute rules are concurrency caps as well as rate caps. That is why the IP burst limit
is 30 and not 10: sign-in is the slowest request on the site by design, the population behind
one hashed IP is a NAT, and at 10 an eleventh person pressing "Ingresar" in the same moment
was refused with a correct password — the school-lab case §6.1 promises to tolerate. 60/hour
is the rule that actually bounds a sustained attack. The pair tier's 5 caps simultaneous
attempts on one account, which no legitimate person reaches: two tabs and a phone is three.
The headroom costs queue latency rather than memory — scrypt runs on the 4-thread libuv pool,
so 30 in flight is ~4 concurrent derivations with the rest queued — which stops being true if
anyone raises `UV_THREADPOOL_SIZE`.

Refusals are logged at most once per key per minute. A refused attempt is the cheapest request
the endpoint serves, so logging every one would hand an attacker who has already exhausted a
key an unbounded log-volume amplifier that the limiter cannot throttle, refusal being the
throttled state.

Two properties beyond those, both covered by tests that fail without them:

1. **The pair key is built from the submitted address, before any lookup.** Keying it on
   accounts that were found would make the rejection appear only for real addresses — the
   limiter itself becomes the enumeration oracle that `login.ts`'s decoy hash exists to
   prevent. `src/app/(auth)/ingresar/actions.test.ts` asserts the call order in the action,
   not just the helper: a rate-limited request must never reach `findAccountByEmail`.
2. **The failure path is untouched.** A request that reaches `authenticate()` still returns
   `LOGIN_ERROR` after the decoy hash, with the same timing for every reason. The rate-limit
   message is separate, describes the request rather than the credentials, and names nothing
   about an account. Rejection is allowed to be *fast* — both keys are chosen by the caller,
   so its speed leaks nothing.

Same caveat as §6.1, stated rather than assumed: `x-forwarded-for` is client-forgeable and
Hostinger's proxy appends rather than replaces, so the IP tier is defeated by rotating it, and
this tier is per-process and per-boot. It raises the cost of a flood. What actually bounds
credential guessing is the password hash's own cost — there is no durable backstop here, and
the pair keying is what makes that acceptable rather than alarming.

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

**Password reset by email was not built in PR-18** — it needs a `password_reset_tokens` table and a Resend integration, neither of which was verifiable from the environment that PR was written in, so shipping a half-tested credential-recovery path was the worse option. `/cambiar-contrasena` closes the loop the bootstrap opens — re-authenticate with the current password, clear the flag, re-issue the cookie — and until reset landed a locked-out user was recovered by an admin. **PR-35 closes that gap** (§25); the constraint it was blocking, "do not open `/panel` to real institutions without it", is now satisfied.

**The bootstrap script cannot leave a default credential in place.** There is no default password: it generates a random one, prints it once, sets `must_change_password`, and refuses to run at all once an active admin exists — so it is the bootstrap, not a shell back door for minting admins.

---

## 8. Data integrity & provenance

Every fact that a user could act on carries provenance. This is non-negotiable given the accreditation wedge.

- `source_records` — raw imported rows kept verbatim (source name, fetched_at, payload JSON, checksum). Never edited.
- Curated tables reference the source record they came from.
- `verified_at` + `verified_by` on prices, accreditations and admissions.
- The UI shows "Actualizado: {date}" on every price and accreditation badge. An arancel older than 12 months is **displayed with a visible "dato desactualizado" warning**, not hidden — §23 reversed the original hide rule and CLAUDE.md rule 3 is the current wording.
- Admin edits write to `activity_log` (actor, entity, before/after JSON, timestamp).

---

## 9. Performance budget

Inherited from `conversion-design` and `seo-web-builds`:

- LCP < 2.5 s on 4G, CLS < 0.1, INP < 200 ms.
- Total JS ≤ 150 kb gzipped on public pages. The browser page is the risk: keep FilterRail and ResultTable as server components, only the compare bar and the modal are client.
- Fonts: IBM Plex Sans + IBM Plex Mono, self-hosted via `next/font`. Six weights, which
  `design-system.md` §3 has always said and this line used to contradict with "max 4";
  the count is not the cost anyway — Google serves Plex Sans as one variable file, so
  its four weights are one ~40 kB request. Mono is `preload: false` (§36).
- Institution logos: WebP, explicit dimensions, ≤ 20 kb each, lazy below fold.
- Enforced in CI with a bundle-size check (PR-34).

---

## 10. Cron / scheduled work

Hostinger managed Node has no built-in scheduler you should rely on. Use hPanel cron hitting authenticated route handlers:

| Job                                                          | Cadence           | Route                          |
| ------------------------------------------------------------ | ----------------- | ------------------------------ |
| Search index rebuild                                         | nightly 03:00 -03 | `/api/cron/rebuild-search`     |
| Data-staleness scan → admin digest                           | weekly Mon        | `/api/cron/staleness`          |
| Convocatoria status transitions (abiertas/cerradas by date)  | daily 05:00       | `/api/cron/admissions`         |
| Lead-delivery retry for failed notifications                 | hourly            | `/api/cron/lead-retry`         |
| Lead email digest, per institution with `status='new'` leads | daily 08:00 -03   | `/api/cron/lead-digest`        |
| Sitemap regeneration                                         | nightly           | `/api/cron/sitemap`            |
| Past-due sweep (ended subscriptions → `past_due`)            | daily 06:00 -03   | `/api/cron/subscription-sweep` |
| Renewal reminders (90/30/7 days), one digest to the operator | daily 06:15 -03   | `/api/cron/renewal-reminders`  |

All guarded by `CRON_SECRET`, sent as the `x-cron-secret` header (`src/lib/cron/auth.ts`, PR-23). All idempotent.

The offset is **−03:00, permanently**: Paraguay abolished DST in 2024, so the
old `-04` in this table was wrong for every month of the year. `asuncionToday()`
(`src/lib/format/date.ts`) is the code-side statement of the same fact.

### 10.1 What PR-23 settled — `lead-retry` and `lead-digest`

`/api/cron/[job]` was a routing stub until this PR (`docs/deployment.md` §6 said so explicitly); it now handles these two jobs and still answers `not_implemented` for the rest, which ship with their owning PRs.

`lead-retry` re-runs `notifyInstitution` for every `status='new'`, `delivered_at is null` row (`src/lib/leads/retry.ts`) — the same call `submitLead` already makes once, inline. It is idempotent by construction: a lead marked `sent` no longer matches the query that finds it, so firing the cron twice in the same hour is a wasted read, not a duplicate email.

`lead-digest` (`src/lib/leads/digest.ts`) is deliberately **not** "leads since the last digest" — there is no persisted "last sent" clock, and PR-23 was told to stop and ask before adding a schema change rather than add one for this. It reports a live count instead ("tenés N solicitudes sin responder"), which is both true and safe to re-send: a double-fire repeats the same honest sentence rather than duplicating or dropping a lead. Read "all jobs are idempotent" above that way for this job specifically — no double-counted data, not "never sent twice".

---

**PR-46 correction.** "Idempotent by construction" was true only of the case
this section considered — a second cron firing *after* a completed run, since a
lead marked `sent` no longer matches `listUndeliveredLeads`. It was not true of
a failed final write, and it is not true of two overlapping invocations.

The first is fixed: `retryLeadDelivery` marks each lead the moment its mail is
accepted, so a failed write costs one repeat rather than the whole batch's. The
second is not, and is a trade rather than an oversight: a claim step
(`UPDATE … WHERE status='new'`, send only if one row was affected) would turn
every send failure into a **lost** lead instead of a repeated one, and at one
hourly hPanel entry the overlap does not happen. At-least-once is the right side
to err on for a lead; the sentence now says so instead of implying at-most-once.


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
12 months **is still shown** in the comparador and on the programme page,
carrying a visible "dato desactualizado" and the month we last verified it
(§23), and is withheld only from `Offer` JSON-LD, which a machine repeats
stripped of that warning. So `pricesExpired` counts carreras currently quoting a
number we are hedging on — the queue whose whole cost is paid in credibility.
PR-33 owns the automated half — the weekly digest, the cron, the public
"última actualización" surfaces. This is the
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

### 15.4 The password-reset gap, closed in PR-35

PR-18 deferred password reset by email and wrote: _"Do not ship `/panel` to real
institutions without it."_ PR-21 did not change that, and said so here: `/panel`
was built, guarded and tested, but not **announced**, and the invite form told
the truth — an admin sets the password — instead of promising a mail that never
arrived.

**PR-35 built the flow** (§25), so the block is lifted. The invite note now
points a new member at `/recuperar-contrasena` rather than at us.

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
the label path reads `program_search.plan_rank` — PR-46 verified that across
every consumer in `src/components`, `src/lib/seo` and `src/app`, and it holds.
What `placement.test.ts` pins is narrower than its name suggests: it varies
`SubscriptionFacts.planRank` (a `plans.rank` value), not the index column, so
it is a second cancelled-subscription case rather than a guard on the index.
The property that *is* enforced by a test is the one in
`rebuild-search.plan-rank.test.ts` — the index boosts exactly what the label
path labels.

**The ordering guarantees were already built in PR-07** (§4.1: `plan_rank` is
appended after the user's sort key, always) and PR-27 changed none of it.
`engine.test.ts` asserts both halves — a Destacado row never jumps ahead of a
cheaper one under `arancel_asc`, and `plan_rank` never pulls a row into a
filtered set it does not belong in.

**PR-46 correction — those two tests did not, until PR-46.** The independent
review promoted `plan_rank` to the *primary* sort key, i.e. paid placement
fully overriding the user's choice, and all 28 tests passed: the first test
scanned one page of results, and the fixture holds enough rank-2 rows to fill
it, so no adjacent pair ever crossed a rank boundary. The second asserted only
that every row matched the filter, which a filter test already does. They are
now a property over every cross-rank pair, and a check that a named boosted
excluded row is absent.

**And PR-46 fixed what neither was ever going to catch**: `plan_rank` was
written from the entitlement's *rank*, so **Verificado** — which does not buy
`priority_placement` — was boosted on every default-sorted page while
`placementFlags().destacado` stayed `false` for it. No badge, no disclosure,
paid ordering. `planRanksByInstitution` now gates on the entitlement, and
`rebuild-search.plan-rank.test.ts` asserts the equivalence directly: a row is
boosted **iff** the label path would label it.

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
mistake. Only the **narrowest applicable** threshold fires per run, so an account first
seen five days out gets one mail, not three.

**PR-46 correction: "applicable", not "unsent".** The shipped code took the
narrowest *unsent* one, which meant that once the 7-day notice had gone, the
next run fired the next-widest — "faltan 4 días" under the 30-day heading, then
"faltan 3 días" under the 90-day one. Three mails, spread over three days,
each labelled with a threshold the period had already passed. A threshold that
has been overtaken is not a reminder waiting to be sent; it is one that no
longer applies. `renewals.test.ts` now walks consecutive days rather than
asserting a single run.

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
rather than staying a scheduled no-op, because the sitemap index is generated per
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

> **Never actually run, until PR-53.** §36 has the first real numbers, the two
> site defects and the two harness defects they found, and the command that
> reproduces them against any serving origin.

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

---

## 25. Password reset by email (settled in PR-35)

The one deferral PR-18 left open, and the last thing standing between `/panel`
and a real customer. It is credential-recovery, so every decision below is a
security decision stated out loud rather than left in the code.

### 25.1 The token is the claim token, again

`password_reset_tokens (user_id, token_hash, expires_at, used_at)` — 32 random
bytes, base64url, **stored as an unsalted SHA-256 digest** and never as
plaintext. Same construction as §16.1 and for the same reasons: the secret is
already 256 bits of entropy, so a salt buys nothing a dictionary attack could
have exploited, and an unsalted digest is what makes the lookup a `UNIQUE`
index hit instead of a table scan. A database dump therefore contains no usable
reset link. TTL is **60 minutes**, not the claim flow's 72 hours: a claim waits
on somebody finding the mail in a rectorate inbox, a reset is somebody sitting
at the login screen right now.

### 25.2 The request path answers the same sentence to everybody

Unknown address, suspended account, address that exists — one screen, one
wording, and **no row is written** in the first two cases. That last part is
the property the test asserts, because a caller that minted a token for a
suspended user would still render the same sentence and look correct in a
browser while leaving a detectable trace. It is §7.1's uniform-failure rule
extended from login to recovery: the two paths would otherwise disagree, and an
enumeration oracle only needs one of them.

Rate limits are per-address and per-IP (3/min, 10/hour) so the form cannot be
turned into a mail cannon aimed at somebody else's inbox.

**One bit is leaked deliberately.** When a send fails we say so — "no pudimos
enviar el correo" — which is only reachable for an address that exists. The
alternative is a locked-out user staring at a success screen waiting for a mail
that is not coming, with the admin-recovery path we just removed. An operator
can fix a mail outage they are told about.

### 25.3 The link is spent by the POST, never by the GET

Opening `/recuperar-contrasena/<token>` is a **read**: it renders a form or an
honest refusal, and the page sets `referrer: 'no-referrer'` so the token does
not walk out in a Referer header. Only submitting the new password consumes it —
otherwise a mail scanner that prefetches links would burn every reset link in
transit.

Single-use is enforced by the database, not by the check above it:
`UPDATE … SET used_at = NOW() WHERE id = ? AND used_at IS NULL`, and **zero
affected rows ends the transaction before the password is touched**. The pure
`resetTokenState()` check is a courtesy that races; the conditional update does
not. Order inside the transaction is the guarantee: claim the token, then write
the password, then **invalidate every other outstanding token for that user** —
a reset is the moment to assume the older links are somewhere they should not
be. The scrypt hash is computed _before_ the transaction opens, so a deliberate
100 ms KDF does not hold a row lock.

### 25.4 A reset does not start a session

Same call as §16.4: the flow ends at `/ingresar` with the new password, not at
a logged-in browser. A second path to a session is a second path to keep
correct forever, and the ordinary login already carries the uniform failure
message and the decoy-hash timing defence.

### 25.5 Housekeeping

Spent and expired rows are deleted by the existing `purge-leads` cron rather
than by a sixth job — a used token proves nothing and its digest is the only
thing in the table worth not keeping.

---

## 26. Accounts, and onboarding without email (settled in PR-36)

§25 shipped password reset and closed PR-18's deferral. It left a gap nobody had
written down: **every route into an account went through a mailbox.** The claim
flow mails a token, reset mails a link, and `bootstrap-admin.ts` mints exactly
one staff account and then refuses to run again — by design, so it is not a
shell back door. With Resend unconfigured, the site could not onboard a single
institution. Not a missing nicety: a closed front door.

`/admin/usuarios` is the second door, and it does not touch the network.

### 26.1 The admin-issued access link

An admin creates the account and generates a link, then hands it over by
WhatsApp or on the phone. **It is the same `password_reset_tokens` row §25
built** — same unsalted SHA-256 digest at rest, same single-use
`UPDATE … WHERE used_at IS NULL`, same invalidation of the user's other
outstanding links when it is spent, same page redeems it. Two things differ:

- **72 hours, not one.** The one-hour window is calibrated for a link anybody
  can cause to be sent, to an inbox we do not control, by typing an address
  into a public form. This one is handed over by a member of staff who verified
  who they are handing it to, through a channel where "open this within the
  hour" is a support ticket rather than a security control. 72 h is the claim
  flow's number (§16.1), chosen for the same reason.
- **It is shown once.** The plaintext is returned in the server action's result
  and rendered on the admin's screen; it is never written to `activity_log`,
  never re-derivable, and gone on navigation. An admin who loses it generates
  another, which costs nothing — the alternative is the site keeping a table of
  live credentials in readable form.

Issuing a link invalidates any outstanding one for that user first. Two live
links for one account is two chances for the wrong one to be forwarded, and an
admin generating a second has already decided the first is lost.

### 26.2 The refusals

**`admin`, never `editor`.** Every function in the module calls
`requireRole(actor, ['admin'])`, and `/admin/usuarios` answers an editor with
`notFound()` rather than a permission message — the screen's existence is not
information they need. `editor` satisfies every _other_ `/admin` screen, which
is exactly why this is asserted in a test rather than assumed: an editor who
could issue an access link for an admin account would be an admin.

**A staff role may not carry an institution; an institution role must.** A
`SessionUser` with both is a scope question nobody has answered, and an
`institution_admin` with no institution is an account that reaches `/panel` and
sees nothing. Refused at the boundary, in the parser _and_ in the query module.

**No link for a suspended account, and suspending kills every outstanding
link.** Suspension is how access is revoked; a link that revived it, or one
still live in a WhatsApp thread afterwards, would make the revocation
advisory.

**An admin cannot suspend themselves.** Unrecoverable without another admin or
a database edit, since the bootstrap refuses to run once an active admin
exists.

**An admin _can_ issue a link for another admin.** Lateral, not escalation —
they already hold the role — and it is what makes "the other admin is on leave
and locked out" solvable without a shell. `activity_log` records who issued it,
for whom, and until when.

### 26.3 What this does not do

It does not let an `institution_admin` issue links for their own members. They
can invite (PR-21) and the member still needs a link, which today means asking
us. Handing that power to an institution admin means handing them the ability
to take over a colleague's account, and the argument for it is convenience
during the exact weeks when email is about to work anyway. Revisit it when
somebody actually asks.

Accounts are **created and disabled** here, not edited: changing an address or
a role is rare, auditable and currently a database edit. A screen for it is
worth building when it is needed, not before.

---

## 27. The public-read cache (settled in PR-43)

§3 has said since PR-01 that every public route is `force-dynamic`, and §9's
budget has carried the consequence: on shared-host MySQL with
`connectionLimit: 8` (§1, `deployment.md` §3), every request re-runs the ten
statements a filtered browse costs (§4). PR-43 closes it. (The PR-43 brief in
`pr-plan.md` cites "§8" for this deferral; §8 is *Data integrity & provenance*
and says nothing about it. The brief is wrong and this paragraph is the
correction.) The interface is `src/lib/cache/`, and the decisions it fixes are below —
they are the expensive-to-reverse part, which is why this is an Opus PR.

### 27.1 What is cached, and at which layer

`unstable_cache`, not ISR. The App Router's full-route cache does not vary by
`searchParams`, so `/carreras` — the heaviest page and a pure function of its
query string — cannot use it at all. `generateStaticParams` is out for the
reason §3 already gives: CI builds without a `DATABASE_URL`. So the cache sits
one layer down, around the read paths themselves, and the routes stay
`force-dynamic`.

| Read path | Module | Why |
| --- | --- | --- |
| `searchPrograms(filters)` | `src/lib/search` | Ten statements per call, and the funnel behind `/carreras`, career hubs, city pages, `/areas/[area]`, institution pages, programme pages and the home page |
| `getOfferingsByIds(ids)` | `src/lib/search` | The comparador |
| `listInstitutions()` | `src/lib/institutions` | `/universidades` plus the home logo strip; a `GROUP BY` over the whole index |
| `getInstitutionBySlug(slug)` | `src/lib/institutions` | Every institution and programme page |

The programme page is the largest single win: `findProgramOfferings()` pages
through an institution's offerings 100 at a time, so a big institution costs
several full search round-trips per view, all of which collapse to one entry.

**Not cached, deliberately.** `getPlacementFlags()` — §17 already decided that a
label about a paid commercial relationship is read live and never from a
refreshed copy, and an hour is still a copy. `getWhatsappNumbers()` — §6.2 made
the same call about the number under a WhatsApp CTA. Both are single indexed
`IN (…)` lookups over ~59 rows; there is nothing here worth trading for.

### 27.2 One tag, because a finer one would be a lie

Every cached entry carries the tag `public-read`, and there is no second tag.
Per-entity tags look obviously better and are unsound: one `program_search` row
carries the institution's name, the career, the city, the arancel, the
accreditation badge and the `plan_rank` derived from the subscription, and a
facet count is an aggregate over the whole table. For nearly any write, "which
entries could this have changed?" answers *any of them*. A scheme that claimed
otherwise would leave a corrected arancel visible somewhere, which is the same
failure as publishing it (CLAUDE.md rule 1), only slower to notice.

The invalidation point is `rebuildProgramSearch()` — **not** the call sites.
Almost every catalog write already funnels through it: the admin CRUD for
institutions, campuses, programmes, offerings, prices, accreditations,
admissions and careers, the moderation queue's conflict-apply, the subscription
writes that move `plan_rank`, the panel's direct edits, the dispute file/resolve
paths, and the nightly cron. Expiring the tag there rather than at ~40 call
sites is what makes it impossible to forget, and
`rebuild-search.cache.test.ts` fails if the call is removed. So a price
superseded from `/panel` and a dispute's badge are publicly gone on the next
request, exactly as before PR-43 — the panel writes rebuild the index inline
and the rebuild expires the cache in the same action.

**"Almost" is exact, and the exceptions are named.** The first draft of this
section said "every", and the independent review found a write that was not:
claim redemption (`db/queries/claims.ts`) writes
`institutions.claimed_by_user_id`, which is not in the search index — so no
rebuild would ever fire — and is `InstitutionProfile.isClaimed`, which decides
whether the public profile keeps offering "¿Es tu institución?" to the person
who just claimed it. That path now calls `expirePublicReads()` itself, with a
test in `claims.access.test.ts` that fails without it. The second exception is
`npm run curate`, which writes curated tables without rebuilding: it runs out of
process, where there is no cache to expire, and the runbook's
`npm run search:rebuild` is what publishes its work. `src/lib/cache/tags.ts`
carries the same list next to the code.

The TTL is 3600 s, matching the `revalidate: 3600` §3 already names. It is the
backstop, not the mechanism: the only thing it catches is a query whose meaning
changed without a write, and the one of those we have — the `WHERE` comparing
`admission_closes_on` against today — is handled exactly instead, by putting
the date in the cache key.

### 27.2.1 How many entries there can be, and where they live

The cache key is derived from the URL, and the URL is not ours: free text is up
to 120 characters, each slug filter accepts up to 50 values matching
`[a-z0-9][a-z0-9-]{0,127}`, and `pagina` is any integer. The keyspace is
therefore **unbounded and attacker-reachable** — one request, one entry. That
is inherent to caching a faceted search by its query string, and no key-shape
rule fixes it: refusing to cache free text would leave `?ciudad=<random>` doing
the same thing, while giving up the cache on searches students actually run.

So the bound has to come from the cache, and by default there is none. Next
stores `unstable_cache` entries as `FETCH` entries, and its file-system cache
handler writes **every one of them to `.next/cache/fetch-cache`, with no
eviction** — a fixed Hostinger disk quota, fillable by strangers. `next.config.ts`
therefore sets `experimental.isrFlushToDisk: false`, which keeps those entries
in the in-memory LRU (`cacheMaxMemorySize`, 50 MB) and makes eviction the bound.
Nothing depended on the disk copy: §3 has always treated this cache as
per-instance and wiped on redeploy.

The residual risk is stated rather than solved: a flood of junk URLs evicts the
hot entries, and the site degrades to the uncached behaviour it had before
PR-43. Slower, never wrong — which is the right shape for a failure nobody is
paid to prevent.

### 27.3 The two things that make this safe rather than clever

**A cache hit is not the object the function returned.** `unstable_cache` stores
`JSON.stringify(result)` and hands back `JSON.parse(body)` on a hit, but returns
the live object on a miss. A `Date` in a cached payload is therefore a `Date` on
the request that filled the entry and a *string* on every request after it — a
bug that passes review, passes the first manual test, and appears on the second
page view in production. `cachedRead()` closes it two ways. First, `load`'s return type is
`JsonPlain<Wire>`, which maps everything JSON does not round-trip — `Date`,
`Map`, `Set`, `bigint`, `symbol`, functions, and an optional property, whose key
is *present* on a miss and *absent* on a hit — to `never`, so any of them in a
wire type is a **compile error at the call site**. That is a claim about the
type system, so it is checked by the type system:
`src/lib/cache/json-plain.test-d.ts` compiles one `@ts-expect-error` case per
kind, and `npm run typecheck` fails if any of them stops being an error. (The
first version of this guard caught `Date` alone while this paragraph claimed
more; the review caught the gap, which is the argument for that file existing.)
Second, the two `Date` columns of `program_search` — `price_verified_at` and
`updated_at`; every other date column is already `mode: 'string'` — are
converted in one place, `src/lib/cache/wire.ts`, with a fixture-driven test that
a third cannot creep in unnoticed.

**Nothing derived from a clock is ever stored.** The cache holds
`program_search` *rows*; `toOfferingSummary(row, now)` runs on every read, hit
or miss. So `price.freshness` — the "dato desactualizado" warning of CLAUDE.md
rule 3 and §23 — is always the cached `verified_at` compared against *this*
request's clock, and can never outlive the price it belongs to. The twelve-month
boundary is crossed at an arbitrary moment, so this is not theoretical, and
`src/lib/search/cache.test.ts` pins it: one entry, two reads either side of the
boundary within the same day, `fresh` then `stale`, with the loader called once.

The same rule is why `searchPrograms` measures `tookMs` per request instead of
caching it.

### 27.4 Where the cache is not

`unstable_cache` needs an incremental cache in the process, and
`revalidateTag` needs a work store. `npm run search:rebuild`,
`npm run search:bench` and the unit tests have neither. Both cases are detected
by Next's own structured error codes — `E469` and `E263`, not message text — and
translated into the uncached behaviour. **Only** those two codes are: a
`revalidateTag` during render (`E7`) is a real bug and still throws.

Verified in the built server rather than assumed, once, by hand on
2026-08-20: a throwaway `force-dynamic` route handler calling `cachedRead` on
`next start` ran its loader once across three requests, and reported
`process.env.NEXT_RUNTIME === 'nodejs'`. The probe was deleted rather than
committed — a permanent route whose only job is to prove the cache exists is a
public endpoint nobody would maintain. Re-run it the same way if a Next upgrade
makes the question live again.

### 27.5 The numbers

PR-43's acceptance criterion asks for a measured p95 drop on a deployed
environment. **Those numbers are not in this table yet, and nothing invented
has been put in their place** (CLAUDE.md rule 1). The measurement needs the
real dataset on the real host; the build environment has neither.

To record them, from a machine that can reach the site:

```
# cold (first hit populates), then warm
for i in $(seq 1 30); do curl -s -o /dev/null -w '%{time_total}\n' \
  https://educacion.com.py/carreras; done
```

| Surface | p95 before | p95 after |
| --- | --- | --- |
| `/carreras`, unfiltered | — | — |
| a career hub | — | — |
| a programme page | — | — |

`npm run search:bench` is the synthetic-dataset harness for the SQL side (§4);
it measures the query mix, not the cache, and its 150 ms budget is unchanged.

---

## 28. The activity log, read back (settled in PR-44)

`activity_log` has recorded every admin and panel write since PR-19 — actor,
entity, action, before/after snapshot — and until PR-44 nothing rendered it.
A table that costs a write on every mutation and answers no question is worse
than no table; the audit called it "built but orphaned".

### 28.1 Read-only, structurally

`db/queries/admin/activity.ts` exports three reads and no write, and there is
no action file beside `/admin/actividad`. The reason is not tidiness: a staff
member who can edit an entry can edit the record of their own edit, and the
table stops being evidence of anything.

`activity.access.test.ts` enforces it with a database that throws on `insert`,
`update`, `delete` or `transaction` — and, because a throwing database only
catches a write on a path some test happens to walk, it **enumerates the
module's exports** and calls each one. The independent review demonstrated the
difference by adding a `redactEntry` export to the first version: the suite
stayed green. It does not now.

### 28.2 An `editor` reads the rows; three entity types keep their payloads

PR-44's brief says the viewer is `editor`-gated, and it is. But
`/admin/usuarios`, `/admin/suscripciones` and `/admin/privacidad` are
`admin`-only, and the snapshots for `user`, `institution_member`,
`subscription` and `personal_data` carry exactly what those screens carry — a
staff member's address, the role they were given, what an institution is
paying, which deletion requests were run. Rendering them to an editor would
make the activity log a way around a role boundary the rest of the admin
enforces. CLAUDE.md rule 4 cuts both ways: a read refused on one screen cannot
be granted on another.

**Two things are withheld, not one.** The snapshots above, and the *actor's
email address*. The independent review found the second: the entries join
`users` for "who did this", and that column is the content of the `admin`-only
`/admin/usuarios` — including institution members, whose address the same query
was withholding one line below as `institution_member` snapshot data. An editor
gets the actor's name, or `Cuenta #12`; the id is enough to tell two actors
apart, which is what the column is for.

So the **row** stays visible to an editor — that an account was created, by
whom, when, is what an audit log is for — and only the payload is withheld,
with a line saying so rather than an empty space. `claim` is deliberately *not*
on the list even though its snapshot carries an email: `/admin/reclamos` is
already `editor`-gated and shows the same address, so hiding it here would
protect nothing. **The rule is "does another screen already refuse this
reader", not "does it look sensitive."**

Two things make that rule hold rather than merely be written down:

1. **It is enforced in the query, not in the page.** `listActivity` returns the
   row this reader is allowed to have. The first version left it to the JSX,
   which put an access-control rule in the layer rule 4 calls UX — hard-code
   `viewerIsAdmin` to `true` and the boundary was gone with the whole suite
   green.
2. **The list is checked against the call sites**, not against itself.
   `activity-diff.test.ts` scans every `logActivity` call under
   `src/db/queries` — literals and constants alike — and fails until each entity
   type is either withheld or named with the editor-reachable screen that
   already shows it. Asserting the constant against a copy of itself is what let
   `personal_data`, introduced by this same PR, go missing from it.

### 28.3 What the viewer shows is the diff, not the snapshot

`before_json` and `after_json` are whole rows. Rendering both side by side asks
the reader to diff twenty fields to find the one that moved, which is how an
audit log becomes something nobody opens. `diffSnapshots` returns only the keys
that differ. Two cases it is careful about, both tested: a key that *went away*
and a key that *turned null* are different edits and render differently, and
`0`, `false` and `''` are values, not absences — a diff written with truthiness
checks would report `installmentsPerYear: 0` as a removal.

**The date filter reads in Asunción, not UTC.** Rows render in
`America/Asuncion` and the column is UTC, so a bound parsed at UTC midnight is
three hours off from the day the operator can see: an entry shown as 20/08
22:30 is stored 21/08 01:30Z, and "hasta el 20" dropped it. `parseAsuncionDay`
/ `nextAsuncionDay` in `src/lib/format/date.ts` hold the offset as a constant
with the reason beside it — Paraguay abolished DST in 2024 and is permanently
UTC−03:00 — so the next reader does not "fix" it into a rule that no longer
applies. (`src/lib/analytics/range.ts` is UTC on purpose and stays that way:
its numbers have to agree with a session hash that buckets in UTC. Nothing here
buckets.)

`ENTITY_LABELS` and `ACTIVITY_ACTION_LABELS` fall back to the raw value.
`entity_type` is a `varchar` each caller of `logActivity` picks for itself, so
a label map that owned the vocabulary would hide whatever the next PR starts
logging until somebody remembered to add it.

### 28.4 R-06 execution — see `risks.md`

`/admin/privacidad` is `admin`-only and is the one screen in this app that
destroys data irreversibly. The four properties it has to hold, and the
reasoning for each, are in `risks.md` §R-06 next to the promise they keep,
rather than duplicated here. Two of them — "exact match, never a prefix" and
"the `DELETE` and the log entry are one transaction" — were written before
anything tested them, and the independent review showed both surviving
mutation: a fake database that captures a `WHERE` and never reads it proves
nothing about the operator, and a `transaction` that hands the callback the
connection back proves nothing about atomicity. The clause is now rendered
through `MySqlDialect` and asserted, and the fake transaction hands back a
distinct handle with a rollback case.

**One index, one migration.** This PR is the first *reader* of `activity_log`,
and the default view is `ORDER BY created_at DESC LIMIT 50` with no `WHERE` —
a full scan plus filesort on a table that gains a row on every admin and panel
write and is never purged. Migration `0010` adds `(created_at)` and
`(entity_type, created_at)`; it has **not** been applied (`deployment.md`
§3.1).

---

## 29. Observability (settled in PR-45)

Before this, a production error was a line in Hostinger's console retention and
nothing else: no aggregation, no stack after the log rolled, and no way to know
that `/carreras` had been throwing since Tuesday. `@sentry/nextjs` closes that
for the server. What it does **not** do here is ship a browser SDK, and that is
the decision this section exists to record.

### 29.1 The browser does not load the SDK

PR-45's brief asks for server **and** client capture. Client capture shipped;
`@sentry/browser` did not.

Measured in this project, `import('@sentry/browser')` produced a
**144.5 kB gzipped** chunk — Replay, Feedback and BrowserTracing included,
because Turbopack does not tree-shake the package's index even though it is
marked `sideEffects: false`. The public page budget is **150 kB total** (§9).
The measurement is reproducible: install `@sentry/browser`, `import` it from a
client entry, `npm run build`, then gzip the chunks the app build manifest does
*not* reference. It is recorded here rather than kept because the package is not
a dependency any more — nothing in CI re-checks it, so treat the number as of
2026-08-20 and `@sentry/browser` 10.70.
An error reporter larger than the application it reports on is not a trade this
site makes; §9's budget was written for a student on 4G in October, and that is
precisely the person who would pay for it.

So the browser sends a **small fixed report to our own server**, which hands it
to the Node SDK:

- `src/lib/observability/client-report.ts` — the contract. Five short strings:
  `name`, `message`, `stack`, `digest`, `path`. Every field truncated; the path
  has its query stripped **in the browser**, so a person's search is never even
  in the request body.
- `ShellError` (the body of all four `error.tsx` boundaries) posts it,
  `keepalive`, and swallows any failure — a failed report inside an error
  boundary is how a boundary loops.
- `POST /api/client-error` — public and unauthenticated, so written as one. It
  answers `204` to everything, because a reporter that says "accepted" is a
  reporter somebody can probe.

**The bounds on that endpoint, in the order they apply and with what each one
is actually worth.** An independent review's first finding was that an earlier
version presented "rate limited per hashed IP" as *the* control, and it is not
one:

  1. **Same origin** — the check the lead endpoint already uses. A missing
     `Origin` on a POST means the caller is not a browser. Forgeable by a
     script, which is why it is first and not last.
  2. **`content-length`, then bytes** — refused before the body is read when the
     caller declares a big one, and after, on `Buffer.byteLength` rather than
     `String.length` (8 000 emoji is 8 000 "characters" and 32 kB on the wire).
  3. **Per hashed IP**, 5/min. This stops an ordinary crash loop in one browser,
     which is the common case. It is **not** a bound on an attacker:
     `hashClientIp` reads `x-forwarded-for`, which the caller writes, so
     rotating it buys a fresh bucket. §6.1 says the same thing about the lead
     limiter, which is why that one has a second, durable tier.
  4. **A process-wide budget** in `capture.ts` — 20 forwards a minute, keyed on
     a constant. This is the bound that holds. `beforeSend`'s per-fingerprint
     throttle cannot substitute for it: the fingerprint is derived from the
     `name` and `stack` in the report, which the caller also writes.

**And the payload is treated as a forgery until proven otherwise.** Anyone can
POST `{name:'DatabaseError', message:'ECONNREFUSED 127.0.0.1:3306'}`, so the
exception type is prefixed `ClientReported:` and the event is tagged
`unverified: true`. A browser-supplied string cannot sit in a list of server
exceptions looking like one.

**What that costs, stated rather than implied.** There is no automatic
`window.onerror`, no unhandled-rejection capture and no breadcrumb trail: what
is captured is what a React error boundary catches, which on a site this
server-rendered is nearly all of it. What it buys, besides 144 kB, is that the
payload is an allowlist rather than whatever the SDK decided to collect — there
is no field through which a lead's form data could reach Sentry from a browser.

### 29.2 Absent DSN = fully inert, checked in four places

1. `serverDsn()` returns `undefined` for an unset **or blank** value. hPanel
   stores empty strings happily, and an empty DSN is not the same as no DSN —
   the SDK would initialise, warn and sit there disabled, which is a running SDK
   we did not want and a warning nobody reads.
2. `sentry.server.config.ts` skips `init` entirely.
3. `capture.ts` does not `import` the SDK at all: the import is dynamic and
   behind the check. On a Hostinger slot the app process is also the web server,
   and 75 MB of SDK that will never send anything is 75 MB taken from the pool.
4. `next.config.ts` applies `withSentryConfig` only when a DSN **and** an auth
   token are both present, so CI's `next build` runs no plugin, attempts no
   upload and prints no warning.

### 29.3 What may leave the process

`src/lib/observability/scrub.ts` is an **allowlist at both levels**:
`ALLOWED_EVENT_KEYS` names the top-level keys an event may keep, and `request`
is narrowed to its path and method. A denylist would have to be updated every
time the SDK gains a field, and the cost of forgetting is a student's phone
number in a SaaS dashboard forever — which the independent review demonstrated
against the first version of this file, a five-key denylist that called itself
an allowlist and let `server_name` (`os.hostname()`, **not** covered by
`sendDefaultPii: false`), `modules`, `threads` and `attachments` through.

Kept: the envelope (`event_id`, `timestamp`, `platform`, `level`, `logger`,
`environment`, `release`, `dist`, `type`, `sdk`), the error (`exception`,
`message`), `transaction`, `tags`, `fingerprint`, `contexts` minus `user` and
`response`, `breadcrumbs` minus every `data`, `request` narrowed — and
**`debug_meta`**, which carries the ids that map a stack frame to an uploaded
sourcemap. Dropping that one would quietly cost the readable stacks this whole
section exists to get.

Dropped: everything else, including cookies (one of which is the whole
`iron-session` session), all headers (`x-forwarded-for` is an IP, which §6.4
says we store only hashed; `x-cron-secret` is `CRON_SECRET` in plaintext), the
request body (a Server Action body is the lead form, or `/admin/privacidad`'s
lookup) and the query string.

**One half is honestly a denylist, and is named one.** `exception.values[].value`
and `event.message` are the error's own text, and on this site that text quotes
data: a mysql2 duplicate-key error is `Duplicate entry 'ana@example.com' for key
'leads.email'`. Deleting the message would make the report worthless, so
`redactSecrets` replaces what looks like an address or a phone number and leaves
the sentence. Blunt on purpose: a false positive costs a `[correo]` in an error
message, a false negative is an address in a third-party dashboard.

`scrub.test.ts` asserts all of it against events shaped like the three requests
on this site whose bodies are somebody's data, checks the serialized event for
each secret string by name, and fails if any key outside `ALLOWED_EVENT_KEYS`
survives.

### 29.4 A crash loop must not eat a shared quota

The free tier is one quota across this site and the operator's others, so a
route throwing on every request can spend a month of events in an afternoon —
and take the other sites' visibility with it. `EventThrottle` caps **5 events
per minute per fingerprint**, where the fingerprint is the exception type plus
the top stack frame. Deliberately not the message: a message routinely carries
an id (`No se encontró la oferta 4821`), so keying on it would give every
iteration its own bucket and the throttle would never engage.

Per fingerprint rather than globally, so one loud error cannot starve a quiet
one — the failure a global cap would reintroduce. The last event before
suppression is **sent** carrying `throttled=true` and the count, because a
limiter that suppresses silently hides the outage it was installed to reveal.

There are two of these, and they answer different questions. The
per-fingerprint one above bounds a *server* crash loop, where the fingerprint is
ours and trustworthy. `capture.ts`'s process-wide budget bounds *browser*
reports, where it is not (§29.1). Both are in-process and both reset when
Hostinger recycles the app, which is why `deployment.md` §8.1 also sets a
**per-key rate limit in the Sentry project** — that is the half that survives a
restart, and the only half that holds against a restart loop.

### 29.5 What is not verified from here

"An error thrown in a server component, a Server Action and a client component
each arrive in Sentry with a readable stack" needs a real DSN and a real
project. This environment has neither, so it is **not verified**, and nothing
has been asserted in its place. The three-error smoke test is in
`deployment.md` §8 as a post-deploy step, next to the rate limit the operator
has to set.

Measured here instead — the numbers that do not need an account:

| Build | `/carreras` First Load JS (gz) |
| --- | --- |
| Before PR-45 | 129.3 kB |
| PR-45, no Sentry env (CI, local dev) | 129.9 kB |
| PR-45, DSN + auth token (production) | 132.4 kB |
| *Rejected:* `@sentry/browser` in the client | +144.5 kB, deferred chunk |

Budget 150 kB (§9). The first two rows are reproducible with `npm run build &&
npm run perf:budget`; the third needs a DSN and an auth token and is recorded
from a local build with dummy values, so nothing in CI pins it.

---

## 30. The copy catalog (settled in PR-47)

Not a language toggle. The seam that keeps one possible, built while there is
still one locale — because the expensive version of this work is doing it
during a translation, against a codebase where nobody knows which strings are
copy and which are keys.

`src/lib/copy/*.ts` holds the messages, one file per surface, composed by
`es-py.ts`; `src/lib/copy/index.ts` exposes `copy`, the `Messages` shape and the
`messages` record. **CLAUDE.md rule 12:
new UI copy goes through the catalog, never inline in JSX.**

### 30.1 Property access, not a lookup function

`copy.nav.searchCta`, not `t('nav.searchCta')`. The difference is the whole
typing claim: a string-keyed lookup needs a fallback for the miss, and a
fallback is how `nav.searchCta` ends up rendered on a page. With property
access **a missing key is a type error**, there is no fallback branch, and
there is nothing to test at runtime because the failure cannot reach runtime.

Values are strings, or small functions where the sentence interpolates
(`copy.lead.sentBody(institutionName)`). A function is still a typed key — its
arity and argument types are checked at the call site.

### 30.2 The catalog is sliced, because a barrel would ship the whole thing

The first version of this PR was one module and `perf:budget` rejected it:
**+2.2 kB gzipped on every public route**, empty-state paragraphs included.
`Footer` imported the composed barrel and `src/app/error.tsx` — a client
boundary — imports `Footer`, so Turbopack pulled the entire catalog into the
shared browser chunk. Nothing in the diff looked like a client component.

So the catalog is one file per surface — `brand.ts`, `nav.ts`, `footer.ts`,
`browse.ts`, `filter-sheet.ts`, `lead.ts` — and `es-py.ts` composes them.
The rule that follows is about the **import graph, not the `'use client'`
directive**:

- Anything a client boundary can reach imports its slice: `@/lib/copy/lead`,
  `@/lib/copy/nav`.
- Everything else reads `copy` from `@/lib/copy`.

`client-bundle.test.ts` walks the transitive closure of every `'use client'`
file and fails if `index.ts`, `es-py.ts` or `browse.ts` is reachable. It is
the guard, not the convention: delete the check and the leak comes back
silently, which is exactly how it arrived the first time.

`footer.ts` is deliberately allowed through — the error page renders the footer,
and rule 9's disclaimer is required there like everywhere else.

Measured, reproducible with `npm run build && npm run perf:budget`:

| Build | `/carreras` First Load JS (gz) | every other public route |
| --- | --- | --- |
| Before PR-47 | 129.9 kB | 129.2 kB |
| *Rejected:* one-module catalog | 132.2 kB | 131.5 kB |
| PR-47 as shipped | **130.5 kB** | **129.8 kB** |

Budget 150 kB (§9). The remaining +0.6 kB is module overhead for the five
slices; the copy itself was already in those bundles as inline JSX.

### 30.2.1 No i18n library, deliberately

§1's excluded list applies: a message-format library, a loader and a runtime
catalog lookup are three moving parts bought for a site with one locale. The
seam costs a dependency the day a second locale exists and not before.

### 30.3 How a second locale lands

`student-engagement.md` §4 says it would be guaraní, on a handful of pages,
with a translator. When that decision is made:

1. `export const gn: Messages = { … }` — TypeScript refuses the file until
   every key is present.
2. Add it to `messages` and widen `Locale`.
3. Replace `copy` at its call sites with a value the layout resolves per
   request. Every consumer already reads through one binding, so this is a
   mechanical change rather than a hunt through JSX.

### 30.4 What is not in the catalog, and why

- **The `copy.ts` generators under `src/lib`** (career and city intros, §20).
  They are data-provenance sentences whose logic *is* Spanish grammar —
  agreement, elision, pluralisation over a row's actual fields. Fragmenting
  them into catalog keys makes them less translatable, not more. They move when
  a real second locale forces the question, which is also when somebody can
  answer it.
- **Labels keyed by an enum the server also owns** — `LEAD_ERROR_MESSAGES` and
  `MINOR_NOTICE` in `@/lib/leads/contract`, `SORT_LABELS` in `@/lib/search`.
  They stay next to the union they are keyed by, where a new variant is a type
  error in the same file. Splitting the label from its key is how the two
  drift.

### 30.5 The migration guard

`copy.test.ts` pins every migrated key to the exact string that was inline in
the JSX before this PR, so "extracted the copy" cannot quietly become "rewrote
the copy while extracting it". It also scans every leaf — functions included,
called with markers — for the tuteo forms CLAUDE.md rule 8 bans, and pins the
R-07 disclaimer on its own, since one string now feeds every footer.

Migrated in PR-47: `Header`, `Footer`, `nav-links`, `LeadModal`, and the browse
chrome (`SearchBar`, `SortControl`, `ViewToggle`, `ActiveFilters`,
`EmptyState`, `MobileFilterSheet`).

---

## 31. The total-cost calculator (settled in PR-48)

The question families actually ask is not "how much is the cuota" but "how much
does this carrera cost me". Both halves were already in `prices`; nothing had
added them up. `src/lib/prices/total-cost.ts` does, as pure arithmetic over
verified columns — **no new data is collected and nothing is estimated.**

### 31.1 The formula, and why matrícula is annual

```
total = annual_cost × años + derecho_de_examen
```

The per-year half is **`computeAnnualCost()` itself**, imported, not restated.
`data-model.md` says the generated `annual_cost` column and `computeAnnualCost()`
"must stay in lockstep"; a third implementation here is exactly how that stops
being true, and the first version of this PR had one. `total-cost.test.ts`
asserts `totalCost(p, …).annualCost === computeAnnualCost(p)` across several
shapes, so the claim is a test rather than a comment.

That import reaches the schema module, so `total-cost.ts` is server-only and
`client-bundle.test.ts` holds that boundary (§30.2, §5.1).

Matrícula being an annual charge is not this module's invention — it is what
`annual_cost` means. The derecho de examen is the one-off, added once.

### 31.2 Every component, or no number at all

A total renders only when every component the row needs is present:
**derecho de examen and duration always, plus matrícula, cuota and cuotas por
año unless the arancel is free** — a free carrera has no matrícula and no cuota
by construction (`prices_free_has_no_fees`), so its total is the exam fee and
nothing else. A missing derecho de examen is *unknown*, not zero
(`data-model.md`: NULL means _sin datos_, 0 means _gratuita_).

Not a lower bound and not a "desde". A floor reads as a total to anyone
skimming, and this is the number a family budgets against, so a partial carries
**no figure at all** — not even a component it does happen to hold.
`total-cost.test.ts` asserts the partial string contains no digit, and
`TotalCostBlock.test.ts` asserts the rendered card contains no `Gs.`

Three inputs are refused for reasons that are not absence, because
`program_search` is denormalized and carries fewer CHECKs than `prices`:

| input | why |
| --- | --- |
| amounts with `price_currency = NULL` | a total whose units we cannot name is not a total |
| `duration_months = 0` | `0 % 12 === 0`, so without the guard a zero-length carrera totals to its exam fee |
| `is_free = 1` with a matrícula on the row | trusting the flag would silently drop a fee that is sitting right there |

Each has a test. The third is reported as `incoherente` and worded as a
contradiction in our data, not as a gap in the institution's.

### 31.3 A fractional year is undetermined, not missing

A 30-month carrera bills either three matrículas or two and a half, and the data
does not say which. So `duracion_parcial` is reported — but **worded as our
limitation, not as their gap**: "la carrera no dura un número entero de años,
así que no sabemos cuántas matrículas se pagan", never "sin datos de duración".
The row is complete; saying otherwise is a false statement about the
institution's record, and a test asserts the string contains no "sin datos".

How often this fires is **not measured here** — an 18-month maestría and a
30-month tecnicatura are both ordinary in Paraguay, and this environment has no
database to count against. The honest statement is that the case is handled
correctly, not that it is rare. If the operator finds it common, the fix is to
capture a billing period rather than to guess one.

### 31.4 Staleness travels, it never hides

CLAUDE.md rule 3 and §23: a stale arancel still totals, and `freshness` and
`verifiedAt` travel on the result — on partials too, so a later consumer cannot
read one as fresh. The programme block puts the PR-33 warning on the total
itself, not only on the arancel above it: a stale cuota multiplied by five years
is a stale number five times over.

The comparador cell carries the **words**, not just a date:
`Gs. 22.650.000 · Dato desactualizado (mayo de 2026)`. "dato de mayo de 2026"
reads as provenance and a reader cannot tell it from a fresh date — rule 3 asks
for a visible warning. PR-48 changed the arancel cell to the same wording, since
the two cells sit in one column and must not warn differently.

### 31.5 The comparador ordering

`compareTotalCost` sorts cheapest first with **incomplete last**, and never
compares across currencies — a USD total sorts after every guaraní one rather
than being converted at a rate we would have to defend (§23, `data-model.md`).

`cheapestTotalIndex` marks the winning column and returns `null` when there is
no honest winner: fewer than two complete totals, a tie, or more than one
currency in play. An incomplete column might well be the cheapest; we do not
know, so nothing is marked.

### 31.6 Where it renders, and per which option

`pr-plan.md` asks for the calculator **per option**, and the programme page's
aside is built from `offerings[0]` — an arbitrary sede. Two sedes of one carrera
can charge different aranceles, and over five years the difference is larger
than either one's annual figure. So:

- **`OfferingsBlock`** carries a total per sede, beside the arancel it already
  lists per sede. That is the per-option requirement.
- **`TotalCostBlock`** in the aside names its sede whenever there is more than
  one, so a single headline figure cannot read as the carrera's.
- **The `totalCost` row in the comparador**, built from the same `PriceSummary`
  the arancel row reads, so the two cells of one column cannot disagree.

All three are server components. No schema change, no new query, no new cron.

### 31.7 What the render tests hold — and what they do not

`TotalCostBlock` had no test in the first version of this PR, and replacing its
stale-warning condition with `false` left the entire suite green. A pure-function
test cannot catch that: the defect lives in the JSX. `OfferingsBlock`'s per-sede
total, the programme page's sede-name gate and — found by PR-48b's own review —
`PriceLabel`'s stale badge had the same hole. The last is the price surface on
every result card and both table layouts, and deleting its badge outright left
1231 tests green. All three are pinned now. The sede gate moved out of the page
into `totalCostScope()` to be reachable at all: a condition written inline in an
async server component is a condition no test in this suite renders.

`TotalCostBlock.test.ts`, `OfferingsBlock.test.ts` and `PriceLabel.test.ts`
render their component with `react-dom/server`'s `renderToStaticMarkup` — no new
dependency, no DOM, one line of vitest config for the JSX transform — and assert
against the HTML that a stale figure never appears without the words rule 3
requires, and that a partial card contains no `Gs.` at all. All go red when
their guard is removed.

**What that is evidence of, exactly.** `renderToStaticMarkup` proves that a
given substring is present in (or absent from) the HTML one component emits, in
guaraníes, for the props the test passes. It is a string assertion, and it is
worth having because the defects above were string-level. It does **not**
exercise the RSC pipeline — no async component, no `page.tsx`, no data loading,
no streaming — so a component correct here can still be wired up wrongly, or not
rendered at all, and nothing in this suite would say so. It says nothing about
*visibility*: CSS is not applied, so a warning behind `hidden`, in
`text-transparent`, or scrolled off a mobile viewport passes every one of these
tests. Contrast and layout stay a design review (`design-system.md` §15 owns the
a11y budgets), and the page's own composition stays uncovered.

The OG routes are the gap this technique does not close: they return an
`ImageResponse`, not HTML, so nothing here can read what they drew. That is not
hypothetical — deleting the staleness branch from **both** routes left 1248
tests green, and it is why those two files were still saying "Dato de mayo de
2026" months after the wording was fixed everywhere else. Rather than accept an
untestable surface, the decision moved out of them: `priceImageLines()` returns
the amount and the warning as one list, tested as a pure function, and each
route maps over it. A route can still mis-style a line; it can no longer draw
the number and omit the warning, because it never receives them as two separate
things.

Its scope is stated on the card rather than implied: the total covers matrícula,
cuotas and the derecho de examen, and says in as many words that it excludes
materials and travel. `OfferingsBlock`'s per-sede figure is labelled but does
not repeat that note; the aside card carries it once per page.

### 31.8 The CHECKs `program_search` does not carry (PR-48b)

`prices` constrains what a price row may say. `drizzle/0000_init_schema.sql` has
three CHECKs on that table: `prices_free_has_no_fees`, `prices_installments_range`
(1–24) and `prices_non_negative`, and `assertPriceIsCoherent()` adds
`money_is_integer` on the write path. **`program_search` is a denormalized copy
of those columns with none of them**, and every public price surface reads the
copy.

PR-48 mirrored the first and not the rest, which is the whole hazard: an
`installments_per_year` of 0 does not make `computeAnnualCost` fail, it makes it
multiply the cuota by zero and return the bare matrícula. A Gs. 22.650.000
carrera would render as Gs. 2.650.000 — `complete`, no gap, no warning, and
eligible for the "el más barato" marker. A negative `matricula` or
`admission_fee` does the same, quietly, in the other direction.

**This is a reachable hazard, not an observed incident.** The nightly rebuild
copies straight from `prices`, which does carry the CHECKs, so under that path
the values cannot appear. What it defends against is a direct write, an
interrupted rebuild, or a MySQL that parses CHECK constraints and ignores them
(anything before 8.0.16). The rule this establishes is the point: **a module
reading `program_search` re-asserts the constraints the table it is copied from
enforces**, because "the source table has a CHECK" is not a property of the
copy.

So `priceCheckViolations()` in `db/invariants.ts` states the four rules once, as
data. `assertPriceIsCoherent()` is built on it, so the write path and the read
path cannot drift apart. `total-cost.ts` maps each violation onto a gap and
refuses to compose a total; `seo/catalog-schema.ts` refuses to emit the `Offer`,
which matters more than it looks — a rich result is the one surface that repeats
our number stripped of every qualification on the page around it.

A violation is reported as **undetermined**, like `duracion_parcial`, never as
"sin datos": there is a number on file, and telling a reader the institution
gave us nothing would be a false statement about them.

**`computeAnnualCost` is deliberately not where any of this lives.** It is a
line-for-line mirror of the `annual_cost` STORED GENERATED column, which is the
only reason it can be trusted to agree with the number the comparador sorts on.
A generated column cannot refuse a value its table's CHECK already rejects, so a
guard in the TypeScript copy alone would break that lockstep and make the two
disagree about rows the database can hold. (It has exactly one production
caller, `total-cost.ts`; PR-48b's first draft of this section claimed three,
which was wrong and is what made the `catalog-schema.ts` exposure invisible to
it.) Validation belongs at each boundary where unconstrained data enters —
`total-cost.ts` and `catalog-schema.ts` for the index, `assertPriceIsCoherent`
for the write path — and those are now the same four rules, not three
paraphrases of them.

---

## 32. Lead SLA nudges & in-panel plan status (settled in PR-49)

Two willingness-to-pay gaps in `/panel`, both closed by **reading data that was
already there**: no migration, no cron job and no new table.

### 32.1 "Overdue" is a question, not a column

A lead is late when it is still in `status='new'` and `created_at` is at least
48 hours old. That is answerable from two columns every lead already has, so
`src/lib/leads/sla.ts` answers it at render time and nothing records it.

The alternative — an `is_overdue` flag set by a sweep — is worse in three
specific ways, which is why it is not here. It needs a job, so the panel is
wrong between ticks. It is a second thing to keep in step with a status change,
so a lead marked `contacted` stays flagged until the sweep catches up. And it
puts a derived value in a table, which is the mistake `program_search.plan_rank`
is already the site's one licensed exception to. `pr-plan.md` PR-49 states the
constraint outright; `sla.ts` is where the derivation lives so that the inbox
badge, the dashboard tone, the inbox banner and the daily digest are four
readers of one rule rather than four copies of `48 * 3_600_000`.

The SQL that *counts* overdue leads does not restate the threshold either: it
takes `slaCutoff(now)` from the same module. `countOverdueLeadsForInstitution`
and the digest's `overdueCount` aggregate are therefore incapable of disagreeing
with the badge beside the row they counted.

**Only `new` is tracked.** `contacted`, `qualified` and `discarded` are
deliberate acts — the institution dealt with the lead and the clock is off.
`sent` is *our* delivery mail having gone out, which says nothing about whether
anybody replied and is not a state the institution can clear from the panel, so
nagging about it would be nagging about something they cannot fix.

**48 hours, and it is not a contract.** Nothing is refunded, nothing escalates,
and the word "SLA" never reaches the UI — the copy says "hace más de 48 horas",
which is a fact, where "incumpliste el SLA" would be a term from an agreement
nobody signed.

One clock per render: `/panel/leads` takes `new Date()` once and passes it to
the query and to every badge, so a lead sitting exactly on the boundary cannot
be counted by the banner and un-flagged on its own row.

### 32.2 The plan banner reads dates, never a cached rank

`planStatusView()` takes an `Entitlements` value — the one this request resolved
from `subscriptions.starts_on` / `ends_on` through `resolveEntitlements` (§17) —
and nothing else. It is deliberately not fed `program_search.plan_rank`, which
is a derived copy refreshed on writes and nightly: good enough to order search
results, not good enough to tell an institution its plan is active on a day it
is not. Everything §17 says about expiry needing no cron is what makes the
banner correct on the morning after a period ends, with nothing having run.

Six states, and the shape of each is the decision:

| State               | Shows                                          | Sells |
| ------------------- | ---------------------------------------------- | ----- |
| `gratis`            | the tier, plainly                              | link to `/para-instituciones` |
| `trial`             | the plan being tried and its end date          | link  |
| `active`            | the period end                                 | no    |
| `active_open_ended` | that there is no end date on file              | no    |
| `ending_soon`       | the end date, within 30 days                   | no    |
| `past_due_grace`    | the date the period ended **and** the day cover stops | no |

**The free tier never gets a countdown.** `daysLeft` is null on `gratis` and the
sentences carry no number at all — `plan-status.test.ts` asserts the rendered
pair matches no digit. A "te quedan N días" on an account that never had a
period is an invented deadline, which is CLAUDE.md rule 1 wearing a marketing
hat. Every other state's date is one an institution actually agreed to.

`past_due_grace` is the one state where "your period ended" and "your features
still work" are both true, so the copy names **both** dates: `ends_on`, and
`ends_on + BILLING_GRACE_DAYS` computed from the same grace value the resolver
used. Saying only the first is false today; saying only the second hides that
anything is pending. It carries no plans link — it is a payment note, not an
upsell aimed at somebody whose transferencia is in flight. `monetization.md`
§5's 90/30/7 renewal mail stays **operator-only**; this is the institution's own
read of the same facts, and it dunned nobody.

`ending_soon` fires at 30 days because that is the operator's middle reminder
threshold (`REMINDER_THRESHOLDS`), asserted equal in the test: the institution's
banner and the operator's mail describe the same window rather than two.

### 32.3 `formatAsuncionDay`, and the day a `date` column loses

`ends_on` is a `date` column holding a Paraguayan calendar day.
`formatDate('2026-10-31')` parses it to **UTC** midnight and then formats it in
the process's own zone, so the render can land on the 30th. It is the same class
of error PR-46 found in `dateOnly()` (§17), one layer up: there it cost a paying
institution three hours of its last day, here it just prints the wrong date —
but on the banner that tells them when to pay.

**PR-49 fixed half of it, and PR-52's review caught the other half.** Anchoring
the day at Asunción midnight is necessary and not sufficient: handing that
instant to a formatter with no `timeZone` is still a zone-dependent render, and
on a host west of −03:00 the anchored instant falls on the previous local day —
`America/Lima` prints "30 de octubre" for `2026-10-31`. The paragraph here used
to claim correctness "in Asunción and in UTC alike", which was true and was not
the whole set of hosts, and the test asserted the helper against
`formatDate(parseAsuncionDay(x))` — the very composition that was wrong, so it
was green everywhere. Both halves are pinned now: the day is anchored in
Asunción **and** rendered in Asunción, which makes the output a function of the
stored value alone, and the test asserts that from four zones.

### 32.4 Why the nudge is a component

`LeadSlaBadge` and `LeadSlaBanner` are components with a test, not JSX inline in
the page, and that is PR-48b's lesson applied before the fact: deleting
`PriceLabel`'s stale badge outright left 1231 tests green. Both compute the flag
themselves from `lib/leads/sla` rather than taking an `overdue` boolean prop, so
a caller cannot compute it differently from the query that counted it, and
`LeadSla.test.ts` fails the moment either stops rendering.

The banner's count is the institution's **whole** overdue set, not the current
page's and not the current tab's — filtering the inbox to "Descartadas" must not
make the number look like zero — and its link goes to the `new` tab so the
sentence and the list the institution lands on agree.

---

## 33. The data-operations console (settled in PR-50)

`plan.md` §6 calls arancel and registry collection the real bottleneck of this
project. Part of why it stayed one is unglamorous: every import ran from a shell
with `DATABASE_URL` exported by hand (`deployment.md` §5), which is workable for
the person who wrote the scripts and impossible for anybody else — so the
bottleneck was a **person**, not a task. `/admin/importaciones` is the same work
with a button on it.

### 33.1 One import path, not two

The PR-20 rule. The console calls `beginImport(db, source, () => collectCones())`
and `curate({ db, exclusive: true })` — the same functions
`scripts/import-cones.ts` and `scripts/curate.ts` call. What the scripts still
own is argv parsing and printing to a terminal. Nothing about *what an import
does* is decided in two places, so there is no second parser to fix when the
CONES page changes.

### 33.2 `import_runs` is the lock

Two operators clicking "Importar CONES" in the same second must not produce two
concurrent crawls of the same government site — rude to the source, and a way to
get the whole network 403'd (`data-sources.md` §1). The lock is the table that
already exists: a run with `status='running'` **is** the claim.

It is taken in one statement, `INSERT … SELECT … WHERE NOT EXISTS`, because
`SELECT`-then-`INSERT` from the application is a race however carefully it is
written. Zero rows inserted means somebody else holds it, and
`ImportAlreadyRunningError` says so in the Spanish the operator reads. The page's
own "is this source busy" check, which disables the button, is a courtesy on top
— it makes the common case legible and is explicitly *not* the lock.

A lock is only as good as its release, so every path that opens a run closes it:
`beginImport`'s `catch` marks `failed`, and PR-50 gave `curate()` the same
treatment — a curate pass that threw used to leave its row `running` forever,
which was cosmetic while nothing read the column and is not now. The case no
`finally` can cover is a container restarted mid-crawl, and that is what
`releaseImportRun` is for: after `STUCK_AFTER_MINUTES` the console offers to
close the orphaned run, refuses to do it any earlier, and logs who did.

### 33.3 Why the trigger does not await the import

A full CONES pass is ~65 polite requests and takes minutes. A Server Action that
awaited it would hit a proxy timeout with the operator none the wiser about
whether it ran.

So `beginImport` splits the work at the only interesting boundary: it awaits the
**claim** — which is what the operator must be told about, immediately, on the
click — and hands back the rest as a promise the console does not await. Progress
is read from `import_runs`, which the import writes to anyway. `runImport` is
`beginImport` plus `await done`, which is what keeps the CLI and the console on
one code path instead of two that drift.

### 33.4 The cron panel, and where a cron history comes from

`/api/cron/[job]`'s `switch` became a lookup in `src/lib/cron/registry.ts`, and
the console renders the same table. A second job list beside the route is how a
console ends up offering a job the route answers `not_implemented` for;
`registry.test.ts` holds the two together and also against `deployment.md` §7's
curl list.

Every run is written to **`activity_log`** — `entity_type='cron_job'`,
`action='run'` — rather than to a `cron_runs` table. The console needs one fact
per job (when it last ran, how it went), which is a row with an actor, a time, a
subject and an outcome: exactly what that table stores, already indexed on
`(entity_type, created_at)`. A new table would be a migration, a second thing to
purge and a second history to check, for columns this screen does not use.
`user_id` is null when hPanel fired it and set when somebody pressed the button,
which is the distinction that makes the row worth writing at all: "it ran an hour
ago" means something different when the only thing that has ever run it is a
person clicking.

**Failures are logged too**, and that is the half that matters. A job that has
been throwing for three days looks exactly like a job hPanel was never scheduled
for, until the failure is on the record.

`action='run'` is new vocabulary (`ActivityAction`): a job executing is not a
create, an update or a delete of anything, and forcing it into one would make
`/admin/actividad`'s filter lie.

### 33.5 "Ejecutar ahora" calls the route, not the function

The button's Server Action `fetch`es `/api/cron/<job>` with `CRON_SECRET` in the
`x-cron-secret` header, server-side. Two reasons. The secret is read on the
server and never reaches the browser, so the button cannot become a way to learn
it. And the button then exercises the same path hPanel does, header and all — a
job that works from this page is evidence the scheduled one will work, which a
direct call to the job function would not be.

The origin comes from the request's own `Host` header rather than an env var, so
it works on localhost and behind Hostinger's proxy with no configuration.
`x-cron-actor` labels the log row with who pressed it; nothing is authorized by
it, and a forged value would need the secret to be sent at all.

The panel is otherwise **read-only**: nothing here schedules anything, because
hPanel does, and this page cannot know whether the entry was ever created. What
it shows is the last run we observed beside the cadence we believe is
configured — and the gap between those two is the finding.

---

## 34. Input validation & the Server-Action tests (settled in PR-51)

_§32 and §33 are PR-49's and PR-50's; this section is numbered for the order the
three merge in, not for the branch it was written on._

The audit's gap: the query layer is thoroughly tested, and the Server Actions
wiring forms to it were not — so a mis-wired argument passed CI. Three things
close it.

### 34.1 zod on the public surfaces, and only there

`pr-plan.md` PR-51: the schemas go where an unauthenticated stranger can post,
because that is where hand-rolled parsing risk is highest and a missed check is
a security finding rather than a bad row. `src/lib/admin/validation.ts` keeps
the admin and panel forms — one PR does not rewrite working validation for
symmetry.

**Server-side only.** The forms are client components, and zod on every public
route is weight the 150 kB budget (§9) does not have spare. So the browser keeps
what it had — `required` / `minLength` / `maxLength` / `type`, driven by the
**same constants** the schemas read (`LEAD_LIMITS`, `MAX_PASSWORD_LENGTH`) — and
the schema is the server's single statement of the same shape. One statement of
every number, enforced on both sides as it has to be, never written twice.
`client-bundle.test.ts` holds the boundary, and the measured public bundle is
unchanged.

### 34.2 A schema decides shape; it must not decide outcome

Three cases where being more helpful would be a vulnerability:

- **`loginSchema` accepts anything that could be a credential.** It refuses an
  absent field, a blank address, and strings longer than the column or the
  hasher — nothing else. A "correo inválido" for a malformed address standing
  beside one generic sentence for every real failure is an account oracle with
  extra steps, and `login.ts`'s uniform answer is the thing being protected.
- **Password reset answers the same sentence for every address**, so its schema
  refuses only what could not reach anybody at all.
- **Password strength is `passwordProblem`'s**, never a `.min()` in a schema. It
  owns the two numbers and the Spanish that names them, and the reset form, the
  change-password form and the bootstrap script have to give one answer.

The lead pipeline splits the same way. `leads/schema.ts` owns the shape — types,
trims, lengths, the age enum. `validateLead` keeps the **rules**, in order,
because each is a decision a schema cannot carry: the honeypot is checked first
and answered as a *success* (a bot that learns which field betrayed it stops
filling that field), the phone goes through `parseParaguayanPhone`, which
normalises as well as validates, and consent is compared against the version the
person was actually shown rather than merely required. `consent` and
`consentTextVersion` stay `unknown` in the schema on purpose: the route answers
`consent_required` and `consent_version_stale` as distinct codes, and a schema
failure would collapse both into `invalid_payload`.

### 34.3 What an action test asserts

Three properties, and the first is the one that matters:

1. **Bad input is refused before any query runs.** Not "returns an error" — the
   mocked query function must not have been called. A public endpoint that
   reaches the database on garbage is a free amplifier.
2. **Authorization is refused, and by the query.** The actions pass the session
   through — `null` included — rather than deciding anything themselves;
   `requireRole` is still the only place that answer is made (rule 4). The tests
   assert the argument, not a returned boolean.
3. **Arguments reach the query intact.** Guaraní amounts parsed out of the
   format the form displays, blanks as `null` and never `''`, the id as an
   argument and never from the form, and ownership checked before the payload is
   read — `savePanelPriceAction` refuses another institution's offering without
   telling the sender their payload was nearly right.

Twenty admin `actions.ts` files are near-identical, so they get one structural
scan (the session comes from `currentUser()`, no role or user id is read out of
the form, no mutation is called without it) plus two real ones — an area and an
arancel. Twenty copies of the same mock would be twenty things to update and one
thing proved.

### 34.4 `'use server'` is a boundary too

`client-bundle.test.ts` walked the import graph from every `'use client'` file
and did not stop at Server Actions — so it reported every query module in the
app as browser-reachable, since almost every client form imports its actions
file. Next replaces a Server Action import with a *reference*: none of that
module's code, or its imports', is compiled into the browser bundle. The walk
stops there now, which is the same reasoning as the client entries read from the
other side, and the fix is what let the boundary assertions mean anything.

### 34.5 Coverage is visibility, not a gate

`npm run test:coverage` prints the number; nothing fails on it and no threshold
is configured. A threshold picked before anybody has seen the figure is a number
invented to be met, and the first thing it buys is a test written to raise it.
The first measurement is **55.7 % of statements**. CI does not run it — `npm
test` is untouched, so the PR check costs what it did before (CLAUDE.md rule 11).


---

## 35. What the PR-49/PR-50 review found (settled in PR-52)

Both PRs were in the "Sonnet → Opus review" lane and merged on green CI without
that pass; the review ran afterwards, against `main`. It confirmed the designs
that were expensive to get wrong — the `import_runs` lock, `curate()`'s
failure-closing path, the `beginImport`/`runImport` split, one `slaCutoff` behind
both the SQL and the badge, registry-vs-route parity — and found six defects,
all fixed here. Three are worth reading as a class.

### 35.1 Two of them were false statements to a customer or an auditor

CLAUDE.md rule 1 is about invented data, and both of these are the same rule
wearing different clothes.

**`past_due_grace` asserted a future date had passed.** `past_due` is a status an
**operator sets**, not one the system reaches by a date, so it is reachable while
the period is still running — and the banner then read "El período terminó el 31
de diciembre de 2026" in August. Every test covered an `ends_on` in the past, so
nothing saw it. The state now branches on whether the period has actually ended;
the unpaid invoice is still stated, because that part was true.

**The import audit row was written before the lock was claimed.** A lost race
left `activity_log` saying an import started next to an `import_runs` table that
never saw one — two records of the same event disagreeing, which is the thing an
audit log exists not to do. It is written after the claim now, carrying the run
id it claimed.

### 35.2 One was a screen quietly destroying another screen

`/api/cron/[job]` writes an `activity_log` row per fire. Hourly `lead-retry`
alone is 24 a day, the whole schedule ~30 — and `/admin/actividad`'s default view
is the newest 50 rows with no `WHERE`. Within two days it was entirely machine
rows and the human edits PR-44 built it to show were pages down.

`cron_job` is excluded from the **unfiltered** view only. The rows stay in the
table, stay reachable by picking that entity in the filter, and `/admin/importaciones`
renders the same history per job. Hiding a default is not dropping data, and the
distinction is what keeps the log honest.

### 35.3 Three were the ordinary hazards of talking over HTTP

"Ejecutar ahora" awaited an entire cron job inside a Server Action with no
timeout. A slow `rebuild-search` outlives the proxy, the operator sees a generic
failure and clicks again — and unlike imports, cron jobs have **no lock**, so the
second click is a second concurrent pass. The jobs are idempotent, so that is
waste rather than corruption, but it is waste on the path that deletes. There is
now a 30 s bound and, on hitting it, a message that says the job is still running
and not to re-run it.

`x-forwarded-proto` was used verbatim, and it is a **list** behind a proxy chain:
`"https,http"` builds `https,http://host/...`, which fails to parse and breaks
every trigger with an opaque error. The first entry is the client's.

The third is §32.3's: a date helper that was zone-dependent in exactly the way it
was written to stop being.

---

## 36. Lighthouse, measured (settled in PR-53)

PR-34 wrote the budgets in `lighthouserc.json` and §24 explained why they run on
demand against a serving URL rather than inside the PR check. What it never did
was **run them**. This is the first measurement. It found two defects in the site
(§36.3, §36.5) and one in the harness that wrote the budgets (§36.4), and the
harness defect was hiding both of the others behind a number that looked fine.

### 36.1 How it was measured

`next build && next start` against a local MySQL with the taxonomy seeded
(`seed:taxonomy`, `seed:plans`) and **no catalog rows** — the CONES/ANEAES
sources 403 whole networks (`data-sources.md` §1), so the importers could not
run here. Chrome 141 headless, `lighthouserc.json`'s own emulation, three runs
per URL, medians below.

The empty catalog matters when reading the numbers: result lists render their
empty state, so the DOM and the byte counts below are **floors**. Every figure
here gets worse with a full index, not better. Re-run it against production
before treating any of it as the live number:

```
npm run build && npm run start &
npm run perf:lighthouse -- --url http://localhost:3000
```

`scripts/lighthouse.ts` re-hosts the four configured paths onto whatever origin
you pass and shells out to `lhci autorun`. The workflow calls the same script,
so the local command and the CI command are one command.

### 36.2 The numbers

Before, with `lighthouserc.json` as PR-34 committed it:

| page             | perf | a11y | best-practices | SEO  | LCP     | CLS       | TBT   |
| ---------------- | ---- | ---- | -------------- | ---- | ------- | --------- | ----- |
| `/`              | 0.99 | 1.00 | 1.00           | 0.91 | 1972 ms | 0.000     | 65 ms |
| `/carreras`      | 0.82 | 1.00 | 1.00           | 0.91 | 3066 ms | **0.235** | 97 ms |
| `/acreditacion`  | 0.73 | 1.00 | 1.00           | 0.91 | 3045 ms | **0.556** | 95 ms |
| `/universidades` | 0.98 | 1.00 | 1.00           | 0.91 | 2315 ms | 0.000     | 28 ms |

After the three fixes in this PR:

| page             | perf | a11y | best-practices | SEO  | LCP     | CLS   | TBT   |
| ---------------- | ---- | ---- | -------------- | ---- | ------- | ----- | ----- |
| `/`              | 0.99 | 1.00 | 1.00           | 1.00 | 2021 ms | 0.000 | 57 ms |
| `/carreras`      | 0.97 | 1.00 | 1.00           | 1.00 | 2446 ms | 0.030 | 69 ms |
| `/acreditacion`  | 0.97 | 1.00 | 1.00           | 1.00 | 2609 ms | 0.000 | 60 ms |
| `/universidades` | 0.99 | 1.00 | 1.00           | 1.00 | 2005 ms | 0.000 | 56 ms |

`lhci autorun` exits 0: every `error`-level assertion passes. Two caveats on
reading that as "LCP is under budget", both of which cut against us:

- The tables are **medians**; `lhci`'s default aggregation for a
  `maxNumericValue` assertion is **optimistic** — the best of the three runs. So
  `/acreditacion`'s 2609 ms median passes on a faster run. It is over budget by
  the honest reading and stays on the list.
- Run-to-run spread on this hardware is roughly ±200 ms on LCP. Differences
  smaller than that are noise, and the before/after tables were collected the
  same way on the same machine so that the deltas mean something.

The two `warn`-level assertions still warn: `unused-javascript` scores 0 on every
page, which is the framework bundle, not our code (§36.6).

### 36.3 The CLS was the loading skeleton (site defect)

Every public route is `force-dynamic` (§3), so Next streams: the shell — header,
`(public)/loading.tsx`, footer — paints, then the real `<main>` replaces the
fallback. The fallback was three skeleton bars, about 200 px in a full-height
layout, so the footer painted **inside the viewport** and the arriving content
then shoved it down. Chrome's `layout-shift` attribution named it exactly: one
shift, `<footer>`, `y: 375 → 732`.

Score 0.235 on `/carreras`, 0.556 on `/acreditacion` — against a 0.1 budget, on
every first visit, on the two pages the October traffic lands on.

The fallback now reserves `min-h-screen`, which is where the footer sits once the
content arrives too, so nothing visible moves. A page shorter than a viewport
would still shift slightly, which is why the residual on `/carreras` is 0.030
rather than 0 — under budget, and the honest floor for a streamed shell whose
fallback cannot know the height of what replaces it.

### 36.4 The `preset: "desktop"` line cost two audits (harness defect)

`lighthouserc.json` set `preset: "desktop"` and then overrode formFactor,
screenEmulation and throttling to mobile. Every field the preset sets was
overridden **except** `emulatedUserAgent`, which nothing below mentioned — so
three years of budgets written for "throttled mobile" were collected by a
browser calling itself desktop Chrome.

That single leftover was doing real damage:

- **SEO 0.91 on all four pages.** Next 15 streams metadata to browsers and
  inlines it in `<head>` only for the HTML-limited bots in its own list. With a
  plain desktop UA, Lighthouse is a browser: `<title>`, description, canonical
  and OG tags arrive mid-body and React hoists them at hydration, so
  `meta-description` audits as **missing** on pages whose `<head>` is correct for
  every crawler that matters. Every real HTML-only consumer — Bingbot,
  `facebookexternalhit`, `WhatsApp`, `Twitterbot`, `Slackbot`, Applebot — is in
  Next's list and gets the blocking copy, and Googlebot renders JS. Nothing was
  wrong with the site.
- **The CLS reading was unstable.** With the preset, `/acreditacion` measured
  0.556 twice and 0.000 once in the same three-run batch.

The preset is gone rather than corrected, and `emulatedUserAgent` is now stated
explicitly: Lighthouse's own mobile UA plus the `Chrome-Lighthouse` token
Lighthouse used to append itself and no longer does. That is not a thumb on the
scale — the SEO category is a proxy for what a crawler sees, so it should be
collected as a crawler. `scripts/lighthouse.test.ts` asserts both settings so
neither can drift back.

### 36.5 Mono was preloaded on pages that never paint it (site defect)

`next/font` preloads by default. Plex Sans is one variable file (~40 kB) and
carries every heading and every line of body copy, so it stays. Plex Mono is two
static files (~21 kB) with one job — the numeric columns (`design-system.md` §3)
— and `/`, `/acreditacion` and `/universidades` do not paint a monospace glyph
between them. All three fetched it anyway: 61.3 kB of font on pages that use
39.6 kB of it, inside the ~274 kB that decides LCP on this profile.

With `preload: false` the `@font-face` stays and the fetch becomes demand-driven.
Font transfer on all four pages: 61.3 → 39.6 kB, and `/carreras` LCP a median
2717 → 2446 ms. Note what the empty catalog does to that last number: with real
rows `/carreras` renders the numeric columns, so it *will* fetch mono — one round
trip later, painting in the fallback meanwhile, which is the point. The pages
that never use it keep the whole 21 kB.

### 36.6 What was measured and deliberately not fixed

- **`unused-javascript` scores 0 on every page.** 135 kB of script transfer, of
  which the route's own code is 0–7.4 kB: the rest is React 19 + the App Router
  runtime. `npm run perf:budget` puts every public route at ~130 kB against the
  150 kB gzipped budget, so this is the framework floor, not our slack. It is a
  `warn` for that reason and should stay one.
- **`force-dynamic` routes get no `<link rel="preload" as="font">`.** Static
  routes do; a streamed dynamic render flushes `<head>` before the font is known,
  so the preload happens client-side after hydration instead. Confirmed both
  ways by rebuilding with the flag flipped. It is a real cost of §3's rendering
  choice and it is not fixable from application code — it is an argument for
  auditing which routes need `force-dynamic` at all, not for a workaround.
- **Anything that needs a live deploy.** TTFB, CDN behaviour, real RTT and the
  ISR cache on Hostinger are not measurable from a laptop, and a number invented
  for them would be worse than the gap. Re-run the command in §36.1 against
  production once the domain is serving.

---

## 37. Raising the coverage floor (settled in PR-54)

§34.5 printed the first number — 55.7 % of statements — and deliberately set no
threshold, because a threshold chosen before anybody has seen the figure buys a
test written to meet it. This is the other half: read the number, find what it
is actually saying, and cover the paths where being wrong is expensive.

**56.1 % → 59.0 % of statements** (branches 50.9 → 53.8, functions 51.0 → 52.4),
98 tests, no source file changed. Still no threshold: the same reasoning holds,
and the paths worth covering are chosen by what they do, not by what they move
the percentage to.

### 37.1 What the number was hiding

The gap was not spread evenly. Sorted by uncovered statements, the top of the
list was the admin write paths and the validators behind them — and three of the
parsers with the sharpest integrity rules in the repo had no test between them:

- `parseBecaInput` — CLAUDE.md rule 1 as a form. The source URL is required on a
  draft, the coverage and the amount have to agree, and a beca with no stated
  provider is not information. All of it was reachable only through the UI.
- `parseJobPostingInput` — attribution and dating (`risks.md` §R-11). A
  "publicado mañana" row sorts to the top of every list forever.
- `parseSubscriptionInput` — the money path, including the
  `subscriptions_date_order` CHECK said in Spanish before MySQL says it in
  English.

Each of those rules exists in two places: a CHECK constraint and a sentence the
operator reads. Only the sentence is the product, and only the sentence was
untested.

### 37.2 The data-ops console was the riskiest file at 0 %

`/admin/importaciones`'s actions are not one of the twenty near-identical CRUD
files §34.3 covered with a scan. "Ejecutar ahora" reads `CRON_SECRET`, builds an
origin out of the request's own headers and awaits an entire cron job over HTTP.
**Three of PR-52's six defects were in that one function** — the unbounded await,
`x-forwarded-proto` used verbatim when it is a list — and none of them had a
test, which is why a review had to find them rather than CI.

It has one now, including the two regressions by name: a `x-forwarded-proto` of
`"https,http"` must produce `https://host/...`, and a timed-out run must say
*"no lo ejecutes de nuevo"* rather than reporting a failure, because cron jobs
have no `import_runs`-style lock and the second click is a second concurrent pass
over the one job that deletes.

### 37.3 The two CRUD actions that are not three lines

`createInstitutionAction` reads a slug back out of the database, uploads a file
and encodes an upload failure into a redirect; the beca actions carry rule 1 from
the form to `/becas` and revalidate the public page as well as the admin list.
The §34.3 scan passed on both and could not see any of it. Both are covered now,
including the branch that matters when storage is down: the institution row
stays, and the failure travels to the edit screen instead of being swallowed.

### 37.4 Read paths: the order is the promise

`getOfferingRowsByIds` returns rows in the order the ids were given — the compare
columns follow the user's selection — and MySQL's `IN` promises no ordering at
all, so the re-sort in that function is the whole guarantee. It is now tested
against a stub that deliberately returns them shuffled. `withFacets: false`,
which exists so `/comparar` and the detail pages do not run eight facet queries
they have no rail for, is asserted by counting the queries rather than trusting
the flag.

### 37.5 What is still uncovered, and why it stays that way

The comparador's *logic* is at 94–100 % (`lib/compare/state.ts`,
`compare/rows.ts`) and the cost calculator at 96–100 % (`lib/prices/total-cost*`)
— both were already there. What is at 0 % is the **client components** around
them: `CompareProvider`, `CompareBar`, `CompareTable`, `ShareButtons`. Covering
those needs a DOM environment and a rendering library this repo does not have,
and adding jsdom + testing-library to raise a percentage is exactly the trade
§34.5 warned about. The logic they render is tested; the rendering is not, and
that is a deliberate line rather than an oversight.

The lead delivery modules (`leads/notify.ts`, `leads/retry.ts`,
`leads/digest.ts`) are also low, and are left alone here because they are the
email path, which is blocked on a decision outside the code.
