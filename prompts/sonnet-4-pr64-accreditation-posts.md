# PR-64 — Accreditation hub posts. Sonnet 5 session. Lane 2, after PR-63. Opus review before merge.

Read ONLY: this file, `CLAUDE.md`, `docs/pr-plan.md` → "PR-64", `docs/seo.md` §2 (one page =
one intent) and §8 items 1 and 3, `docs/architecture.md` §20 (editorial), `plan.md` §2,
`scripts/seed-editorial.ts` (from PR-63), `src/db/queries/posts.ts`, and `prompts/_handoff.md`.

**Human input check first:** `data/editorial/sources/acreditacion.md` must exist on `main`
with URLs and quoted sentences. If absent, append one line to `docs/decisions-needed.md`,
commit, push, end. Do not search the web for substitutes.

Branch: `claude/pr-64-accreditation-posts` off latest `main` (must contain PR-63).

## Build exactly this

1. Three posts under `data/editorial/posts/`, front matter `slug`, `title`, `status: draft`,
   `author`, body in voseo:
   - `que-significa-acreditacion-aneaes` — what ANEAES accreditation is vs CONES habilitación.
   - `titulo-carrera-no-acreditada` — what the sources say happens to a title.
   - `como-verificar-acreditacion` — step by step, ending at the checker on `/acreditacion`.
2. Every factual sentence carries a footnote `[n]` that maps to a line in the sources file.
   A test parses each post, extracts footnoted sentences, and fails if any `[n]` has no
   source line or if a sentence containing "ANEAES", "MEC", "CONES", a year or a percentage
   has no footnote.
3. Each post links `/acreditacion` and at least one career hub with descriptive anchor text.
   None uses a hub's transactional phrase ("<carrera> en Paraguay") as a heading or title.
4. Extend `seed:editorial` to seed posts by slug as drafts, only where the slug does not exist.

## Rules

- Nothing the sources file does not say. If the file is thin, the posts are short; length is
  not a criterion, provenance is.
- No number that is not quoted from a source line.
- Run `npm run lint && npm test && npm run build` before opening the PR.

## Exit

Every "Accept" line of the PR-64 entry with its proof. Open the PR, do **not** merge; the
review session merges after tracing every claim. Closing report per `_handoff.md`.
