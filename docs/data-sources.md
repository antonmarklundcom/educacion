# Data Sources & Ingestion

> Read `plan.md` §6 first: this is the hard part of the project, not the code.

## 1. Source inventory

| Source | What it gives | Format | Reliability | Refresh |
|---|---|---|---|---|
| **CONES** — `cones.gov.py` | The legal register: habilitated universities (~59) and habilitated carreras/programas, with resolution numbers | HTML lists + PDF resolutions, published per session | Authoritative for *legality*. Naming inconsistent, no stable IDs, no API | Monthly |
| **ANEAES** — `aneaes.gov.py` | Accredited grade programs (~2.565 active as of Jul-2026), model, validity period | HTML lists + PDFs + boletines | Authoritative for *accreditation* | Monthly |
| **datos.gov.py** (CKAN) | "Carreras de grado acreditadas – Modelo Nacional" dataset, JSON/CSV | Structured, downloadable | Best structured starting point. May lag the ANEAES site | Quarterly |
| **MEC** | Institutos de Formación Docente, institutos técnicos superiores | Mixed | Patchy | Semiannual |
| **Institution websites** | Aranceles, convocatorias, planes de estudio, contacts | Unstructured HTML, PDFs, sometimes only WhatsApp | Poor structure, but this is where the *unique* value lives | Per admission cycle |
| **The institutions themselves** (Phase 2) | Verified data via `/panel` | Our own forms | Highest — this is the goal state | Continuous |

**Note on access:** these government sites block automated fetches from some networks (403s observed from this environment). Ingestion runs from a local machine or the Hostinger box, with a normal browser UA, at low rate. Do not hammer them — one polite pass per month is enough and keeps us welcome.

## 2. Legal posture on reuse

- CONES/ANEAES/MEC registers are **public administrative acts**. Reproducing factual content (institution names, program names, resolution numbers, accreditation status) is fine and is exactly what a public-interest directory does.
- **Attribute every fact.** `/legal/fuentes` lists the sources; every accreditation badge links to its resolution. This is both ethical and the best possible defence.
- **Never imply endorsement.** No official crests, no ".gov" styling, no "portal oficial". A persistent footer line: *"educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES."*
- **Institution logos:** nominative use for identification is defensible; keep a documented takedown path (`/legal/fuentes` → contact) and honour requests within 72 h without arguing.
- Do not republish PDFs; link to them at the source.

## 3. Ingestion pipeline

```
scripts/import-<source>.ts
  1. FETCH     → write raw payload to source_records (verbatim, checksummed)
  2. PARSE     → normalize into a staging shape { institutionName, programName, level, ... }
  3. MATCH     → resolve to existing institution_id / career_id / program_id  ← the hard step
  4. DIFF      → classify each row: NEW | UNCHANGED | CHANGED | CONFLICT
  5. APPLY     → NEW and UNCHANGED auto-apply; CHANGED and CONFLICT go to the moderation queue
  6. REPORT    → write import_runs summary; print a human digest
```

**Every importer is idempotent.** Re-running produces the same DB state. Use `onDuplicateKeyUpdate` keyed on a stable natural key (`cones_code`, or `institution_id + normalized_program_name`).

### 3.1 What PR-05 shipped (steps 1–2 and 6)

Steps 3–5 shipped in PR-06 — see §4.6. The raw layer writes to `source_records` and `import_runs` and to nothing else — `src/lib/ingest/repository.test.ts` asserts that against a fake db, so a later PR cannot quietly reach into a curated table from here.

| Module | Role |
|---|---|
| `src/lib/ingest/checksum.ts` | Canonicalize (sorted keys, collapsed whitespace) then SHA-256. Idempotency depends on this being stable across parses. |
| `src/lib/ingest/http.ts` | Polite fetch: identifying UA, per-host serialized delay, retries on transient status only. **A 403 is never retried** — §1 and §7. |
| `src/lib/ingest/html.ts` · `csv.ts` | Dependency-free table and CSV readers. Columns are addressed by header text, so a reordered column does not silently shift the data. |
| `src/lib/ingest/parsers/cones.ts` | Habilitación rows. Emits no accreditation field of any kind. |
| `src/lib/ingest/parsers/aneaes.ts` | Accredited-program rows. Carries the source's own wording in `statusRaw` and flags `citable: false` when a row has neither resolution number nor source URL. |

Two rules are enforced at the raw layer rather than deferred to PR-06:

- **`citable: false` rows cannot support a positive accreditation status.** PR-06's apply step must refuse to write one from such a row (§R-09).
- **Absence is never negative.** Nothing in either parser can emit "no acreditada"; a missing row is `sin datos`.

**Running the importers when the sources 403 you.** They will (§1), including from CI. Both scripts take `--file`, so the documented procedure is: save the register page or CKAN export from a browser, then

```
npm run import:cones -- --dry-run --file ./tmp/carreras.html   # check the parse, no DB needed
npm run import:cones -- --file ./tmp/carreras.html             # write raw records
```

`--dry-run` parses, prints a sample payload and writes nothing — this is how you verify a parser against a freshly saved page after the source changes its markup, which it will.

**Fixtures contain no real data.** `src/lib/ingest/__fixtures__/documents.ts` uses `INSTITUCION DE PRUEBA A` and `RES-TEST-1`, deliberately: a fixture pairing a real university with an invented resolution number is the string that eventually gets copied into a seed script. The fixtures assert shape, which is all the parsers decide.

**Nothing auto-publishes on a conflict.** A changed accreditation status is exactly the case where a silent bad write does reputational damage.

## 4. Entity matching (R-05 — plan for this to be annoying)

The same institution appears as:
- `Universidad Católica "Nuestra Señora de la Asunción"`
- `UNIVERSIDAD CATOLICA NTRA. SRA. DE LA ASUNCION`
- `U.C.A.` / `UC`

Approach, in order:

1. **Normalize:** uppercase → strip accents → strip punctuation → collapse whitespace → drop stopwords (`UNIVERSIDAD`, `NACIONAL`, `DE`, `LA`, `DEL`) into a `match_key`.
2. **Exact match on `cones_code`** when present. This is the only trustworthy key; capture it wherever it appears.
3. **Exact match on `match_key`**, then on `acronym`.
4. **Fuzzy:** trigram / Levenshtein ratio ≥ 0.88 → propose, do not auto-apply.
5. **Alias table:** every manual resolution writes an `institution_aliases(institution_id, raw_name, match_key)` row so the same string never needs deciding twice. **This table is the compounding asset of the pipeline** — after two import cycles, matching is nearly free.

Same approach for careers, using `careers.synonyms_json` as the alias store ("Medicina y Cirugía" → `medicina`).

**Expect ~60–70% auto-match on the first run.** Budget a day of human review. Do not try to reach 100% automatically; the alias table gets you there over three cycles for a fraction of the effort.

### 4.6 What PR-06 shipped, and what it refuses to do

`npm run curate` reads `source_records`, matches every row, applies what is safe and queues the rest into `curation_conflicts`. CONES runs before ANEAES and the snapshot is reloaded between them, so an accreditation can attach to a program created earlier in the same command.

| Module | Role |
|---|---|
| `src/lib/curate/match-key.ts` | §4.1 normalization, abbreviation expansion, acronym candidates, slugs |
| `src/lib/curate/similarity.ts` | Levenshtein + trigram; the score is the higher of the two |
| `src/lib/curate/match.ts` | The §4 resolution order for institutions, careers (via `synonyms_json`) and programs |
| `src/lib/curate/staging.ts` | The source's own words → our enums. One file, auditable |
| `src/lib/curate/classify.ts` | NEW / UNCHANGED / CHANGED / CONFLICT / AMBIGUOUS |
| `src/lib/curate/apply-rules.ts` | The gates. Pure, so PR-20's "approve" action can reuse them |
| `src/db/queries/curation.ts` | The only module that writes. Rule 5 keeps SQL out of `src/lib` |

**Refusals, each one tested:**

- **A new institution never auto-applies.** Neither register prints `management` (pública/privada), and that field appears on every card and in a facet. The proposal is honestly classified `new` and queued — the general rule is that a create whose NOT NULL fields the source does not supply is never invented into existence.
- **A program with an unmapped level queues**, rather than defaulting to `grado`.
- **An offering is not created without a stated modality**, and a campus is not created for a locality that is not in the seeded `cities`.
- **No accreditation without a citation.** A positive status requires `resolution_number` or an `http(s)` `source_url`, and a row the ANEAES parser flagged `citable: false` can never produce one — including via the document URL, which is only used as a citation when the row was citable and the URL is not a local file path from a `--file` run.
- **A negative never auto-applies.** `no_acreditada` is only ever written by a human, and absence of a row is `sin_datos` — represented by proposing *no accreditation row at all*.
- **CONES never becomes an accreditation.** A CONES habilitación resolution lands in `programs.cones_resolution`; the staging layer for CONES has no accreditation field, and the apply gate rejects `agency = CONES` with `kind = acreditacion` regardless.
- **Nothing in `PROTECTED_FIELDS` auto-updates**, even on a `cones_code` match. The classifier calls it a conflict and the writer strips those fields a second time.
- **Fuzzy proposes, never applies.** Every fuzzy hit is classified `ambiguous_match` and queued with its candidates. So is a `match_key` that resolves to two institutions — which is the accepted cost of §4.1 dropping `NACIONAL`.

Aliases are learned automatically: any spelling that resolved to an institution by cones_code, match_key or acronym is written to `institution_aliases`, so the next cycle resolves it in one lookup. Fuzzy matches never become aliases.

Re-running is a no-op: the same proposals are re-derived, classified `unchanged`, and nothing is written. An already-open conflict is not queued twice.

### 4.7 Do not report an auto-match rate you cannot stand behind

`pr-plan.md` asks PR-06 to report ≥ 60% auto-match. `npm run curate` prints that number per source — but **as of PR-06 it has never been run against real data**: the parsers have not been validated against saved CONES/ANEAES pages (§3.1's `--dry-run --file` procedure), and no `source_records` exist yet.

A rate measured against the synthetic fixtures is a measurement of the fixtures. The first honest number comes from: save the register pages → `--dry-run` each parser → import → `npm run curate -- --dry-run`. If the parsers turn out to need fixing against the real markup, do that **before** touching `FUZZY_PROPOSE_THRESHOLD` — a threshold tuned against a mis-parsed column is worse than the default.

## 5. Aranceles — the collection playbook

There is no dataset. This is fieldwork, and it is the moat.

Priority order (do not try to do all ~10k offerings):
1. **Top 60 careers × top 25 private institutions** ≈ 600–900 offerings. This covers the overwhelming majority of searches.
2. Public universities: mark `is_free = true` where genuinely free; capture the *derecho de examen* / CPI cost, which is what families actually ask about.
3. Everything else: `sin_datos` + a "¿Conocés el arancel? Avisanos" prompt, and a "Solicitar info" CTA. An honest gap converts better than a wrong number.

Per record capture: matrícula, cuota, number of cuotas per year, admission fee, source (URL or "consulta telefónica DD/MM/YYYY"), and who verified it.

**Re-verification:** annually, before the October season. The staleness cron flags anything over 10 months and emails the admin digest.

## 6. Freshness contract (shown publicly)

| Data | Target freshness | Displayed |
|---|---|---|
| Institution / program existence | 30 days | — |
| Accreditation status | 30 days | "Fuente: ANEAES, Res. N° ... (fecha)" |
| Arancel | 12 months, else hidden | "Arancel actualizado: {mes año}" |
| Convocatoria / inscripciones | 7 days in season | "Verificado: {fecha}" |

Publishing the freshness date is a feature, not an admission of weakness — it is precisely what the incumbent does not do.

## 7. What we will not do

- **No aggressive scraping of institution sites.** Polite, low-rate, respecting robots.txt. A single angry university can cost more in goodwill than the data is worth, and we need these people to become customers.
- **No fabricated fields.** No estimated aranceles, no inferred accreditation, no invented ratings, no "top 10 mejores universidades" rankings we cannot defend methodologically. (Rankings are tempting traffic bait and a legal/credibility trap.)
- **No salary data** until a citable source exists — see `risks.md` §R-11.
