# Decisions moved from `docs/pr-plan.md` — PR-05

## PR entry

### PR-05 — Source ingestion: raw layer · **Opus**
`source_records` + `import_runs` writing, fetch helpers with polite rate limiting and a real UA, parsers for the CONES habilitación lists and the ANEAES / datos.gov.py accredited-programs dataset. **Raw capture only — no matching, no writes to curated tables.**
**Deps:** PR-02.
**Accept:** `npm run import:cones` and `npm run import:aneaes` populate `source_records` with checksums; re-running the same source produces zero duplicate rows; an `import_runs` summary prints rows in/new/unchanged.
