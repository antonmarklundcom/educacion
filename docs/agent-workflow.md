# Agent Workflow — Opus 5 / Sonnet 5 split

## 1. The split rule

Not "hard code vs easy code" — **"expensive to reverse vs cheap to reverse"**.

| Opus 5 writes                     | Sonnet 5 writes                      |
| --------------------------------- | ------------------------------------ |
| DB schema & migrations            | Pages, layouts, components           |
| Source matching / ingestion logic | Admin CRUD screens                   |
| Search & facet layer              | Content and editorial surfaces       |
| Comparador state & URL design     | Metadata / JSON-LD wiring            |
| Auth, roles, scoping              | Tests                                |
| Entitlements & billing logic      | Refactors within a decided interface |
| Anything touching PII             | Copy and formatting                  |

**Opus also reviews** (does not write) every PR marked _Sonnet → Opus review_ in `pr-plan.md`: the ones touching data integrity, PII, access control, or money.

**The review is not optional and not self-serve.** PR-23, PR-27 and PR-29 merged carrying
their own admission that the labelled review never happened — PR-27 was reviewed by its own
author. `pr-plan.md` PR-46 pays that debt; the standing rule from here on: a
_Sonnet → Opus review_ PR does not merge until a session **other than its author** has
reviewed it. CI green is not a reviewer, and the author's session is not a second pair of
eyes no matter which model it runs.

Per-PR ownership is assigned in [`pr-plan.md`](pr-plan.md). Result across the 37 shipped PRs: Sonnet wrote 24 (65%), ~80% of the lines; the planned Phases 6–7 keep the same split (see the summary table there).

## 2. Handoff contract

Opus never hands Sonnet a vague task. Every Sonnet PR starts from:

1. **The interface it builds against** — an exported function signature, a table shape, or a component prop type that already exists in `main`.
2. **The mockup or spec section** it must match (`docs/design-system.md` §N, or the prototype HTML).
3. **Acceptance criteria** — copied verbatim from `pr-plan.md`.

If any of those three is missing, the PR is not ready to start. That is the single biggest lever on Sonnet's output quality here.

## 3. Prompt template for a Sonnet PR

```
Read plan.md, docs/architecture.md, docs/design-system.md and docs/pr-plan.md
(the PR-NN entry) before writing code.

Task: PR-NN — <title>
Branch: claude/pr-NN-<slug>

Scope — build exactly this and nothing more:
  <scope from pr-plan.md>

Build against these existing interfaces (do not change them):
  <signatures / types / table names>

Match: docs/design-system.md §<n>  (and the prototype at <path> where relevant)

Acceptance criteria — every box must pass before you open the PR:
  <criteria from pr-plan.md>

Constraints:
  - No SQL outside src/db/queries/
  - No new dependencies without saying why in the PR body
  - Server components by default; a client component needs a one-line justification
  - Accent colour #0d6e86 on primary CTAs only
  - Never fabricate data, ratings, prices or accreditation status
  - Spanish UI copy uses voseo (contactanos, solicitá, compará)

Run `npm run build` and `npm run lint` before opening the PR.
```

## 4. Prompt template for an Opus PR

Same, plus:

```
You own the design of <the interface>. Before implementing:
  1. State the 2-3 viable approaches and the tradeoff in one paragraph each.
  2. Pick one and say why.
  3. Write down the interface other PRs will build against, since PR-XX and PR-YY
     depend on it and must not need to change when this lands.
Then implement.
```

## 5. Review checklist (Opus reviewing Sonnet)

For any _Sonnet → Opus review_ PR, check in this order:

1. **Access control** — does every mutation call `requireRole()`? Is every institution-scoped read filtered by session institution? Try to construct a request that reads another institution's data.
2. **PII** — is consent stored with a version? Is only the minimum collected? Is anything logged that shouldn't be?
3. **Data integrity** — can this write an accreditation status without a source? Can it display a stale price? Does it bypass the importer's code path?
4. **Money** — is the entitlement check server-side? Can a downgraded plan still reach a gated feature?
5. **Fabrication** — scan every string for invented numbers, ratings, counts, dates.
6. Then, and only then, code quality.

### 5.1 A _Sonnet → Opus review_ PR does not merge until somebody else has reviewed it

The rule PR-46 exists to install, because three PRs shipped without it.

**CI green is not a reviewer.** Nor is the session that wrote the code, however
carefully it re-reads its own diff: PR-27 was reviewed by the same session that
wrote it and PR-25 before it, and PR-23 and PR-29 were merged with a paragraph
in `pr-plan.md` saying nobody had looked. What that cost is now measured — the
retro-review found a blocker (paid, unlabelled ranking), a reminder cascade that
mailed three notices for one renewal, a fabricated status written into
`activity_log`, trial subscriptions counted as contracted revenue, and **nine
load-bearing guards whose deletion left the entire suite green** (they are
listed in `pr-plan.md`'s PR-46 entry).

So, for any PR labelled _Sonnet → Opus review_:

1. **A session other than the author reviews it, before it merges.** Fresh
   context, not a re-read: the value is in not already believing the design.
2. It reviews against §5's checklist, **in that order**.
3. It **mutation-tests** the guards the PR claims: delete each one, run the
   suite, and report any that stays green. A guard with no failing test is a
   finding in its own right, whatever the coverage number says.
4. It checks every "never", "cannot", "always" and "guaranteed" in the diff and
   in the docs it touches against a test that fails without it. Prose that
   overstates the code is the defect that recurred most often.
5. The findings are fixed, or written into the PR body as a decision with its
   reason. "Noted" is not a resolution.

The reviewer's own limits are part of the report: what it could not verify from
the build environment (a deployed p95, a live third-party integration) is stated
as unverified rather than assumed, and lands in `deployment.md` as a step for
the operator.

**One session, one checkout.** Two reviewers mutation-testing the same working
tree will restore each other's files and read each other's mutations as their
own — PR-46's reviewers hit exactly that. Run them in parallel only if each has
its own copy of the repository.

## 6. Rules that apply to both models

- **One PR, one concern.** If the PR body needs "and also", split it.
- **Never merge a partially-working feature without a flag.** The half-built Phase-2 is how solo projects die (`risks.md` §R-13).
- **Update the docs in the same PR** when a decision changes. A stale `architecture.md` is worse than none — the next session trusts it.
- **No new dependency** without a line in the PR body justifying it against the "deliberately excluded" list in `architecture.md` §1.
- **Anti-fabrication is absolute** and applies to seed data, test fixtures, placeholder copy and demo screenshots. A fake "4.8 ★ (312 reseñas)" in a component default is how fabrications reach production.
- **Spanish copy is voseo Paraguayan**: `contactanos`, `solicitá`, `compará`, `elegí`, `tenés`. Not `contáctanos`/`solicita`. Currency `Gs. 1.450.000`. Never machine-translate from Swedish or English without a native read.

## 7. Session bootstrap

Any new agent session on this repo starts by reading `CLAUDE.md`, then `plan.md`, then the doc(s) named in its PR entry. It should not need to re-derive the architecture from the code.
