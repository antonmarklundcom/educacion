# prompts/ — one file per Phase 9 PR

A build session runs **one** prompt and ends. The prompt says what to read; read nothing else.
Decisions live in `docs/review-2026-09.md`, `docs/domains.md` and `docs/pr-plan.md` Phase 9 —
sessions do not reopen them.

## Order and model

| # | File | PR | Model | Review |
| --- | --- | --- | --- | --- |
| 1 | `opus-1-pr59-modality-sin-datos.md` | PR-59 | **Opus 5** | — |
| 2 | `opus-2-pr61-price-csv-import.md` | PR-61 | **Opus 5** | — |
| 3 | `sonnet-1-pr60-canonical-host.md` | PR-60 | Sonnet 5 | Opus review before merge |
| 4 | `sonnet-2-pr62-aneaes-transcription.md` | PR-62 | Sonnet 5 | Opus review before merge |
| 5 | `sonnet-3-pr63-career-copy.md` | PR-63 | Sonnet 5 | Opus review before merge |
| 6 | `sonnet-4-pr64-accreditation-posts.md` | PR-64 | Sonnet 5 | Opus review before merge |
| 7 | `sonnet-5-pr66-docs-diet.md` | PR-66 | Sonnet 5 | — |

The Opus lane runs first and sequentially. The Sonnet lane starts when PR-61 is merged; its
PRs are independent of each other except PR-64 after PR-63 and PR-66 last.

## How to start a session

Fresh window, the model from the table, permission mode set to auto-accept, and paste:

```
Read prompts/<file>.md in this repo and execute it.
```

## The review lane

A PR marked "Opus review" is opened by its Sonnet session and **not merged by it**. The
reviewer is a separate Opus 5 session started with:

```
Read prompts/_review.md in this repo and review PR #<n> (PR-NN).
```

The reviewer merges when its findings are fixed. `agent-workflow.md` §5.1 is the standard.

## Handoff between sessions

`_handoff.md`. A session that finishes an Opus-lane PR may start the next Opus-lane session
itself (`create_session`, model set explicitly to Opus 5, prompt exactly the line above). If
that tool is unavailable, it ends with the closing report and Anton pastes the next prompt.
Nobody messages a running session; a change of plan is an edit to the prompt file on `main`.

## Cost

Fable is never a build, review, watcher or spawned session for this repo. If a session
believes a decision needs Fable, it appends the question to `docs/decisions-needed.md`, pushes,
and ends. Anton opens a Fable conversation himself if he agrees.
