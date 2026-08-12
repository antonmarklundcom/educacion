# Design prototypes

The two source prototypes the visual system is derived from. Both were built in Claude Design
(`.dc.html` — they reference a `support.js` that is not in this repo, so they render as static
markup here; that is fine, they are a reference for layout, spacing, colour and copy, not a
runnable app).

| File                              | Role in the product                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `direccion-1-antagning-fiel.html` | **Vista Tarjetas** — the exploration view. Filter rail + rich result cards. Desktop 1440 + mobile 390.                           |
| `direccion-4-comparador.html`     | **Vista Tabla** — the decision view. Dense sortable table, checkbox multi-select, sticky compare bar. Desktop 1440 + mobile 390. |

Both ship, as two views of one route — see `docs/design-system.md` §1.

**Read `docs/design-system.md` §8 before copying anything from these files.** Six things in the
prototypes are deliberately changed in the real build (accent-colour discipline, competing CTAs,
the favourites/heart feature, the dead "Ver todos los filtros" link, hero height on mobile, and
institution name length in cards).

The sample data inside these files (`raw = [...]`) is **prototype placeholder and must never be
seeded, copied into fixtures, or shipped**. Aranceles like `Gs. 1.450.000/mes` and the
accreditation statuses in them are illustrative, not sourced. See `CLAUDE.md` rule 1.
