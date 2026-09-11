# PR-61 — Price bulk import: CSV → `prices`. Opus 5 session. Lane 1, after PR-59.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-61", `docs/review-2026-09.md` §3
F-3, `docs/data-model.md` §2 "Money", `docs/data-sources.md` §5, `docs/architecture.md` §14
(prices + moderation) and §33 (the import console), and `prompts/_handoff.md`. Then the code:
`src/lib/admin/validation.ts` (`parsePriceInput`), `src/db/queries/admin/prices.ts`,
`src/app/admin/importaciones/*`, `src/app/admin/aranceles/*`.

Branch: `claude/pr-61-price-csv-import` off latest `main` (must contain PR-59).

## You own the interface

The CSV header is the data assistant's spreadsheet template and will be printed, shared on
WhatsApp and filled by a human for a year. State in the PR body why it keys on the four slugs
(institution, program, campus, modality) rather than an offering id, what happens when the
slugs resolve to nothing (error row, never a created offering), and the supersede rule
(a valid row for an offering with a current price creates a new current row and demotes the
old one — the existing query, not a new one). Write the contract into `docs/data-sources.md`
§5.1 and ship `data/templates/aranceles.csv` with the header and **one obviously fake example
row** (`ejemplo-institucion`, amounts of `0`, `notes` = "fila de ejemplo — borrar"); never a
plausible price.

## Scope — exactly the PR-61 entry

Parsing (build a `FormData` per row and call `parsePriceInput`; do not fork validation), the
dry-run table with per-row verdicts in the form's own Spanish messages, apply with
`verified_at` = `verified_on` from the row, `verified_by_user_id` = session user,
`activity_log` per row, `requireRole` on both actions, the 500-row and file-size caps with
their copy in the catalog, the fixture CSV and its tests, and the docs.

## Rules

- No SQL outside `src/db/queries/`. No new dependency (parse CSV by hand; quoted fields with
  commas must work — test it).
- A row's `verified_on` older than 12 months is imported *and* flagged in the dry run as
  "se importará como dato desactualizado" — rule 3 shows stale prices, it does not hide them.
- Money is never rounded, currency never assumed; a missing `currency` is an error row.
- Server components; the upload form is a plain `<form>` with a Server Action.
- Run `npm run lint && npm test && npm run build` before opening the PR.

## Exit

Every "Accept" line of the PR-61 entry with its proof. CI green. Merge when green. Spawn
nothing afterwards: the closing report tells Anton the Sonnet lane can start with
`prompts/sonnet-1-pr60-canonical-host.md`.
