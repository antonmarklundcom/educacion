# educacion.com.py — repo instructions

Read `plan.md` first, then the doc for the area you're touching. Do not re-derive architecture from the code.

| Doc                      | What it holds                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| `plan.md`                | Positioning, phases, timing, the summary of everything              |
| `docs/architecture.md`   | Stack, app shape, rendering, search design, auth, cron              |
| `docs/data-model.md`     | Schema. **Opus owns this.** Sonnet may add columns, not restructure |
| `docs/data-sources.md`   | Ingestion, matching, arancel collection, freshness contract         |
| `docs/monetization.md`   | Plans, pricing, billing ops                                         |
| `docs/seo.md`            | URL map, metadata, schema, the city-page gate                       |
| `docs/design-system.md`  | Tokens, components, badge vocabulary, mobile rules                  |
| `docs/risks.md`          | Every known problem and its mitigation                              |
| `docs/pr-plan.md`        | The 34 PRs, owners, dependencies, acceptance criteria               |
| `docs/agent-workflow.md` | Opus/Sonnet split, prompt templates, review checklist               |
| `docs/deployment.md`     | Hostinger specifics and the gotchas not to rediscover               |

## Non-negotiable rules

1. **Never fabricate data.** No invented aranceles, accreditation statuses, ratings, review counts, student numbers, salaries or employability figures — in the UI, in seed data, in test fixtures, or in placeholder copy. If a fact isn't sourced, show the honest gap.
2. **Accreditation:** unknown renders as `Sin datos de acreditación`, never `No acreditada`. Any positive status requires `source_url` or `resolution_number`.
3. **Prices:** an arancel with `verified_at` older than 12 months is not displayed anywhere — including the comparador, JSON-LD and OG images.
4. **Security is server-side.** Every mutation calls `requireRole()`. Every institution-scoped read is filtered by the session's institution. Hidden buttons are UX, not access control.
5. **No SQL outside `src/db/queries/`.** Components receive plain typed objects.
6. **Server components by default.** A client component needs a one-line justification in the PR body.
7. **Accent `#0d6e86` on primary CTAs only.** Nothing else on the page uses it.
8. **Spanish UI copy is Paraguayan voseo** — `contactanos`, `solicitá`, `compará`, `elegí`, `tenés`. Currency `Gs. 1.450.000`. Repo and docs are in English.
9. **The independence disclaimer** stays in the footer on every page: _"educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES."_
10. **One PR, one concern.** Update the relevant doc in the same PR when a decision changes.

## Commands

```
npm run dev              # local dev
npm run build            # must pass before any PR
npm run lint             # must pass before any PR
npm run db:generate      # drizzle-kit generate
npm run db:migrate       # apply migrations (run from a LOCAL machine)
npm run import:cones     # ingest CONES register  → source_records
npm run import:aneaes    # ingest ANEAES data     → source_records
npm run curate           # match + apply + queue conflicts
npm run search:rebuild   # rebuild program_search
npm run seed:taxonomy    # areas, departamentos, ciudades — idempotent
npm test                 # vitest (invariants, matching, search)
```

`tsx` scripts do not auto-load `.env` — set `DATABASE_URL` in the shell first. See `docs/deployment.md` §5.

## Branches

Development happens on `claude/pr-NN-<slug>` branches; `main` is what Hostinger deploys.
