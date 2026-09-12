# Decisions moved from `docs/pr-plan.md` — PR-06

## PR entry

### PR-06 — Entity matching & curation pipeline · **Opus**
`match_key` normalization, `institution_aliases`, career synonym matching, fuzzy proposals, the NEW/UNCHANGED/CHANGED/CONFLICT classifier, and the apply step writing institutions / campuses / programs / offerings / accreditations. Conflicts queue instead of applying.
**Deps:** PR-05.
**Accept:** full import of both sources produces a de-duplicated institution list with no known duplicates; ≥ 60% auto-match rate reported; every conflict lands in the moderation queue; **no accreditation row is written without `source_url` or `resolution_number`** (unit-tested).
