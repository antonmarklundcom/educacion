# Data Model

Schema decisions are the most expensive thing in this project to change. **Opus 5 owns this file and PR-02.** Sonnet may add columns; Sonnet may not restructure relationships.

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

### Taxonomy / reference

```ts
areas            // Salud, Ingeniería y Tecnología, Ciencias Empresariales, Derecho, ...
  id, slug, name_es, sort_order, icon

careers          // canonical concepts, the SEO hubs
  id, slug, name_es, area_id, level_default,
  synonyms_json,        // ["Medicina y Cirugía", "Doctor en Medicina"] — used by the matcher
  description_md,       // editorial, 150+ unique words (SEO requirement)
  salida_laboral_md,    // nullable — see risks R-11, never fabricated
  created_at, updated_at

departments      // 17 departamentos + Asunción (capital)
  id, slug, name_es

cities
  id, slug, name_es, department_id, lat, lng
```

### Institutions

```ts
institutions
  id, slug, name_official,      // exactly as in the CONES register
  name_short,                   // "UNA", "UC" — display + monogram
  acronym, logo_url, brand_color,
  management enum('publica','privada'),
  type enum('universidad','instituto_superior','instituto_tecnico','ifd','otro'),
  cones_code,                   // habilitación registry key, unique where present
  founded_year, website, email, phone_e164, whatsapp_e164,
  description_md,
  status enum('draft','published','archived'),
  claimed_by_user_id,           // nullable, set by the claim flow
  plan_id,                      // nullable, Phase 3
  created_at, updated_at

campuses          // sedes / filiales — a real and frequently-ignored dimension in PY
  id, institution_id, name, city_id, address, lat, lng, phone_e164, is_main
```

### Programs & offerings

```ts
programs
  id, institution_id, career_id,
  name_official,                // as habilitated: "Carrera de Medicina y Cirugía"
  slug,                         // unique within institution
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
  shift enum('manana','tarde','noche','flexible'),   // nullable
  duration_months,              // integer — NEVER a free-text "5 años" string
  credits, plan_url,
  enrollment_status enum('abiertas','proximamente','cerradas','sin_datos'),
  status enum('draft','published','archived'),
  created_at, updated_at
  UNIQUE (program_id, campus_id, modality, shift)
```

**Why `duration_months` as an integer:** sorting and comparing is the product. "5 años" as a string is unsortable and uncomparable. Format for display at render time (`es-PY`).

### Money

```ts
prices            // one current row per offering + history
  id, offering_id,
  currency enum('PYG','USD') default 'PYG',
  matricula,                    // bigint, minor unit not needed for PYG
  monthly_fee,                  // "cuota"
  installments_per_year,        // usually 10 or 12 — required to compare honestly
  admission_fee,                // derecho de examen / CPI
  is_free boolean,              // public universities
  notes_md,                     // "incluye materiales", "arancel diferenciado por ingreso"
  source enum('institucion','relevamiento','web_publica'),
  source_url, valid_from, valid_to,
  verified_at, verified_by_user_id,
  created_at
```

**Comparison rule:** the comparador's canonical number is **annual cost = matricula + (monthly_fee × installments_per_year)**, computed and stored as a generated column so it is sortable. Showing only the monthly cuota lets a university with 12 small cuotas look cheaper than one with 10 larger ones. Show both; sort on the annual figure.

**Staleness rule:** if `verified_at` is older than 12 months, the UI shows "Consultá el arancel" instead of a number. Never display a price we can't stand behind.

### Accreditation (the wedge — see plan.md §2)

```ts
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
  source_url,                   // MANDATORY when status != 'sin_datos'
  source_record_id,
  verified_at, verified_by_user_id
```

**Hard constraint enforced in code and tested:** an accreditation row with `status IN ('vigente','en_proceso')` must have a non-null `source_url` **or** `resolution_number`. No citation, no badge. Default display state for unknown is **`sin_datos`** ("Sin datos de acreditación"), never "no acreditada" — asserting a negative we haven't verified is the legally dangerous case.

### Admissions

```ts
admissions
  id, scope enum('institution','program','offering'),
  institution_id?, program_id?, offering_id?,
  period_label,                 // "Convocatoria 2027 - 1er llamado"
  registration_opens, registration_closes,
  exam_date, classes_start,
  requirements_md, process_md,  // CPI / CBA / examen / ingreso directo
  url, verified_at
```

`enrollment_status` on `offerings` is **derived** from the active admission window by the daily cron — not hand-maintained.

### Leads & engagement

```ts
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

events            // first-party analytics we can bill on
  id, type enum('offering_view','whatsapp_click','compare_add','lead_submit','profile_view'),
  offering_id?, institution_id?, session_hash, created_at
```

`events` is the table that lets you tell an institution "tuviste 1.240 vistas y 87 clics a WhatsApp este mes". GA4 cannot produce a defensible per-institution number; this can.

### Accounts, plans, ops

```ts
users              // see architecture.md §7
institution_members(user_id, institution_id, role, created_at)
claims             // claim-your-profile flow
  id, institution_id, user_id, email_domain, token_hash, status, verified_at

plans              // 'gratis' | 'verificado' | 'destacado'
  id, code, name, price_usd_year, program_band_min, program_band_max,
  included_leads_month, features_json

subscriptions
  id, institution_id, plan_id, status enum('trial','active','past_due','cancelled'),
  starts_on, ends_on, invoice_ref, notes
  // Phase 3 billing is manual (transferencia + factura). See monetization.md.

source_records     // raw provenance, never edited
  id, source enum('CONES','ANEAES','DATOS_GOV_PY','MEC','INSTITUCION','MANUAL'),
  source_url, fetched_at, payload_json, checksum, import_run_id

import_runs
  id, source, started_at, finished_at, rows_in, rows_matched, rows_new, rows_conflicted, log

activity_log
  id, user_id, entity_type, entity_id, action, before_json, after_json, created_at
```

### The search table

```ts
program_search     // denormalized, rebuilt by script — see architecture.md §4
  offering_id PK, program_id, institution_id, career_id, campus_id,
  career_name, institution_name, institution_short, institution_logo, brand_color,
  city_name, city_slug, department_id,
  level, modality, management, shift,
  duration_months,
  monthly_fee_gs, annual_cost_gs, is_free,
  accreditation_status, accreditation_agency,
  enrollment_status,
  area_id, plan_rank,            // 0 gratis, 1 verificado, 2 destacado — affects ordering
  is_published,
  search_text                    // accent-stripped, lowercased, FULLTEXT indexed
```

---

## 3. Conventions

- Table and column names `snake_case`; Drizzle model names `camelCase`.
- Every table: `created_at`, and `updated_at` where mutable. Money/legal-adjacent tables also get `verified_by_user_id`.
- Soft delete via `status = 'archived'`. Never hard-delete an institution or program — inbound links and Google's index outlive our opinions.
- All phone numbers stored E.164 (`+595...`). All money stored as integers in the base currency unit.
- All timestamps stored UTC (`timezone: "Z"` on the pool); rendered in `America/Asuncion`.
- Slugs: lowercase, hyphens, ASCII only — `ingenieria-informatica`, never `ingeniería`.

## 4. Migration policy

- Drizzle migrations committed to `drizzle/`, applied from a **local machine** against Hostinger's Remote MySQL (see `deployment.md` — the `tsx` env-var trap is real).
- Never edit a committed migration. Add a new one.
- Any migration that drops or renames a column requires an Opus review and a note in the PR body describing the backfill.
