# Handoff — what "done" is, and what happens after

## Gates (all four, in order)

1. **CI green** on the PR's latest commit (`npm run typecheck`, `lint`, `test`, `build`,
   `perf:budget` — the same steps `.github/workflows/ci.yml` runs; run them locally first,
   CI minutes are budgeted, `CLAUDE.md` rule 11).
2. **Every acceptance line** of the PR's `docs/pr-plan.md` entry checked, in the PR body, with
   the command or test name that proves it.
3. **Docs edited in the same PR** where the entry names them. A decision that changed is
   written where the next session will read it, not in the PR body only.
4. **One adversarial re-read** of your own diff (what would a reviewer reject?), findings fixed
   in one follow-up commit. Not a second round.

Then: a plain PR merges itself when green. A **"Sonnet → Opus review"** PR stops here and ends
its session with the closing report; the reviewer session merges.

## Stopping early

Stop only for: a missing human input the prompt names (the ANEAES PDF, the sources file), or
a bad-foundation question (schema, auth, money) where guessing wrong forces a rewrite. Write
the question to `docs/decisions-needed.md`, commit, push the branch, end. Never wait in the
session for an answer. Everything else: choose, record the choice in the PR body, continue.

## Closing report (last message of the session, ≤ 15 lines)

PR link · what merged or what is waiting for review · acceptance lines and their proof ·
anything left in `docs/decisions-needed.md` · the next prompt file and its model.

## Spawning the next session (Opus lane only)

After PR-59 merges, the session may start PR-61's session: `create_session` with the same
environment, `model` explicitly Opus 5, `prompt` exactly
`Read prompts/opus-2-pr61-price-csv-import.md in this repo and execute it.` Never `plan`
permission mode. After PR-61 merges, spawn nothing — Anton starts the Sonnet lane. If
`create_session` is unavailable, end with the closing report.
