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
