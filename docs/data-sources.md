# Data Sources & Ingestion

> Read `plan.md` §6 first: this is the hard part of the project, not the code.

## 1. Source inventory

| Source | What it gives | Format | Reliability | Refresh |
|---|---|---|---|---|
| **CONES** — `cones.gov.py` | The legal register: habilitated universities (59) and their habilitated carreras/programas, with resolution numbers | Card grid + server-rendered HTML tables, links to resolution documents | Authoritative for *legality*. Naming inconsistent, no stable IDs, no API | Monthly |
| **ANEAES** — `aneaes.gov.py` | Accredited programs — 122 nacional, 6 ARCU-SUR, 18 postgrado, 1 institution ("Año 2024") | **A 12-page PDF.** No resolution numbers, no resolution dates | Authoritative for *accreditation*, but not machine-readable — see §1.1 | Annual, in practice |
| **datos.gov.py** (CKAN) | "Carreras de grado acreditadas – Modelo Nacional" dataset | Was CSV; the resource now points at an ANEAES endpoint | **Dead.** Published 2019-08-12, modified 2019-10-15; the old CSV URL returns 0 rows | — |
| **MEC** | Institutos de Formación Docente, institutos técnicos superiores | Mixed | Patchy | Semiannual |
| **Institution websites** | Aranceles, convocatorias, planes de estudio, contacts | Unstructured HTML, PDFs, sometimes only WhatsApp | Poor structure, but this is where the *unique* value lives | Per admission cycle |
| **The institutions themselves** (Phase 2) | Verified data via `/panel` | Our own forms | Highest — this is the goal state | Continuous |

**Note on access:** these government sites block automated fetches from some networks (403s observed from this environment). Ingestion runs from a local machine or the Hostinger box, with a normal browser UA, at low rate. Do not hammer them — one polite pass per month is enough and keeps us welcome. `IMPORT_RATE_LIMIT_MS` is the brake and `politeFetchText` now reads it: it is a floor, so a caller can slow a run down but not speed it past what the operator set.

## 1.1 What the sources publish today (verified against saved pages, Aug 2026)

Both registers reorganized after PR-05 was written, which is why the first real
run parsed zero rows from URLs that fetched fine. **The URLs were reachable;
the parsers were reading a shape that no longer existed.**

### CONES

| Was | Is |
|---|---|
| `/universidades-habilitadas/` | 404 → **`/universidades/`** |
| `/carreras-habilitadas/` | 404 → **`/category/ofertas-academicas/`**, and each institution's own page |

- **`/universidades/`** is a **card grid**, not a table: one `div.dc-card` per
  institution, 12 per page, 5 pages, "Se encontraron 59 registros". Each card
  links to the institution's own page and prints a labelled contact blurb
  (`Teléfono:` / `Dirección:` / `Ciudad:` / `Web:`). There is **no `<table>` on
  the page at all** — a table-only parser cannot return anything but zero.
  Start the crawl here, not at the site root: the root is timeout-prone.
- **Carreras** live in a `wpDataTable`, server-rendered, one table per
  institution, no JS and no POST needed. Columns: `Carrera/Programa` · `Tipo` ·
  `Sede o Filial` · `Documento respaldatorio` · `IES` · `Antecedentes` ·
  `Estado`. The saved UNA page carries 845 rows (810 after collapsing the 35
  rows the register itself repeats), current through 2026.
- The institution column is now **`IES`**, and the level column is **`Tipo`**
  (`Grado` / `Postgrado` / `Pregrado`). Both were missing from PR-05's header
  vocabulary, which is the second reason the archive parsed zero.
- **There is no modality column any more.** `modalityRaw` is null on every
  program row, so PR-06 will not create offerings from CONES — its "no offering
  without a stated modality" gate holds, and that is the correct outcome. An
  honest gap; do not default it to `presencial`.
- **`Estado`** is empty or `INACTIVO` (31 of 845 on the UNA page). It is carried
  as `offeringStatusRaw` — deliberately *not* `statusRaw` — because it is the
  standing of the offering and must never reach `mapAccreditationStatus`. CONES
  cannot say anything about accreditation.
- Rows are occasionally **truncated mid-row** and lose their trailing cells,
  including `IES`. Such a row is attributed to the table's own single distinct
  institution and marked `institutionNameSource: 'table'`; a table naming more
  than one institution gets no fallback and the row is dropped. Nothing is
  guessed.

### ANEAES

- `https://www.aneaes.gov.py/acreditation/api/v1/` — the endpoint the stale CKAN
  resource points at — **is not an API.** Fetched from an unblocked network it
  returns ANEAES's generic "Página no encontrada" HTML 404. Do not build against
  it.
- The old datos.gov.py CSV URL returns 0 rows; the dataset behind it was last
  modified in 2019.
- What ANEAES publishes now is
  `wp-content/uploads/2024/12/Listado_de_acreditaciones_2024.pdf` — 12 pages,
  "Año 2024", 122 nationally accredited programs, 6 ARCU-SUR, 18 postgrado,
  1 institution. **It carries no accrediting resolution numbers and no
  resolution dates.**

**What we may honestly display from it.** Rule 2 requires `source_url` *or*
`resolution_number` for a positive status. The PDF's own URL is a legitimate
`source_url`, so an accreditation sourced to it **can** be shown, cited as
*"Fuente: ANEAES, Listado de acreditaciones 2024"* and linked to the PDF, with
`resolution_number` left **null**. What we must not do is synthesize a number to
fill the column, or print a validity window the PDF does not state — no
`valid_from`, no `valid_to`, therefore no "vigente hasta" copy from this source.
A program absent from the listing stays `Sin datos de acreditación`.

`parseAneaesCsv` now reads a per-row source-URL column (`Fuente` / `source_url`
/ `documento` / `url`) and treats an `http(s)` value there as sufficient
provenance, so a row with a citation but no resolution number is `citable: true`
instead of being refused by PR-06's apply gate. A non-URL value in that column
is ignored — a citation nobody can open is not a citation.

**How the PDF becomes rows is an open decision** — see §1.2. Until it is made,
`npm run import:aneaes` with no `--file`/`--url` **throws** rather than fetching
a dead URL and reporting a truthful-looking zero, and `collectAneaes` refuses to
hand a PDF to the HTML reader.

## 1.2 The ANEAES PDF: parse it or transcribe it (open)

| Option | Cost | Risk |
|---|---|---|
| **Parse the PDF** | A permanent dependency: `unpdf` 1.8.0 ≈ 2.1 MB, `pdf2json` 4.0.3 ≈ 8.2 MB, `pdf-parse` 2.4.5 ≈ 21.3 MB, `pdfjs-dist` 6.2.108 ≈ 34.5 MB unpacked | PDF text extraction loses column boundaries on tabular layouts. The failure mode is a row whose institution and programme come from different lines — a wrong accreditation on a real university's page. **Extraction quality against this specific document is unverified: `*.gov.py` is unreachable from here, so nobody has run the 12 pages through any of these libraries yet.** |
| **Transcribe once into a checked-in CSV** | ~147 rows by hand, once a year | None at parse time. The CSV is reviewable in a diff, ingests through the existing `--file` path with no new code, and carries the PDF URL per row as `source_url` |

**Recommendation: transcribe.** ANEAES publishes this listing roughly once a
year — a permanent runtime dependency is a poor trade for one annual document,
and the row count is an afternoon, not a project. The deciding argument is not
size, though: it is that the parse cannot be validated from here, and the field
it would get wrong is the one field on the site with legal and reputational
exposure. A hand-checked CSV is auditable line by line in review; a silent
column shift is not. Revisit if ANEAES starts publishing monthly or restores a
structured export.

Transcription contract — the headers `parseAneaesCsv` reads:

```csv
Institucion,Carrera,Estado,Modelo,Resolucion,Fuente
INSTITUCION,Carrera,Acreditada,Modelo Nacional,,https://www.aneaes.gov.py/wp-content/uploads/2024/12/Listado_de_acreditaciones_2024.pdf
```

`Resolucion` stays empty because the source omits it. Leave the vigencia columns
out entirely rather than filling them.

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
| `src/lib/ingest/parsers/cones.ts` | Habilitación rows, in both shapes the register now uses: `parseConesInstitutions` (the card grid), `parseConesPrograms` (the carreras table), and `parseConesRegister`, which runs both so an operator pointing `--file` at a saved page does not have to know which they saved. Emits no accreditation field of any kind. |
| `src/lib/ingest/parsers/aneaes.ts` | Accredited-program rows. Carries the source's own wording in `statusRaw` and flags `citable: false` when a row has neither resolution number nor an `http(s)` source URL. |
| `src/lib/ingest/sources.ts` | The URLs, and the CONES crawl: start URLs → their `page/N/` views → each institution's own page, followed from its directory card. All of it through the one rate-limited per-host queue. |

Two rules are enforced at the raw layer rather than deferred to PR-06:

- **`citable: false` rows cannot support a positive accreditation status.** PR-06's apply step must refuse to write one from such a row (§R-09).
- **Absence is never negative.** Nothing in either parser can emit "no acreditada"; a missing row is `sin datos`.

**Running the importers when the sources 403 you.** They will (§1), including from CI. Both scripts take `--file`, so the documented procedure is: save the register page or CKAN export from a browser, then

```
npm run import:cones -- --dry-run --file ./tmp/universidades.html   # check the parse, no DB needed
npm run import:cones -- --file ./tmp/universidades.html             # write raw records
```

`--dry-run` parses, prints a sample payload and writes nothing — this is how you verify a parser against a freshly saved page after the source changes its markup, which it will. Numbers to expect from a saved page, so a regression is visible immediately: `/universidades/` → **12 institution records per page**; a saved institution/ofertas page → **one record per carrera row**, minus the rows the register repeats verbatim (845 → 810 on the UNA page).

A `--file` run parses only the file: it follows no pagination, because a saved page paginates nowhere. **A file run therefore captures one page of 5, not the whole register** — save all five, or run from a network that can reach the site.

**The network path, when a network can reach them.** `collectCones` walks the register in three shallow passes — the start URLs, their `page/N/` views, then each institution page discovered from a directory card — all serialized through the same per-host delay. Roughly 65 requests at `IMPORT_RATE_LIMIT_MS`; a couple of minutes at the default 2 s, which is the intended pace. `CONES_MAX_LISTING_PAGES` / `CONES_MAX_INSTITUTION_PAGES` bound it; hitting one means the register grew, and a human raises the number and watches the run.

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

**Status after the §1.1 rewrite:** the parsers have now been validated against real saved CONES pages, so the shape is no longer guesswork — but still nothing has been imported and `npm run curate` has still never run against real data. The auto-match rate remains unmeasured, and the two things that will decide it are visible in the markup already: CONES publishes **no institution code anywhere** (so every institution matches by name, exactly the case `institution_aliases` exists for), and it prints its own name inconsistently between the directory card and the `IES` column ("Universidad Nacional de Asunción" vs "Universidad Nacional de Asunción – UNA"). Expect the first run to lean on §4.1 normalization and to queue more than the fixtures suggest.

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
