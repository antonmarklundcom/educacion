# Data Model

Schema decisions are the most expensive thing in this project to change. **Opus 5 owns this file and PR-02.** Sonnet may add columns; Sonnet may not restructure relationships.

Implemented in `src/db/schema.ts`. When this document and that file disagree, one of them is a bug — fix it in the same PR.

---

## 1. The central modelling decision: what is "a carrera"?

This is where naive education directories go wrong. Three distinct things get called "Medicina":

1. **The canonical career concept** — "Medicina", the thing a student searches for and the thing that groups 12 universities on one SEO page.
2. **The program an institution offers** — "Medicina y Cirugía, UNA, Facultad de Ciencias Médicas".
3. **The concrete offering** — that program, at the San Lorenzo campus, presencial, turno mañana, 6 años, with a specific arancel and a specific convocatoria.

Prices, durations, modalities and enrollment windows attach to **(3)**. Accreditation attaches to **(2) or (3)** depending on the ANEAES resolution. SEO hubs are built on **(1)**.

Model all three. Collapsing them costs a painful migration in month four.

```
careers (canonical)  1 ──< programs (institution's offer)  1 ──< offerings (campus × modality × shift)
institutions         1 ──< campuses                        1 ──< offerings
```

For MVP simplicity the UI treats an **offering** as "a carrera you can compare" — that is what shows in the result card and the comparador table.

---

## 2. Tables

24 tables. Below is the shape; `src/db/schema.ts` is authoritative for exact types, lengths and index names.

### Taxonomy / reference

```
areas            // Salud, Ingeniería y Tecnología, Ciencias Empresariales, Derecho, ...
  id, slug, name_es, description_md, sort_order, icon, created_at, updated_at
  UNIQUE (slug)

careers          // canonical concepts, the SEO hubs
  id, slug, name_es, area_id, level_default,
  synonyms_json,        // ["Medicina y Cirugía", "Doctor en Medicina"] — used by the matcher
  description_md,       // editorial, 150+ unique words (SEO requirement)
  salida_laboral_md,    // nullable — see risks R-11, never fabricated
  status,               // a career hub is not indexable until it has real copy
  created_at, updated_at
  UNIQUE (slug)

departments      // 17 departamentos + Asunción (code 0 = Distrito Capital)
  id, slug, name_es, code
  UNIQUE (slug), UNIQUE (code)

cities
  id, slug, name_es, department_id, lat, lng
  UNIQUE (slug)
```

`cities.lat/lng` are nullable and **seeded NULL**. We have no sourced coordinate dataset, and plausible-looking coordinates are still fabricated coordinates.

### Institutions

```
institutions
  id, slug, name_official,      // exactly as in the CONES register
  name_short,                   // "UNA", "UC" — display + monogram
  acronym, match_key,           // normalized matcher key, see data-sources.md §4
  logo_url, brand_color,
  management enum('publica','privada'),
  type enum('universidad','instituto_superior','instituto_tecnico','ifd','otro'),
  cones_code,                   // habilitación registry key, UNIQUE where present
  founded_year, website, email, phone_e164, whatsapp_e164,
  description_md,
  status enum('draft','published','archived'),
  claimed_by_user_id,           // nullable, set by the claim flow
  // no plan_id — `subscriptions` is the only source of truth for the plan
  // (dropped in migration 0004; architecture.md §17)
  created_at, updated_at
  UNIQUE (slug), UNIQUE (cones_code), INDEX (match_key)

institution_aliases   // the compounding asset of the matching pipeline
  id, institution_id, raw_name, match_key, source, created_by_user_id, created_at
  UNIQUE (match_key)

campuses          // sedes / filiales — a real and frequently-ignored dimension in PY
  id, institution_id, name, slug, city_id, address, lat, lng, phone_e164, is_main, status
  UNIQUE (institution_id, slug)
```

### Programs & offerings

```
programs
  id, institution_id, career_id,
  name_official,                // as habilitated: "Carrera de Medicina y Cirugía"
  slug,                         // unique within institution
  match_key,
  level enum('tecnicatura','grado','especializacion','maestria','doctorado'),
  title_awarded,                // "Doctor en Medicina y Cirugía"
  description_md,
  cones_resolution,             // habilitación resolution ref
  status enum('draft','published','archived'),
  created_at, updated_at
  UNIQUE (institution_id, slug)

offerings         // what the user actually compares
  id, program_id, campus_id,
  modality enum('presencial','semipresencial','distancia'),
  shift enum('manana','tarde','noche','flexible')   // NOT NULL, default 'flexible'
  duration_months,              // integer — NEVER a free-text "5 años" string
  credits, plan_url,
  enrollment_status enum('abiertas','proximamente','cerradas','sin_datos'),
  status enum('draft','published','archived'),
  created_at, updated_at
  UNIQUE (program_id, campus_id, modality, shift)
  CHECK duration_months > 0
```

**Why `duration_months` as an integer:** sorting and comparing is the product. "5 años" as a string is unsortable and uncomparable. Format for display at render time (`es-PY`).

**Why `shift` is NOT NULL:** MySQL treats NULLs as distinct inside a UNIQUE index, so a nullable `shift` would let the importer write the same offering twice and the unique key would never fire. `'flexible'` is the honest value for "not stated by the institution".

### Money

```
prices            // one current row per offering + history
  id, offering_id,
  currency enum('PYG','USD') default 'PYG',
  matricula,                    // integer, no minor unit for PYG
  monthly_fee,                  // "cuota"
  installments_per_year,        // usually 10 or 12 — required to compare honestly
  admission_fee,                // derecho de examen / CPI
  is_free boolean,              // public universities
  annual_cost,                  // GENERATED STORED — see below
  is_current boolean,
  current_offering_id,          // GENERATED STORED — uniqueness trick, see below
  notes_md,                     // "incluye materiales", "arancel diferenciado por ingreso"
  source enum('institucion','relevamiento','web_publica'),
  source_url, valid_from, valid_to,
  verified_at, verified_by_user_id,
  created_at
  UNIQUE (current_offering_id), INDEX (annual_cost), INDEX (verified_at)
```

**Comparison rule:** the comparador's canonical number is **annual cost = matricula + (monthly_fee × installments_per_year)**, stored as a generated column so it is sortable and indexable. Showing only the monthly cuota lets a university with 12 small cuotas look cheaper than one with 10 larger ones. Show both; sort on the annual figure.

`annual_cost` is **NULL, never 0**, whenever the figure cannot be computed honestly — nothing captured, or a cuota with an unknown number of installments. `NULL` means _sin datos_; `0` means _gratuita_. Collapsing the two would make an institution we have no data for look free. The identical logic lives in `computeAnnualCost()` (`src/db/invariants.ts`) and the two must stay in lockstep.

**"Which row is current?"** was ambiguous and ambiguity in the price table is expensive, so it is now explicit: `is_current` plus a generated `current_offering_id` that equals `offering_id` while the row is current and NULL otherwise. MySQL ignores NULLs in a UNIQUE index, which buys "exactly one current price per offering" without a partial index. History rows keep `is_current = false` forever.

**Staleness rule (changed in PR-33):** if `verified_at` is older than 12 months the number **is still displayed** — on the programme page, in the comparador and in the OG image — always with a visible "dato desactualizado" and the month it was last verified. `priceFreshness()` is the single decision point and returns `fresh | stale | unknown`; the search layer tags every `PriceSummary` with it, and `priceDisplay()` produces the amount and the warning in the same call, so a component cannot render one without the other. `Offer` JSON-LD still requires a price verified within 12 months (`seo.md` §5). "Consultá el arancel" now means only what it says: we have no number at all.

**Currency:** `annual_cost` is comparable only within a currency. USD-denominated rows are indexed with their native amounts and sort last; we do not apply an FX rate we would then have to defend.

### Accreditation (the wedge — see plan.md §2)

```
accreditations
  id,
  scope enum('institution','program','offering'),
  institution_id?, program_id?, offering_id?,
  agency enum('ANEAES','CONES','ARCUSUR','otra'),
  kind enum('acreditacion','habilitacion','en_proceso'),
  status enum('vigente','en_proceso','vencida','no_acreditada','sin_datos'),
  model,                        // "Modelo Nacional", "ARCU-SUR"
  resolution_number, resolution_date,
  valid_from, valid_to,
  source_url,                   // MANDATORY when the status asserts something
  source_record_id,
  is_disputed,                  // set by PR-24, suppresses the public badge
  verified_at, verified_by_user_id, created_at, updated_at
  CHECK accreditations_scope_target
  CHECK accreditations_citation_required
```

**Hard constraint, enforced three times over:** an accreditation row with `status IN ('vigente','en_proceso')` must have a non-null `source_url` **or** `resolution_number`.

1. `CHECK accreditations_citation_required` in MySQL — the backstop against a stray SQL write.
2. `assertAccreditationCitation()` in `src/db/invariants.ts` — every write path calls it, and it produces an error a human can act on.
3. `src/db/invariants.test.ts` — unit-tested including the whitespace-only-citation case.

No citation, no badge. Default display state for unknown is **`sin_datos`** ("Sin datos de acreditación"), never "no acreditada" — asserting a negative we haven't verified is the legally dangerous case. `assertAccreditationStatusIsSafe()` holds `no_acreditada` to the same citation bar as a positive claim.

`scope` is polymorphic and exactly one of the three target ids must be set; that too is a CHECK plus `assertScopeTarget()`.

### Admissions

```
admissions
  id, scope enum('institution','program','offering'),
  institution_id?, program_id?, offering_id?,
  period_label,                 // "Convocatoria 2027 - 1er llamado"
  registration_opens, registration_closes,
  exam_date, classes_start,
  requirements_md, process_md,  // CPI / CBA / examen / ingreso directo
  url, is_active, verified_at, verified_by_user_id, created_at, updated_at
  CHECK admissions_scope_target
  CHECK admissions_window_order   // closes >= opens
```

`enrollment_status` on `offerings` is **derived** from the active admission window by the daily cron — not hand-maintained.

### Leads & engagement

```
leads
  id, offering_id, institution_id,
  name, phone_e164, email, message,
  consent boolean, consent_text_version, consent_at,
  age_bracket enum('menor_18','18_mas','no_declarado'),   // see risks R-06
  source_page, utm_json,
  ip_hash, user_agent,          // hashed, for abuse control only
  status enum('new','sent','contacted','qualified','discarded'),
  delivered_at, created_at
  INDEX (institution_id, created_at)
  INDEX (phone_e164, created_at), INDEX (ip_hash, created_at)   // the durable rate limit, PR-14
  CHECK leads_consent_required  // consent = 1; there is no such thing as a stored lead without it

events            // first-party analytics we can bill on
  id, type enum('offering_view','whatsapp_click','compare_add','lead_submit','profile_view'),
  offering_id?, institution_id?, session_hash, created_at
  INDEX (institution_id, created_at), INDEX (type, created_at)
```

`events` is the table that lets you tell an institution "tuviste 1.240 vistas y 87 clics a WhatsApp este mes". GA4 cannot produce a defensible per-institution number; this can.

### Accounts, plans, ops

```
users
  id, email, password_hash, name,
  role enum('admin','editor','institution_admin','institution_editor'),
  institution_id?, status, must_change_password, last_login_at, created_at, updated_at
  UNIQUE (email)

institution_members(id, user_id, institution_id, role, created_at)  UNIQUE (user_id, institution_id)

claims             // claim-your-profile flow (PR-22, architecture.md §16)
  id, institution_id, user_id, email, email_domain,
  contact_name?, note?,                 // who says they are asking — the admin path needs it
  domain_verified,                      // email is on institutions.website's domain
  token_hash, expires_at, status, verified_at, decided_by_user_id, created_at
  UNIQUE (token_hash)
  // A token works only when status='pending' AND expires_at > now AND
  // (domain_verified OR decided_by_user_id IS NOT NULL).
  // status='expired' is never written: expiry is computed from expires_at.

plans              // 'gratis' | 'verificado' | 'destacado'
  id, code, name, price_usd_year, program_band_min, program_band_max,
  included_leads_month, rank, features_json
  UNIQUE (code)

subscriptions
  id, institution_id, plan_id, status enum('trial','active','past_due','cancelled'),
  starts_on, ends_on, invoice_ref, invoiced_amount_pyg, notes
  INDEX (institution_id), INDEX (status), INDEX (ends_on)
  // Phase 3 billing is manual (transferencia + factura). See monetization.md.
  // We quote in USD on the plan and invoice in guaraníes at the day's rate, so
  // `invoiced_amount_pyg` is a fact about this subscription that cannot be
  // recomputed from `plans.price_usd_year` afterwards (monetization.md §5).
  // An institution may hold more than one row at a time: Destacado is an
  // add-on alongside Verificado, and the effective plan is their union
  // (architecture.md §17). Nothing here is cached onto `institutions`.

source_records     // raw provenance, never edited
  id, source enum('CONES','ANEAES','DATOS_GOV_PY','MEC','INSTITUCION','MANUAL'),
  external_id, source_url, fetched_at, payload_json, checksum, import_run_id
  UNIQUE (source, checksum)

import_runs
  id, source, status, started_at, finished_at,
  rows_in, rows_matched, rows_new, rows_unchanged, rows_conflicted, log

curation_conflicts // the moderation queue — nothing auto-publishes on a conflict
  id, import_run_id, source_record_id,
  entity_type, entity_id?, kind enum('new','changed','conflict','ambiguous_match'),
  match_score, current_json, proposed_json,
  status enum('open','applied','rejected','superseded'),
  resolved_by_user_id, resolved_at, notes, created_at

activity_log
  id, user_id, entity_type, entity_id, action, before_json, after_json, created_at
  // user_id is NULL for an automated write (PR-29's past-due sweep). No
  // "system user" row: it would be indistinguishable from staff in a report.

job_postings       // PR-32 — a landing page's worth of real avisos, not a job board
  id, career_id, title, employer_name, location_label?, url, source,
  source_label, posted_on, expires_on?, summary?, status, created_at, updated_at
  UNIQUE (url), INDEX (career_id, posted_on), INDEX (status, expires_on)
  // url + source_label are NOT NULL: a posting we cannot attribute is somebody
  // else's content shown as ours. posted_on is NOT NULL because an undated
  // vacancy is indistinguishable from one filled last year, and may not be in
  // the future. Expiry is the becas rule: expires_on, or posted_on + 45 days.

becas              // PR-31 — real, sourced scholarships only
  id, slug, title, institution_id?, provider_name?, area_id?,
  type enum('institucional','estatal','privada','internacional'),
  coverage enum('total','parcial','monto_fijo','sin_datos'),
  amount_pyg?, percentage?, summary, details_md?, requirements_md?,
  apply_url?, source_url, deadline?, verified_at?, verified_by_user_id?,
  status, created_at, updated_at
  UNIQUE (slug), INDEX (status, deadline), INDEX (institution_id), INDEX (area_id)
  // source_url is NOT NULL: a beca is money somebody is promising a student,
  // and an unsourced one is the most damaging thing this site could publish.
  // CHECK ties the amount to the coverage — a "cubre el 100%" row cannot also
  // carry a guaraní figure, and a "parcial" row cannot omit its percentage.
  // Expiry is a query predicate, not a job: a beca past its deadline stops
  // being listed the same day, with no cron in the loop.

posts              // editorial, DB-backed so the operator publishes without a deploy (PR-30)
  id, slug, title, excerpt, body_md, author_name, author_bio?,
  status enum('draft','published','archived'), published_at?, created_at, updated_at
  UNIQUE (slug), INDEX (status, published_at)
  // A post is live only when status='published' AND published_at <= now, which
  // is what makes scheduling possible without a second column or a cron.
  // author_name is a string, not a users FK: a byline is an editorial fact, and
  // deleting a staff account must not rewrite the authorship of published work.
```

`UNIQUE (source, checksum)` on `source_records` is what makes re-running an importer a no-op rather than a duplicate factory — PR-05's acceptance criterion is a property of this index, not of the importer's cleverness.

### The search table

```
program_search     // denormalized, rebuilt by script — see architecture.md §4
  offering_id PK, program_id, institution_id, career_id, campus_id,
  city_id, department_id, area_id,

  institution_slug, program_slug, career_slug, area_slug, city_slug, department_slug,

  program_name, career_name, title_awarded,
  institution_name, institution_short, institution_logo, brand_color,
  campus_name, city_name, department_name,

  level, modality, shift, management, institution_type, duration_months,

  price_currency, matricula_gs, monthly_fee_gs, installments_per_year,
  admission_fee_gs, annual_cost_gs, is_free,
  price_verified_at, price_expires_on,

  accreditation_status, accreditation_agency, accreditation_source_url, accreditation_valid_to,

  enrollment_status, admission_closes_on,

  plan_rank,                     // 0 gratis, 1 verificado, 2 destacado — tiebreaker only
  is_published,
  search_text,                   // accent-stripped, lowercased, FULLTEXT indexed
  updated_at
```

No foreign keys: it is a derived artefact and the rebuild truncates it inside a transaction. The FULLTEXT index is created in `drizzle/0001_search_fulltext_index.sql` because drizzle-kit has no builder for it — do not lose it when regenerating.

Rules this table has to obey, and why each column above exists:

- **A row must be renderable and linkable on its own.** Hence the slugs: a result card that has to join to build `/universidades/{inst}/{program}` defeats the purpose of the table.
- **The comparador reads the same rows.** Hence `matricula_gs`, `installments_per_year` and `admission_fee_gs` — the compare table shows the breakdown, not just the annual total, and it must not join per row.
- **A badge is a link.** Hence `accreditation_source_url` (design-system.md §4).
- **The staleness rule survives an index that is one night old.** Hence `price_expires_on`: the rebuild is nightly but the 12-month boundary is crossed at an arbitrary moment, so the query layer compares this column against `NOW()` instead of trusting the index to be fresh. Since PR-33 that boundary decides **whether the number carries a "dato desactualizado" warning**, not whether it is shown — the amounts always travel and the UI labels them (`architecture.md` §23).
- **Program name ≠ career name.** Hence both: cards show the institution's `name_official` for the program, the hub groups on the canonical career.

---

## 3. Conventions

- Table and column names `snake_case`; Drizzle model names `camelCase`.
- Every table: `created_at`, and `updated_at` where mutable. Money/legal-adjacent tables also get `verified_by_user_id`.
- Soft delete via `status = 'archived'`. Never hard-delete an institution or program — inbound links and Google's index outlive our opinions.
- All phone numbers stored E.164 (`+595...`). All money stored as integers in the base currency unit.
- All timestamps stored UTC (`timezone: "Z"` on the pool); rendered in `America/Asuncion`.
- Slugs: lowercase, hyphens, ASCII only — `ingenieria-informatica`, never `ingeniería`.
- Pool: `connectionLimit: 8`. One Node instance on shared hosting; raising it turns "slow" into "Too many connections".

## 4. Migration policy

- Drizzle migrations committed to `drizzle/`, applied from a **local machine** against Hostinger's Remote MySQL (see `deployment.md` §5 — the `tsx` env-var trap is real; `drizzle-kit` does load `.env`, `tsx` does not).
- Never edit a committed migration. Add a new one.
- Any migration that drops or renames a column requires an Opus review and a note in the PR body describing the backfill.

---

## 5. The interface downstream PRs build against

Fixed by PR-02 so that PR-05, PR-06, PR-07, PR-08 and PR-09 do not have to renegotiate it. Types only — no implementation.

| File                         | Owner PR | What it fixes                                                                                                                                                                                   |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts`           | PR-02    | Tables, enums, constraints. Every enum is exported as a `const` array — the UI, the importers and the validators read the same list.                                                            |
| `src/db/invariants.ts`       | PR-02    | `assertAccreditationCitation`, `assertAccreditationStatusIsSafe`, `assertScopeTarget`, `assertPriceIsCoherent`, `computeAnnualCost`, `isPriceDisplayable`. Every write path goes through these. |
| `src/lib/ingest/contract.ts` | PR-02    | `RawRecord`, `SourceParser`, `ImportRunSummary`, `MatchResult`, `CurationProposal`, `ApplyReport`, `PROTECTED_FIELDS`.                                                                          |
| `src/lib/search/contract.ts` | PR-02    | `SearchFilters`, `SortKey`, `FILTER_PARAMS`, `OfferingSummary`, `PriceSummary`, `AccreditationSummary`, `Facets`, `SearchResponse`, `SearchPrograms`.                                           |

**PR-05** implements `SourceParser` and `ImportSource`. It writes to `source_records` and `import_runs` and to nothing else. `checksum` is a hash of the canonicalized payload; `UNIQUE (source, checksum)` does the de-duplication.

**PR-06** implements `BuildMatchKey`, produces `CurationProposal[]`, and calls `ApplyProposals`. Fuzzy matches at or above `FUZZY_PROPOSE_THRESHOLD` (88) are _proposed_, never applied — `FUZZY_AUTO_APPLY` is `false` and is not a knob to turn later. Any change touching a field in `PROTECTED_FIELDS` queues into `curation_conflicts` even when the match is certain.

**PR-07** implements `searchPrograms(filters) => { results, facets, total }` and nothing else may read `program_search`. Two things the contract already decides for it:

- `PriceSummary.isDisplayable` has the 12-month rule pre-applied and the amounts are `null` when it is false. Components cannot render a stale arancel because they never receive one.
- Facet counts use cross-filtering semantics: each group counts with every _other_ active filter applied but not its own.

**PR-08 / PR-09** consume `OfferingSummary` for the card view, the table view and the comparador. `FILTER_PARAMS` is the single source of truth for URL parsing and serialization, so the two views cannot drift; `MAX_COMPARE` is 4 (3 on mobile).

---

## 6. Gaps found in review and closed by PR-02

Checked against what PR-07 (search/facets) and PR-09 (comparador) actually need to run. Each item was missing from this document before PR-02 and is now in the schema:

| Gap                                                                            | Why it mattered                                                                                                      | Resolution                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `institution_aliases` was specified in `data-sources.md` §4.5 but had no table | PR-06's compounding asset had nowhere to live                                                                        | Table added, `UNIQUE (match_key)`                                             |
| No moderation queue table                                                      | PR-06 acceptance requires every conflict to land in a queue; PR-20 has to read it                                    | `curation_conflicts` added                                                    |
| `source_records` had no uniqueness key                                         | "Re-running produces zero duplicate rows" was unenforceable                                                          | `UNIQUE (source, checksum)`                                                   |
| `program_search` had no slugs                                                  | Every result card would have to join to build its own href                                                           | Six slug columns added                                                        |
| `program_search` had no `city_id`                                              | `architecture.md` §4 mandates an index on it; only `department_id` existed                                           | Added                                                                         |
| `program_search` had no price provenance                                       | The 12-month rule could not be applied at query time, so a stale arancel could reach the comparador and the OG image | `price_verified_at`, `price_expires_on`                                       |
| `program_search` had only `monthly_fee_gs` and `annual_cost_gs`                | The comparador shows matrícula + cuota × N; it would have joined back per row                                        | `matricula_gs`, `installments_per_year`, `admission_fee_gs`, `price_currency` |
| `program_search` had no accreditation source                                   | Every badge is a link to its source; the badge would have joined                                                     | `accreditation_source_url`, `accreditation_valid_to`                          |
| `program_search` had no `program_name`                                         | Cards show the institution's program name, not the canonical career name                                             | Added, alongside `title_awarded` and `campus_name`                            |
| `prices` had no way to identify the current row                                | "One current row + history" was a comment, not a constraint                                                          | `is_current` + generated `current_offering_id` + UNIQUE                       |
| Annual cost was specified but its NULL semantics were not                      | `0` and "sin datos" would have collapsed, making unpriced programs look free                                         | Generated column returns NULL when uncomputable                               |
| `offerings.shift` was nullable                                                 | The UNIQUE key would never fire, so the importer could duplicate offerings                                           | NOT NULL, default `'flexible'`                                                |
| Polymorphic `scope` on `accreditations`/`admissions` was unconstrained         | A row could target two entities at once, or none                                                                     | CHECK + `assertScopeTarget()`                                                 |
| `careers` had no status                                                        | Career hubs would be generated before they had the 150 words `seo.md` requires                                       | `status` added                                                                |

Two things were considered and deliberately **not** added:

- **A `becas` table.** PR-31, Phase 4. Adding it now would be schema written against an unwritten spec.
- **An FX rate for USD prices.** A converted arancel is a number we would have to defend on a date we do not control. USD rows keep their native currency and sort last.
