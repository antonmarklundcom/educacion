# PR-62 — ANEAES 2024 transcription. Sonnet 5 session. Lane 2. Opus review before merge.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-62", `docs/data-sources.md` §1.1
(ANEAES) and §1.2, `src/lib/ingest/parsers/aneaes.ts` (or wherever `parseAneaesCsv` lives —
find it with grep), `scripts/import-aneaes.ts`, and `prompts/_handoff.md`.

**Human input check first:** `data/sources/aneaes/Listado_de_acreditaciones_2024.pdf` must
exist on `main`. If it does not, append one line to `docs/decisions-needed.md` ("PR-62 needs
the ANEAES PDF committed at …"), commit, push, end. Do not fetch it — `*.gov.py` is blocked
from here and a substitute document is not the source.

Branch: `claude/pr-62-aneaes-2024` off latest `main`.

## Build exactly this

1. Read the PDF page by page (the Read tool takes `pages`). First record, in
   `data/sources/aneaes/README.md`, the section boundaries and the count each section prints
   (expected 122 nacional, 6 ARCU-SUR, 18 postgrado, 1 institution — if the PDF says otherwise,
   the PDF wins and the README says so).
2. Transcribe every row into `data/sources/aneaes/listado-2024.csv` with the §1.2 header:
   `Institucion,Carrera,Estado,Modelo,Resolucion,Fuente`. `Resolucion` empty on every row.
   `Fuente` = `https://www.aneaes.gov.py/wp-content/uploads/2024/12/Listado_de_acreditaciones_2024.pdf`
   on every row. `Modelo` = the section (`Modelo Nacional`, `ARCU-SUR`, `Postgrado`,
   `Institucional`). Names exactly as printed, accents included; no normalisation, no
   expansion of abbreviations.
3. Add a test that parses the CSV through `parseAneaesCsv`, asserts the per-section counts
   equal the README's, asserts every row is `citable`, and lists in the README's "unmatched"
   table every `Institucion` that does not resolve against the CONES institution names in
   `src/lib/search/__fixtures__` or the taxonomy — with the reason (spelling, missing from
   CONES, a faculty rather than an institution). Nothing is guessed to make it match.
4. Run the dry-run import and paste its summary into the PR body.

## Rules

- Rule 1 and rule 2 are the whole PR: a row you cannot read on the page is omitted and listed
  in the README, never reconstructed. Never invent a resolution number or a date.
- One commit per PDF page range is fine; the diff is the review.
- Run `npm run lint && npm test` before opening the PR.

## Exit

Every "Accept" line of the PR-62 entry with its proof. Open the PR, do **not** merge; the
review session merges after spot-checking rows against the PDF. Closing report per
`_handoff.md`.
