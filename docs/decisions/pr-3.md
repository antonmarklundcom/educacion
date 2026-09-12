# Decisions moved from `docs/pr-plan.md` — PR-03

## PR entry

### PR-03 — Design system primitives · **Sonnet**
Tailwind theme (tokens from `docs/design-system.md`), fonts via `next/font` (IBM Plex Sans + Mono), and primitives: `Button`, `Badge`, `Chip`, `Card`, `Checkbox`, `Select`, `Input`, `RangeSlider`, `Tag`, `Skeleton`, `Pagination`. Accent `#0d6e86` restricted to primary CTAs.
**Deps:** PR-01.
**Accept:** a `/kitchen-sink` dev-only route renders every primitive in every state; contrast ≥ 4.5:1 on all text; `prefers-reduced-motion` respected; no component imports a font or colour outside the tokens.
