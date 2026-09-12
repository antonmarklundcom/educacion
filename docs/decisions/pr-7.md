# Decisions moved from `docs/pr-plan.md` — PR-07

## PR entry

### PR-07 — Search index & query layer · **Opus**
`program_search` table, `npm run search:rebuild` (transactional truncate+insert), the `searchPrograms(filters) → { results, facets, total }` interface, filter parsing/serialization to and from `searchParams`, facet-count queries, sorting, pagination.
**Deps:** PR-06.
**Accept:** all 8 facet groups return correct counts with cross-filtering semantics; free-text search is accent-insensitive; p95 < 150 ms on the full dataset; the interface is the only export other code may use.
