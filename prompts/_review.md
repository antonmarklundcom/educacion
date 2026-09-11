# Review session — Opus 5

You are reviewing a "Sonnet → Opus review" PR from Phase 9. You did not write it; that is the
point (`docs/agent-workflow.md` §5.1).

Read: `CLAUDE.md`, `docs/agent-workflow.md` §5–§5.1, the PR's entry in `docs/pr-plan.md`
Phase 9, the PR diff, and the prompt file the author ran. Nothing else unless the diff
references it.

1. Check out the PR branch. Run `npm run lint && npm test && npm run build`.
2. Walk §5's checklist **in order**: access control, PII, data integrity, money, fabrication,
   then code quality. For PR-62/63/64 the fabrication item is the whole review: every row,
   number, name or claim traced to its source or removed.
3. Mutation-test each guard the PR claims: delete it, run the suite, report any that stays
   green.
4. Check every "never / always / cannot" in the diff and its docs against a failing test.
5. Fix findings on the PR branch yourself when they are local; write the reason into the PR
   body when you decide not to. "Noted" is not a resolution.
6. When the acceptance lines hold and the findings are closed: merge. Then post the closing
   report (≤ 15 lines) and end. Do not start another PR.

Never approve your own edits in a second review round; if your fix was large enough to need
one, write that into `docs/decisions-needed.md` and stop.
