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


## 11. The institution directory

`searchPrograms()` is still the only way to read the index. `/universidades` and the institution profile page read through a separate, small module instead: `src/db/queries/institutions.ts` (SQL) and `src/lib/institutions/` (the typed surface). It returns institution facts and counts only — never a price or an accreditation status, which still come only from `searchPrograms()`. Fixed at two queries total (one for institutions, one grouped aggregate for counts), never one per row. A count describes what we published, not what the institution has — a zero renders "no encontramos", never "no tiene" (`risks.md` §R-09).

Full reasoning: [`docs/decisions/pr-11.md`](decisions/pr-11.md).

---

## 12. Analytics & the event log

PR-14 built the write path (`recordEvent()`, the session hash); this is the callers and the first-party read. Two different things are called analytics here: the third-party script (Plausible, not GA4) loads only after consent; the first-party `events` table is ungated — no cookie, a server-derived non-reversible daily-rotating hash — because it is what an institution's own numbers are built from. Views are reported from the browser, never counted server-side during render, so the number survives being questioned. `compare_add` carries only an offering id (§18 resolves the institution via a join); `lead_submit` is written server-side, never client-reported. Every aggregate takes the same range plus an optional `institutionId`, in UTC. `/admin/stats` requires `requireRole(user, ['admin'])`.

Full reasoning: [`docs/decisions/pr-17.md`](decisions/pr-17.md).

---

## 13. Admin CRUD

`/admin` has CRUD for institutions, campuses, careers, programs and offerings. `requireRole` is called inside every mutation in `src/db/queries/admin/*.ts`, not only at the layout or action level, because a Server Action is a reachable endpoint on its own. One shared `AdminTable` and one shared `AdminForm` (the one client component in this PR) serve all five entities. `match_key` and `enrollment_status` are never form fields — they're derived the same way an import derives them. Deletes archive (`status = 'archived'`); nothing hard-deletes. Every write logs `activity_log` and rebuilds `program_search` inside the same transaction/action. Logo uploads go to an S3-compatible bucket via a hand-written SigV4 signer that fails closed if `S3_*` env vars are missing; nothing is ever written under the app directory.

Full reasoning: [`docs/decisions/pr-19.md`](decisions/pr-19.md).

---

## 14. Prices, accreditations, admissions and the moderation queue

Arancels are superseded, never edited — one current row plus history, enforced by a UNIQUE constraint and one transaction; `updatePrice` remains only as a logged correction. Accreditation, admission and price "retirement" each use the honest field (`sin_datos`, `is_active = false`) rather than a status column, so the row and its source survive. `offerings.enrollment_status` is derived by one function, `deriveEnrollmentStatus`, called from both the admin save path and PR-33's cron; a narrower-scope convocatoria always wins. The accreditation invariant (CONES habilita ≠ ANEAES acredita, a citation required) is enforced in both the form parser and `src/db/invariants.ts`, so the moderation queue's `resolveConflict` — which writes through the same `insertEntity`/`updateEntity` the importer uses — cannot bypass it. `bulkVerify` stamps `verified_at`/`verified_by_user_id` for an explicit, capped, fully-logged list of ids; it re-checks nothing. `/admin/frescura` reports the consequences: a stale arancel is shown with a warning (rule 3), never hidden.

Full reasoning: [`docs/decisions/pr-20.md`](decisions/pr-20.md).

---

## 15. The institution portal

The institution-scoping boundary is object-level, in `src/db/queries/panel/scope.ts`: every panel entry point resolves the row's owning institution and compares it against the session's, and a missing row and someone else's row both answer 403 — never a 404 that would let the URL space be probed. Direct-edit fields (aranceles, convocatorias, descriptions, plan de estudio) apply live and supersede, exactly like the admin path; register-sourced fields (`nameOfficial`, `conesResolution`, modality/turno/duración/sede) go through the same PR-20 moderation queue; `status` and accreditation are forbidden entirely from the panel. `panel/access.test.ts` runs the real server actions against a hostile session with every ownership lookup rigged to say "yes", and fails on any cross-institution write. Members are `institution_admin` only, with four separate ownership/self-demotion refusals. The password-reset gap this section originally left open (`/panel` built but not announced) was closed by PR-35 (§25).

Full reasoning: [`docs/decisions/pr-21.md`](decisions/pr-21.md).

---

## 16. The claim flow

The claim token is opaque: 32 random bytes, base64url in the link, an unsalted SHA-256 digest at rest, single-use, 72-hour TTL — chosen over a signed token (can't be revoked) or a numeric code (brute-forceable) because it already has all three needed properties as plain columns. The domain check compares the claimant's email only against `institutions.website`, never `.email`; only an exact/subdomain match auto-sends the token, and everything else — including "no website on file" — routes to admin approval rather than an automatic rejection. `claimTokenState` requires pending, unexpired, and either `domain_verified` or `decided_by_user_id`. Redemption is one transaction whose write order is the security property: claim the token conditionally, then conditionally claim the institution, then create the membership — a lost race rolls the whole thing back rather than re-assigning. Approval is `admin`-only; the flow never starts a session, ending at `/ingresar` instead. Rate-limited at 3/min and 10/hr per IP, plus a durable cap of 5 open claims per institution.

Full reasoning: [`docs/decisions/pr-22.md`](decisions/pr-22.md).

---

## 17. Plans, subscriptions & entitlements

`subscriptions` is the sole source of truth for what an institution has bought — `institutions.plan_id` is gone. `src/lib/entitlements/` (`contract.ts`, `resolve.ts`, `bands.ts`, `index.ts`) is the single gating surface; `requireFeature` throws server-side like `requireRole`, and nothing plan-related is client-readable. Entitlements are recomputed from dates on every request, so expiry needs no cron, and features union across stacked subscriptions (Destacado alongside Verificado). `program_search.plan_rank` is the one derived, cached copy and decides ordering only; `getPlacementFlags(ids)` reads live and decides the "Destacado" label, so a lapsed plan can never keep a paid-looking badge. PR-46 corrected two gaps the original tests missed: `plan_rank` was boosting Verificado (which does not buy priority placement) with no matching badge, and the ordering tests weren't actually checking cross-rank pairs — both are now asserted directly. Billing screens, including reads, are `admin`-only, never `editor`.

Full reasoning: [`docs/decisions/pr-25.md`](decisions/pr-25.md).

---

## 18. The institution analytics dashboard

`/panel/estadisticas` is where every number is reconcilable: vistas, clics and comparador appearances come from `events`, but solicitudes come from `leads` — the row, not the `lead_submit` event — because the row is what the institution can check against its own inbox when the two disagree. `compare_add` needs a join to resolve its institution, since the event only carries an offering id. Rolling windows compare against an equal-length prior window; the monthly report compares against the actual previous calendar month, computed explicitly rather than derived. A percentage change from a zero baseline is never reported ("sin base de comparación"). PDF export is the browser's own print dialog — no headless Chromium, no PDF layout library. The free tier sees only the four totals and the comparison; the per-carrera breakdown, daily series and CSV export require a plan, gated by `getEntitlements` inside the query module itself. No function in this module takes an institution id as an argument other than through `panelInstitutionId(user)`, and a test enumerates every database call to enforce it.

Full reasoning: [`docs/decisions/pr-28.md`](decisions/pr-28.md).

---

## 19. Billing operations & renewals

The operating layer around PR-25's model — still no payment gateway. Renewal reminders fire once a subscription is "at or inside" a 90/30/7 threshold rather than on an exact day, so a missed cron run still catches up; sending is recorded as a UNIQUE `(subscription_id, period_ends_on, threshold_days)` row, written after the mail leaves. PR-46 fixed the threshold selection from "narrowest unsent" (which re-sent overtaken thresholds under the wrong heading) to "narrowest applicable". The 90-day digest goes to the operator only — never an automated dunning mail to the institution, since the sales motion is a WhatsApp thread and a hand-issued factura. A subscription that runs out stops granting features on its own from dates alone; marking it `past_due` only starts a grace window (`BILLING_GRACE_DAYS`, default 15, read per call, capped at 90) — a cron never revokes and never cancels. `activity_log.user_id` is nullable for automated writes rather than inventing a "system user". The revenue view reports "contratado" (list price × active subscriptions), never "cobrado".

Full reasoning: [`docs/decisions/pr-29.md`](decisions/pr-29.md).

---

## 20. Editorial & the accreditation hub

Posts are DB-backed, not MDX, because the author is the operator working from a browser. A hand-written markdown subset (`src/lib/content/markdown.ts`) parses to React elements directly — never an HTML string — so no sanitizer dependency exists and a `<script>` in a body is inert by construction. `seo.md` §7's "no orphans" rule is enforced by `parsePostInput` at publish time only, so a draft can stay unfinished; `published_at` stamps once and a later edit never reorders the blog. The accreditation explainer text lives in the page file, reviewed in a diff by whoever merges, as a deliberate exception to "the operator edits without touching code" — área and career copy stay editable in `/admin`. The accreditation checker is a GET form over `searchPrograms`, answering "we could not verify" rather than ever implying "no acreditada". JSON-LD starts here, deliberately small (`Article`, `Person`, `BreadcrumbList`, `FAQPage`), generated from the same constants the pages render. `/admin/areas` edits descriptions and sort order only — slugs are seed data — and shows each área's word count against `MIN_EDITORIAL_WORDS`, the number that decides its `noindex` gate (`seo.md` §4.1).

Full reasoning: [`docs/decisions/pr-30.md`](decisions/pr-30.md).

---

## 21. Becas

`source_url` is `NOT NULL` on every beca — an unsourced one is the most damaging row this site could hold. Coverage is an enum (`total`/`parcial`/`monto_fijo`/`sin_datos`) with a CHECK tying the amount to it; `sin_datos` renders as an explicit "no sabemos cuánto cubre", never blank. Expiry is a query predicate compared against the request's own date, not a cron job, so a beca disappears exactly on its deadline day; a beca with no deadline stays listed as a permanent convocatoria. A closed beca still renders (never a 404) but goes `noindex, follow`. Provider is required, either as one of our institutions or a typed name. Every save re-stamps `verified_at` with the saving user, the same rule §14.2 applies to `bulkVerify`.

Full reasoning: [`docs/decisions/pr-31.md`](decisions/pr-31.md).

---

## 22. Salida laboral & empleos relacionados

`salida_laboral_md` is strictly qualitative — no salary, no employment rate, no "carreras mejor pagadas" — because Paraguay has no citable dataset for any of it (`risks.md` §R-11, §R-15). The rule can't be enforced by a validator, so it lives in the admin field's own label, at the point of writing, structured into suggested `##` headings so an empty template renders as absent rather than four blank sections. `/carreras/[carrera]/empleos` shows that qualitative copy plus a handful of real, dated, attributed postings, then links onward to trabajo.com.py with the career pre-filled and no tracking parameter — no scraper ships, by deliberate decision rather than omission. Expiry mirrors the becas rule: a posting shows only while `expires_on`, or `posted_on + 45 days` when unstated, is still ahead of the request's date; `UNIQUE(url)` prevents duplicate listings.

Full reasoning: [`docs/decisions/pr-32.md`](decisions/pr-32.md).

---

## 23. The freshness system, and the stale-price reversal

The policy reversed: an arancel older than 12 months used to be hidden; it is now shown, dated and warned about everywhere a price appears — cards, the programme page, the comparador, the OG image — via `priceFreshness()`/`priceDisplay()`, which return the amount and its staleness together so neither can render alone. Stale prices remain filterable and sortable, on the reasoning that what you can read, you can filter on. `Offer` JSON-LD still requires a price verified within 12 months (`seo.md` §5) — a warning is for a human reader, a rich result is repeated by a machine stripped of context. The 24-month lead purge is untouched and still deletes (`risks.md` §R-06 is a different promise). `scoreFreshness()` ranks `/admin/frescura`'s queue by overdue-days × a stated weight; every §10 cron now exists, `staleness` only ever reports (never auto-reverifies), and `purge-leads` remains the only destructive job. "Última actualización" appears on every page showing maintained data, including when nothing has ever been verified.

Full reasoning: [`docs/decisions/pr-33.md`](decisions/pr-33.md).

---

## 24. Performance, accessibility & the CI budgets

`npm run perf:budget` measures gzipped JS per public route straight from the real build manifest against the 150 kB budget (§9); `/admin` and `/panel` are exempt as staff-only tools. Lighthouse runs on demand against a deployed URL (`workflow_dispatch`, not a PR check) because every SEO surface is `force-dynamic` against a database CI does not have — it was not actually run until PR-53 (§36). Next's accessibility warnings are promoted to hard errors, which found and fixed two real defects (an anchor whose text a screen reader couldn't see, and a keyboard-unreachable modal backdrop). One skip link sits in the root layout targeting a shared `#contenido` wrapper; `globals.css` carries a global `:focus-visible` floor and a `prefers-reduced-motion` block. `next/image`'s `remotePatterns` is derived from `S3_PUBLIC_BASE_URL`, the same variable the uploader writes to.

Full reasoning: [`docs/decisions/pr-34.md`](decisions/pr-34.md).

---

## 25. Password reset by email

Closes the deferral PR-18 left open. `password_reset_tokens` uses the same construction as the claim token — 32 random bytes, unsalted SHA-256 digest, single-use — but a 60-minute TTL, since this is someone at the login screen right now rather than a mailed link waiting to be found. The request path answers the identical sentence for an unknown address, a suspended account, or a real one, writing no row in the first two cases; the one deliberate exception is that a failed send is reported, since only a real address can reach that branch. The link is spent by the POST, never the GET, enforced by a conditional `UPDATE … WHERE used_at IS NULL`; a successful reset invalidates every other outstanding token for that user. It does not start a session — the flow ends at `/ingresar`. Spent and expired rows are cleaned up by the existing `purge-leads` cron rather than a new job.

Full reasoning: [`docs/decisions/pr-35.md`](decisions/pr-35.md).

---

## 26. Accounts, and onboarding without email

`/admin/usuarios` closes the last "closed front door": the claim flow and password reset both require a working mailbox, and with Resend unconfigured the site could not onboard a single institution. The admin-issued access link reuses `password_reset_tokens` — same digest, same single-use update, same invalidation on redemption — but with a 72-hour TTL (handed over by a staff member who verified the recipient) and shown to the admin exactly once, never logged in plaintext. Issuing invalidates any prior outstanding link for that user. Only `admin` may issue links — `editor` gets a `notFound()`, not a permission message. A staff role may never carry an institution; an institution role must always have one. Suspending an account kills every outstanding link, and no link can be issued for a suspended one. An admin cannot suspend themself but can issue a link for another admin (lateral, not escalation). Institution admins still cannot self-serve links for their own members. Accounts are created and disabled here, not edited.

Full reasoning: [`docs/decisions/pr-36.md`](decisions/pr-36.md).

---

## 27. The public-read cache

`src/lib/cache/` wraps `searchPrograms`, `getOfferingsByIds`, `listInstitutions` and `getInstitutionBySlug` in `unstable_cache`, since the routes stay `force-dynamic` and neither the full-route cache nor `generateStaticParams` can apply. `getPlacementFlags` and `getWhatsappNumbers` stay uncached on purpose — a paid-placement label or a WhatsApp number read from a stale copy is the wrong trade. There is exactly one tag, `public-read`; a finer scheme would be unsound because nearly any write can change nearly any published row. The invalidation point is `rebuildProgramSearch()`, plus two named exceptions — claim redemption and `npm run curate` — that call `expirePublicReads()` directly, listed in `src/lib/cache/tags.ts` rather than left implicit. `cachedRead()` closes a Date-serialization hazard at the type level (a compile error for any non-JSON-safe wire type) and recomputes anything clock-derived, like price freshness, on every read whether it hit or missed. The cache is bounded by an in-memory LRU (`isrFlushToDisk: false`), not disk, so an attacker-reachable, unbounded keyspace degrades to pre-cache behaviour under load rather than serving anything wrong. The real p95 numbers this PR's acceptance criterion asks for are not recorded — they need a live host and dataset this environment has neither of.

Full reasoning: [`docs/decisions/pr-43.md`](decisions/pr-43.md).

---

## 28. The activity log, read back

`/admin/actividad` is the first reader of `activity_log`. The query module exports reads only, no write, enforced by a test that gives it a database throwing on every mutation and enumerates every export to call. `editor` can read the rows — that an account was created, by whom, when, is what an audit log is for — but the payload for `user`, `institution_member`, `subscription` and `personal_data` snapshots, and the actor's own email address, are withheld, because those are exactly what the corresponding `admin`-only screens show. The governing rule, "does another screen already refuse this reader" rather than "does it look sensitive", is enforced in the query itself and checked against every `logActivity` call site by a dedicated test, not just asserted once. The viewer renders only the diff between before/after snapshots, careful that an absent key, a null value, and a falsy-but-present value are three different edits. The date filter reads in `America/Asuncion`, not UTC, unlike `lib/analytics/range.ts` which stays UTC on purpose. `/admin/privacidad` (`risks.md` §R-06) is the one screen that destroys data; its guarantees are documented there, not here.

Full reasoning: [`docs/decisions/pr-44.md`](decisions/pr-44.md).

---

## 29. Observability

`@sentry/nextjs` covers the server only. `@sentry/browser` was measured at 144.5 kB gzipped against a 150 kB total public-route budget and rejected; instead the browser posts five short, truncated strings to `POST /api/client-error`, gated by same-origin and size checks, a 5/min per-IP limit, and a process-wide budget of 20/min — the only one of those that actually holds against a forged IP — and every report is tagged `unverified: true` since the payload is otherwise a forgeable string. An absent or blank Sentry DSN makes the SDK fully inert, checked in four separate places (no dynamic import, no `init`, no build plugin). `src/lib/observability/scrub.ts` is an allowlist at both the event-key and the header level; the exception message and log text are handled as a named denylist instead, redacting anything that looks like an email or phone number, since deleting the message entirely would make the report worthless. `EventThrottle` caps 5 events/min per fingerprint (exception type plus top stack frame, never the message) so one crash loop cannot exhaust the shared Sentry quota that other sites on the account also draw from; a matching per-key rate limit is set in the Sentry project itself as the half that survives a process restart. End-to-end capture across a server component, a Server Action and a client component is not verified from this environment — see `deployment.md` §8's post-deploy smoke test.

Full reasoning: [`docs/decisions/pr-45.md`](decisions/pr-45.md).

---

## 30. The copy catalog

`src/lib/copy/*.ts`, one file per surface composed by `es-py.ts`, is the only place new UI copy is allowed to live (CLAUDE.md rule 12). Access is `copy.nav.searchCta` — property access, not a string-keyed lookup — so a missing key is a compile-time type error with no runtime fallback branch to hit. The catalog is deliberately sliced per surface rather than one barrel module: a single-module version leaked +2.2 kB gzipped onto every public route through `Footer` → `error.tsx`, and `client-bundle.test.ts` now walks the client import graph and fails if the composed catalog becomes reachable from a client boundary. There is no i18n library or runtime lookup — one locale does not justify one yet; `student-engagement.md` §4 names guaraní as the likely second locale, and §30.3 is the migration path when that is decided. Data-provenance sentence generators (career and city intros, §20) and enum-keyed labels defined beside their union stay outside the catalog on purpose. `copy.test.ts` pins every migrated string to its exact pre-extraction wording and scans for the voseo violations CLAUDE.md rule 8 bans.

Full reasoning: [`docs/decisions/pr-47.md`](decisions/pr-47.md).

---

## 31. The total-cost calculator

`src/lib/prices/total-cost.ts` is pure arithmetic over already-verified columns — `annual_cost × años + derecho_de_examen` — with no new data collected and nothing estimated; the per-year half imports `computeAnnualCost()` rather than restating it, to stay in lockstep with the generated database column. A total renders only when every needed component is present, never as a floor or a "desde"; a fractional-year carrera reports "no sabemos cuántas matrículas se pagan" as our limitation, never "sin datos" as the institution's gap. Staleness (rule 3) travels on the total exactly as it does on the arancel it is built from, worded identically in both places. The comparador sorts cheapest-first with incomplete last and never converts currencies. The total renders per sede — in `OfferingsBlock`, in the aside's `TotalCostBlock`, and in the comparador row — all server components, no schema change. PR-48b closed a hazard where `program_search`, a denormalized copy of `prices` with none of its CHECK constraints, could produce a false "complete" total from a zero `installments_per_year` or a negative fee; `priceCheckViolations()` in `db/invariants.ts` now states those rules once, and both `total-cost.ts` and `catalog-schema.ts` re-assert them against the copy.

Full reasoning: [`docs/decisions/pr-48.md`](decisions/pr-48.md).

---

## 32. Lead SLA nudges & in-panel plan status

A lead is "overdue" — `status='new'` and at least 48 hours old — computed at render time by `src/lib/leads/sla.ts` from columns every lead already has, never stored as a flag; only `new` leads are tracked, and the word "SLA" never reaches the UI copy. `planStatusView()` reads live entitlement dates, never the cached `program_search.plan_rank`, so the panel's plan banner is correct the morning after a period lapses with no cron having run. It renders one of six states (`gratis`, `trial`, `active`, `active_open_ended`, `ending_soon`, `past_due_grace`); the free tier never shows a countdown, and `past_due_grace` names both the date the period ended and the date grace itself runs out. `ending_soon` fires at the same 30-day threshold as the operator's own renewal reminder mail, asserted equal by a test. `formatAsuncionDay` anchors and renders every panel date in `America/Asuncion` so a `date` column doesn't print the wrong day on a host outside that timezone — PR-49 fixed the anchoring half of this, PR-52's review found and fixed the rendering half.

Full reasoning: [`docs/decisions/pr-49.md`](decisions/pr-49.md).

---

## 33. The data-operations console

`/admin/importaciones` calls the same `beginImport`/`curate()` functions the CLI scripts call — one import path, not two. `import_runs` is the concurrency lock, claimed atomically with `INSERT … SELECT … WHERE NOT EXISTS`; every code path that opens a run also closes it, and `releaseImportRun` lets an operator recover a run orphaned by a container restart after `STUCK_AFTER_MINUTES`. The trigger awaits only the claim, not the full crawl, so the browser is never left waiting through a multi-minute pass. The cron panel reads `src/lib/cron/registry.ts`, the same single source `/api/cron/[job]`'s route uses, and every fire — success or failure — is logged to `activity_log` with `action='run'`. "Ejecutar ahora" calls the real HTTP route with `CRON_SECRET` server-side, rather than the job function directly, so a working button is evidence the scheduled path works too. PR-61 added the arancel CSV importer on top: it validates each row through the same `parsePriceInput` the admin form uses, takes `verified_at` as an explicit parameter instead of stamping "now", commits one transaction per row rather than one per file, and re-uploads the file at confirm time instead of staging state server-side between the dry run and the apply.

Full reasoning: [`docs/decisions/pr-50.md`](decisions/pr-50.md).

---

## 34. Input validation & the Server-Action tests

zod schemas are added only on public, unauthenticated surfaces — the lead form and auth — because that is where a hand-rolled parsing gap is a security finding, not a bad row; admin and panel forms keep the existing `src/lib/admin/validation.ts` untouched. A schema decides shape, never outcome: `loginSchema` and the password-reset schema stay maximally permissive so neither can become an account-enumeration oracle, and password strength stays owned by `passwordProblem`, never a schema `.min()`. Server-Action tests assert three properties — bad input never reaches a query, authorization is refused by the query rather than the action, and arguments reach the query intact and unmassaged — with twenty near-identical admin `actions.ts` files covered by one structural scan plus two full behavioural tests. `client-bundle.test.ts`'s client-reachability walk now stops at a `'use server'` boundary, since Next replaces a Server Action import with a reference rather than compiling its module into the browser bundle. The first coverage measurement — 55.7% of statements — is recorded with no threshold set, deliberately: a number chosen before anyone has seen the figure just gets gamed.

Full reasoning: [`docs/decisions/pr-51.md`](decisions/pr-51.md).

---

## 35. What the PR-49/PR-50 review found

An independent review of two PRs (PR-49, PR-50) that had merged on green CI without that pass, confirming their expensive-to-reverse designs and finding six defects, all fixed here. Two were false statements to a customer or an auditor: `past_due_grace` could assert a future period-end date had already passed (fixed to branch on whether the period actually ended), and an import's `activity_log` row could be written before the `import_runs` lock was actually claimed, leaving two disagreeing records of the same event (fixed by logging after the claim). One was a screen quietly destroying another: hourly cron log rows buried the human edits `/admin/actividad`'s unfiltered default view exists to show, fixed by excluding `cron_job` from that default view only — still filterable, never dropped. Three were the ordinary hazards of HTTP: an unbounded await on "Ejecutar ahora" (now 30-seconds-bounded, with a "don't re-run it" message, since cron jobs carry no lock), `x-forwarded-proto` read as a single value when a proxy chain sends a comma-separated list, and §32.3's zone-dependent date formatter.

Full reasoning: [`docs/decisions/pr-52.md`](decisions/pr-52.md).

---

## 36. Lighthouse, measured

The first actual Lighthouse run of the PR-34 budgets, against a local build with the taxonomy seeded and an empty catalog — every number here is therefore a floor, worse against a real dataset, not better. It found two site defects and one harness defect that was masking both. The loading-skeleton fallback lacked a reserved height, so the footer painted inside the viewport and then jumped when real content arrived — CLS 0.235–0.556 against a 0.1 budget; fixed by reserving `min-h-screen`. `lighthouserc.json`'s `preset: "desktop"` line left `emulatedUserAgent` unset, so every run measured a desktop browser rather than mobile Lighthouse — alone responsible for a false SEO score of 0.91 (Next streams `<head>` metadata only to its own crawler allowlist, which a desktop-UA Lighthouse isn't on) and an unstable CLS reading; the preset is gone and the UA is now stated and pinned by a test. Plex Mono was preloaded on three pages that never paint a monospace glyph, costing ~22 kB there for nothing — fixed with `preload: false`. `unused-javascript` (the React/App-Router framework floor) and the missing font preload on `force-dynamic` routes are measured and deliberately left alone; anything needing a live deploy (TTFB, CDN, real RTT) stays unmeasured from this environment.

Full reasoning: [`docs/decisions/pr-53.md`](decisions/pr-53.md).

---

## 37. Raising the coverage floor

§34.5's first coverage number (55.7%) was read for what it was hiding, not chased as a target — still no threshold set. Moved 56.1%→59.0% (98 tests, no source file changed) by covering exactly the admin write paths and validators carrying the sharpest integrity rules with zero tests: `parseBecaInput`, `parseJobPostingInput`, `parseSubscriptionInput`, and the data-ops console's "Ejecutar ahora" action, which held three of PR-52's six defects and no test at the time. Read-path ordering guarantees (`getOfferingRowsByIds` preserving caller order against MySQL's unordered `IN`) and the `withFacets: false` query-count optimization are now asserted directly rather than trusted. Comparador and cost-calculator *client components* remain untested — covering them would need jsdom/testing-library, judged not worth adding to move a percentage — while their underlying logic is already at 94–100%. Lead-delivery modules stay low, blocked on a decision outside the code. PR-58 (§37.6) closed the remaining six near-identical admin `actions.ts` files (carreras, programas, sedes, ofertas, empleos, blog) with one shared test file, reaching 62.1%.

Full reasoning: [`docs/decisions/pr-54.md`](decisions/pr-54.md).

---

## 38. The `force-dynamic` audit

Every one of 101 `force-dynamic` files in `src/app` was reviewed individually and confirmed needed — query-string-dependent pages, build-time database absence, auth-gated screens, or genuinely live headers/queries — nothing was removed. The real finding was six read paths behind those routes that PR-43's cache never reached: the career and área reads (`getCareerBySlug`, `getAreaBySlug`, `getCareerStats`, `getCareerCitySupply`, `listCareersByArea`, `listRelatedCareers`), which back every career hub, city page and the homepage's supply ranking. The homepage's `loadTopCareers` walk in particular was up to 28 uncached, necessarily-sequential round trips per request against an 8-connection pool. All six now go through `cachedRead` on the same tag and TTL as PR-43's original four; `admin/areas.ts`'s write path was taught to call `expirePublicReads()` directly, since an área edit never touches `program_search` and would otherwise wait up to an hour to appear. `becas`, `posts` and `plans` reads were deliberately left uncached here, because their write paths don't rebuild the search index — PR-57 (§40) is that follow-up change.

Full reasoning: [`docs/decisions/pr-55.md`](decisions/pr-55.md).

---

## 39. What the sweep of PR-30/31/41 found

Prompted by §38's audit, every public route's `generateMetadata` was read in one pass rather than reviewed PR-by-PR, and found that the `noindex, follow`-on-filtered-view rule (`seo.md` §1) had been implemented exactly once, on `/carreras` by PR-09, and never carried to three other surfaces: career hubs, institution profiles, `/acreditacion` and `/becas` were all indexing every filter combination as a self-canonical near-duplicate of the clean page — three of the four being money pages. All four now share one `hasActiveFilters()`-shaped predicate (page number and sort order deliberately excluded). `/becas` also had an unvalidated query-string value cast straight into a `WHERE` clause — not a SQL-injection risk since Drizzle parameterizes, but every `?tipo=<anything>` rendered as a real "filtered" page with its own `ItemList`; it now validates against the enum the way `parseSearchFilters` has since PR-08. Both `/becas` and `/acreditacion` now withhold their JSON-LD block entirely on a `noindex` view, the same fix PR-41 had already made for career hubs but that never carried across.

Full reasoning: [`docs/decisions/pr-56.md`](decisions/pr-56.md).

---

## 40. Closing the last uncached public reads

The follow-up §38.5 named: `becas`, `posts` and `plans` reads now go through `cachedRead` via new thin wrappers (`@/lib/becas`, `@/lib/posts`, `@/lib/plans`), the same shape as `@/lib/institutions` and `@/lib/careers`. The write side is the actual work, since neither table is in `program_search`: `createBeca`/`updateBeca`/`archiveBeca` and the equivalent post mutations now call `expirePublicReads()` directly, outside their transaction, so a committed publish is never left stale for up to an hour; `plans` needed nothing, since it has no in-app write path at all, only the out-of-process `npm run seed:plans`. Date-dependent list reads (`listBecas`, `becaTypeCounts`, `listPublishedPosts`, `getPostBySlug`) key their cache entry on `toDateOnly(now)`, so an expired beca or a not-yet-published post cannot linger past its date inside a warm cache entry; `getBecaBySlug`'s `isClosed` is instead computed per-request against that request's own clock, the same pattern price freshness uses.

Full reasoning: [`docs/decisions/pr-57.md`](decisions/pr-57.md).

---

