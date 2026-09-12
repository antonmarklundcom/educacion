# Decisions moved from `docs/pr-plan.md` — PR-08

## PR entry

### PR-08 — `/carreras` browser, card view (Dirección 1) · **Sonnet**
Filter rail, result cards, header/count/sort bar, pagination, empty state, mobile filter sheet. URL-driven state. Server components except the mobile sheet.
**Deps:** PR-07, PR-03.
**Accept:** faithful to the Dirección 1 mockup at 1440 and 390; filters survive reload and back-button; no client-side data fetching; JS ≤ 150 kb gz.
