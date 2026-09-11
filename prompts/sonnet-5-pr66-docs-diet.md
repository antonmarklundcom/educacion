# PR-66 — Docs diet. Sonnet 5 session. Lane 2, last; only after PR-59–64 are merged.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-66", `docs/review-2026-09.md` §3
F-7, and `prompts/_handoff.md`. Then the two files you are restructuring.

Branch: `claude/pr-66-docs-diet` off latest `main`.

## Build exactly this

1. For every `## N. <title> (settled in PR-NN)` section of `docs/architecture.md` from §11
   onward: move the section text **verbatim** to `docs/decisions/pr-NN.md` (heading kept;
   if two sections settle the same PR, both go in that file in order). In its place leave
   `## N. <title>` with 3–8 lines of *current state* — what is true now, in present tense —
   and a link to the decision file. Keep §1–§10 as they are.
2. In `docs/pr-plan.md`, shipped Phases 0–8: keep each phase heading and one line per PR
   (`### PR-NN — title · owner · ✅` plus a link to `docs/decisions/pr-NN.md` where one
   exists); move the rest of each entry into that decision file under a `## PR entry`
   heading (create the file if no architecture section produced it). Planned phases untouched.
3. `docs/decisions/README.md`: one table, PR → file → one-line subject.
4. `CLAUDE.md`: table row for `docs/decisions/`; the sentence "Do not re-derive architecture
   from the code" stays.
5. A link check: a small script under `scripts/` (or a vitest case) that resolves every
   relative `.md` link and `#anchor` across `docs/**`, `plan.md`, `CLAUDE.md`, `prompts/**`
   and fails on a dead one. Wire it into `npm test`.

## Rules

- **No wording changes inside moved text.** The reviewable diff is "moved" plus the new
  summaries; `git diff --stat` should make that obvious.
- Nothing deleted. If a section is truly obsolete, it still moves; the summary says
  "superseded by …".
- `docs/architecture.md` ≤ 700 lines afterwards.
- Run `npm run lint && npm test` before opening the PR (`paths-ignore` means CI will skip a
  docs-only PR; the link check is your CI).

## Exit

Every "Accept" line of the PR-66 entry with its proof. Merge when green. Closing report; then
Phase 9 is complete — say so, and point Anton at `docs/launch-runbook.md`'s unticked lines.
