# PR-59 — Offerings without a stated modality. Opus 5 session. Lane 1, first.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-59", `docs/review-2026-09.md` §3
F-1, `docs/data-model.md` §2 "Programs & offerings" + "The search table", `docs/data-sources.md`
§1.1 (CONES), `docs/architecture.md` §4, and `prompts/_handoff.md`. Then the code the entry
names. Do not read the rest of `architecture.md`.

Branch: `claude/pr-59-modality-sin-datos` off latest `main`.

## What you are fixing

`src/lib/curate/pipeline.ts` refuses to create an offering when CONES prints no modality.
CONES prints none for anyone now, so `program_search` is empty and so is the site. The decision
is made: `MODALITY` gains `'sin_datos'`; CONES rows become offerings with it; the gap is shown,
never defaulted to `presencial`.

## You own the interface

Before code, write in the PR body: the two or three ways to represent an unknown modality
(enum value vs nullable column vs a separate flag) and why the enum value wins here (the
uniqueness index and `program_search` both key on it). Then state the contract other PRs build
against: the filter semantics (a `modalities` filter never matches `sin_datos`), the facet
rule (shown with count, not selectable), the supersede rule (a real-modality offering for the
same program + campus unpublishes its `sin_datos` twin, never deletes), and the JSON-LD rule
(no `courseMode`).

## Scope — exactly the PR-59 entry

Schema + migration (`npm run db:generate`, commit the SQL), `mapModality` untouched, the
pipeline branch, `program_search` rebuild, `src/lib/search/params.ts` + `engine.ts` +
`labels.ts`, the copy catalog entry for "sin datos", every render surface the entry lists
(cards, table view, comparador row, `OfferingsBlock`, `/og/programa`, city intro),
`catalog-schema.ts`, `parseOfferingInput`, the panel offering editor, and the two docs. Tests
replace "does not invent a modality" with the new behaviour and add the filter, facet,
supersede and JSON-LD cases.

## Rules

- No SQL outside `src/db/queries/`. No new dependency. Copy through `src/lib/copy` only.
- Rule 1 still holds: nothing is defaulted. `sin_datos` is a displayed value, not a guess.
- Do not touch caching, auth, prices or anything the entry does not name. Ideas → PR body
  "Backlog", not commits.
- Run `npm run lint && npm test && npm run build` before opening the PR.

## Exit

Every "Accept" line of the PR-59 entry, each with its proof in the PR body. CI green. Docs in
the same PR. Merge when green (`_handoff.md` gates). Then, per `_handoff.md`, spawn or hand off
to `prompts/opus-2-pr61-price-csv-import.md` (Opus 5).
