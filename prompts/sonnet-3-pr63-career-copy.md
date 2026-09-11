# PR-63 — Career hub editorial copy. Sonnet 5 session. Lane 2. Opus review before merge.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-63", `docs/review-2026-09.md` §3
F-4, `docs/seo.md` §3–§4.1 and §8 item 4, `src/lib/careers/copy.ts`, one existing seed
script (`scripts/seed-taxonomy.ts`) for the idempotent pattern, `src/db/queries/careers.ts`,
and `prompts/_handoff.md`.

Branch: `claude/pr-63-career-copy` off latest `main` (must contain PR-59).

## Build exactly this

1. `data/editorial/careers/_index.md`: the 40 careers with the most published offerings. Get
   the list from the database if `DATABASE_URL` is set; otherwise from the CONES fixture rows
   in the repo, and say which in the file.
2. One `data/editorial/careers/<career-slug>.md` per career, 180–260 words, Paraguayan Spanish
   in voseo, about **that** career: what it is, what the study is like, what kinds of work it
   leads to, what to check before choosing it (modalidad, sede, acreditación — as things to
   check, never as facts about specific programmes). A reader must be able to tell which career
   the text is about with the title hidden.
3. Hard limits, enforced by a test that scans every file: **no digit anywhere** (write
   "cinco años" nowhere either — no durations, prices, counts, salaries, percentages, years),
   no institution name from the taxonomy or fixtures, no "acreditad*" claim about a programme,
   no ranking words ("mejor", "top", "líder").
4. `scripts/seed-editorial.ts` + `"seed:editorial"` in `package.json`: reads the folder,
   writes `careers.description_md` **only where null**, prints written/skipped counts,
   idempotent. Query through `src/db/queries/` only. Document it in `CLAUDE.md`'s command
   list and `docs/seo.md` §4.1 (one sentence: how the copy arrives).
5. Fan-out is allowed: write the exemplar and the test first, then produce the remaining
   files with parallel Sonnet subagents, then run the scan once.

## Rules

- Fabrication is the only thing that fails this PR. When unsure whether a sentence is a fact,
  delete it.
- Do not touch the page components, metadata, or the 150-word gate.
- Run `npm run lint && npm test && npm run build` before opening the PR.

## Exit

Every "Accept" line of the PR-63 entry with its proof. Open the PR, do **not** merge; the
review session merges after the fabrication scan. Closing report per `_handoff.md`.
