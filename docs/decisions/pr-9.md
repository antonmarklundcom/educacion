# Decisions moved from `docs/pr-plan.md` — PR-09

## PR entry

### PR-09 — `/carreras` table view + comparador (Dirección 4) · **Opus**
View toggle sharing one filter state, dense sortable table, checkbox multi-select (max 4), sticky compare bar, `/comparar` page with difference highlighting, `localStorage` + URL sync, share-to-WhatsApp with a per-comparison OG image.
**Deps:** PR-08.
**Accept:** selection survives switching views and navigating to a detail page and back; `/comparar?ids=…` renders server-side and previews correctly when pasted into WhatsApp; `noindex` on `/comparar`; max-4 enforced with a clear message.
