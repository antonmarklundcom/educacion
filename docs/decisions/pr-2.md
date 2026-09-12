# Decisions moved from `docs/pr-plan.md` — PR-02

## PR entry

### PR-02 — Database schema & migrations · **Opus**
Drizzle config, pooled connection (`connectionLimit: 8`, `timezone: "Z"`), full schema per `docs/data-model.md`, first migration, taxonomy seed (areas, departamentos, ciudades).
**Deps:** PR-01.
**Accept:** migration applies cleanly against Hostinger Remote MySQL from a local machine; seed is idempotent (re-run leaves identical state); all enums, unique keys and indexes from `data-model.md` present.
