# Design System

Derived from the two prototypes (`Dirección 1 — Antagning fiel`, `Dirección 4 — Comparador`) and reconciled against the `conversion-design` rules.

## 1. The core decision: both mockups ship

They are not competing designs — they are two views of one dataset, for two different moments in the student's journey.

|         | **Vista Tarjetas** (Dirección 1)            | **Vista Tabla** (Dirección 4)      |
| ------- | ------------------------------------------- | ---------------------------------- |
| Moment  | Exploration — "no sé qué estudiar"          | Decision — "tengo 5 opciones"      |
| Density | ~6 results per screen, rich                 | ~15 rows per screen, scannable     |
| Actions | Favorito, Ver más, WhatsApp, Solicitar info | Multi-select → comparar            |
| Mobile  | Cards, stacked                              | Compact cards with a 2×2 data grid |

**Implementation:** one route `/carreras`, one filter state, one query, a toggle (`?vista=tarjetas|tabla`, default `tarjetas`). Comparador selection persists across both.

This is also the marketing story: _"buscá como querés, compará como necesitás."_

## 2. Tokens

Reconciled from the two prototypes into one palette. Dirección 1's teal is the accent (warmer and more distinctive than D4's generic blue); D4's slate neutrals are the text scale (better contrast discipline).

```
--color-accent          #0d6e86   /* PRIMARY CTA ONLY */
--color-accent-hover    #0a5e74
--color-accent-subtle   #e6f0f3   /* badge backgrounds only, never a CTA */

--color-ink             #0f172a   /* headings */
--color-body            #334155   /* body text */
--color-muted           #64748b   /* secondary */
--color-faint           #94a3b8   /* meta, placeholders */

--color-surface         #ffffff
--color-canvas          #f2f4f6   /* page background */
--color-card-alt        #f8fafc   /* zebra rows, filter rail */
--color-border          #e4e8ec
--color-border-strong   #cdd4dc

/* semantic — status only, never decorative */
--color-ok              #15803d   /* acreditada, gratuita, inscripciones abiertas */
--color-ok-bg           #e7f4ec
--color-warn            #b45309   /* en proceso, próximamente */
--color-warn-bg         #fbf0e0
--color-info            #4338ca   /* habilitada CONES */
--color-info-bg         #eaeefb
--color-danger          #b3261e   /* cerradas */
--color-neutral-bg      #f1f4f8   /* sin datos */
```

**The accent rule is absolute:** `#0d6e86` appears only on primary CTAs ("Solicitar info", "Buscar carreras", "Comparar N carreras"). Sort links, active filters and focus rings use `--color-ink` with weight/underline, not the accent. In the D4 prototype the sortable column headers were accent-blue — that must change.

## 3. Type

- **IBM Plex Sans** — everything. 400 / 500 / 600 / 700.
- **IBM Plex Mono** — 500 / 600, **numeric columns only**: arancel, duración, resolution numbers. This is the single best detail in the Dirección 4 prototype: monospace numbers make a comparison table scannable. Keep it.
- Self-hosted via `next/font`, `display: swap`. Two families, six weights total — at the limit, no more.

Scale (1.25 ratio): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 49. Body 16px, line-height 1.6, max 70ch. Top two sizes via `clamp()`.

Spacing: 8px grid — 8 / 16 / 24 / 32 / 48 / 64 / 96.

## 4. Status badge vocabulary (fixed — do not invent variants)

| Meaning                      | Label                          | Colour                                      |
| ---------------------------- | ------------------------------ | ------------------------------------------- |
| ANEAES accredited, valid     | `✓ Acreditada ANEAES`          | ok                                          |
| Accreditation in process     | `En proceso de acreditación`   | warn                                        |
| CONES-habilitated only       | `Habilitada CONES`             | info                                        |
| No accreditation data        | `Sin datos de acreditación`    | neutral                                     |
| Enrolment open               | `Inscripciones abiertas` + dot | ok                                          |
| Coming soon                  | `Próximamente` + dot           | warn                                        |
| Closed                       | `Inscripciones cerradas` + dot | danger                                      |
| Free (public)                | `Gratuita`                     | ok                                          |
| Institution-verified profile | `Perfil verificado`            | accent-subtle bg, ink text                  |
| Paid placement               | `Destacado`                    | neutral bg, muted text — deliberately quiet |

Every accreditation badge is a link to its source. **"Sin datos" is the default for unknown — never "No acreditada".** See `risks.md` §R-09.

## 5. Component inventory

**Primitives** (PR-03): Button (primary/secondary/ghost, 48px min height, full-width on mobile), Badge, Chip, Card, Checkbox (custom, from the prototypes), Select, Input, SearchInput, RangeSlider, Skeleton, Pagination, Tooltip.

**Domain** (PR-08/09/10): `FilterRail` / `FilterSheet` (mobile), `ResultCard`, `ResultRow`, `ViewToggle`, `SortControl`, `CompareBar` (sticky), `CompareTable`, `AccreditationBadge`, `PriceBlock` (handles the staleness rule), `AdmissionCalendar`, `InstitutionMonogram` (the coloured 2–4 letter square from both prototypes — brand colour comes from `institutions.brand_color`), `LeadModal`, `WhatsAppButton`.

## 6. Motion (the complete list)

- 150–250 ms `ease-out` on button/card hover and active states.
- One fade-up-on-scroll reveal, homepage only.
- `scale(1.01)` row hover in the table view.
- Nothing else. No carousels, no parallax, no scroll-hijacking, no custom cursors, no preloader.
- `prefers-reduced-motion: reduce` disables all of it.

## 7. Mobile rules (390px is the design target)

- Filters live in a bottom sheet behind a `Filtrar (N)` chip — never a collapsed sidebar.
- Result cards: title, status dot, institution, three badges max, then a full-width primary CTA plus a WhatsApp icon button. Exactly the Dirección 1 mobile prototype.
- Table view on mobile becomes the D4 compact card: header row + a 2×2 grid of Gestión / Duración / Arancel / Acreditación. Never a horizontally scrolling table.
- Compare bar is fixed to the bottom, above the safe area, showing count + "Comparar →".
- Sticky WhatsApp affordance on program detail pages only — not on listing pages, where it would compete with the compare bar.

## 8. Things in the prototypes to change

1. **Accent discipline** — D4 used accent blue on sortable headers and the "Solicitar" outline buttons. Move those to ink/neutral so the accent means one thing.
2. **Two competing CTAs** on the D1 card ("Solicitar info" + WhatsApp) — keep both, but WhatsApp becomes a secondary style (outline/green icon), not a peer.
3. **The heart/favourites feature** implies accounts. Phase 1 has no student accounts: store favourites in `localStorage`, no login prompt. Revisit only if usage justifies it.
4. **"Ver todos los filtros →"** in D1 needs a real destination — either it opens the full filter sheet or it goes. No dead links.
5. **Hero** — D1's hero is 54px of gradient before any content. On mobile, compress hard: the search field must be reachable without scrolling at 390px.
6. **Institution names** — D1's cards show the full official name (`Universidad Católica "Ntra. Sra. de la Asunción" (UC)`), which wraps badly. Use `name_short` in cards and tables, `name_official` on detail pages.

## 9. What PR-08 settled (the card view)

The rail and the cards survived implementation with four decisions worth not rediscovering.

**Every filter control is a link, not a form control.** A facet option is an `<a>` to the same route with one value toggled in the query string. Filter state is already the URL (`architecture.md` §3), so the honest HTML for "change the filter state" is navigation. It works without JavaScript, the back button is correct for free, and `/carreras` ships one client component instead of a filter runtime. The checkbox look is cosmetic; the semantics are a link, so selection is exposed as `aria-current` plus an sr-only "(aplicar/quitar filtro)", never `aria-pressed` — which is invalid on a link.

**The arancel slider became a numeric range.** A slider cannot report a value without JavaScript, and the value it reports is approximate. Two number inputs inside a plain GET form are exact, JS-free, and shareable. The prototype's slider does not come back. The bounds are labelled **"Arancel anual"** because that is what `annualCostMin/Max` filter on — labelling an annual bound "mensual" would be a wrong number wearing a right one's clothes.

**Sort is a `<details>` disclosure of links**, not a `<select>`: a select needs script to navigate on change, and a sort choice deserves a URL. Wording lives in `SORT_LABELS` (`src/lib/search/labels.ts`) so the card view and the table view cannot paraphrase each other.

**Two prototype controls are deliberately absent from the card until their backend exists.** "Solicitar info" is the lead modal (PR-14) and the WhatsApp button needs `institutions.whatsapp`, which is not on `OfferingSummary`. A control that does nothing is worse than no control (§8.4), so the card has one primary CTA — the program page — and gains the other two in PR-14. The favourites heart stays out of Phase 1 for the same reason it is flagged in §8.3: it would be the only client state on the page.

**Empty states distinguish two situations and must keep doing so.** "No results for these filters" and "the index has nothing in it yet" are different facts. The second says so plainly and is never softened with sample rows (CLAUDE.md rule 1).

## 10. What PR-09 settled (the table view and the comparador)

**Sortable headers are ink, not accent** — §8.1 called this out and it is now enforced: a column header cycles through the sort keys it owns (`Arancel` → asc → desc) as a link, and carries no accent. The only accent on `/carreras` is "Buscar carreras" and "Comparar N carreras".

**The mobile table view is the D4 compact card**, not a horizontally scrolling table (§7): a header row plus a 2×2 grid of Gestión / Duración / Arancel / Acreditación. The comparador page goes further and stacks by attribute on mobile — one block per attribute, one line per program — which is what makes four compared programs readable at 390px.

**Difference highlighting is the point of the comparison.** Rows whose columns agree are dimmed; rows that differ are ink and medium weight. Honest gaps are dimmed _and_ say "Sin datos": an empty cell reads as "free" or "none", and both would be a claim.

**The per-row "Solicitar" button is not in the table** for the same reason it is not on the card — the lead modal is PR-14, and a control that does nothing is worse than no control.

**Sharing is `wa.me` with no phone number**, which opens the sender's own contact picker. No institution number is involved, so nothing is invented, and the WhatsApp button keeps the secondary style §8.2 requires.

## 11. What PR-10 settled (the program detail page)

**One route, several rows.** `/universidades/[inst]/[program]` is one program, but a program is offered at several sedes and in several turnos, and each of those is its own row with its own arancel and its own convocatoria. The page shows the program once and lists its offerings in a "Sedes y turnos" block. Collapsing to the first row would quietly hide a cheaper sede or an open convocatoria.

**The arancel block explains the gap instead of hiding it.** When the 12-month rule has stripped the amounts, `verifiedAt` survives and the block says _"El último dato que verificamos es de {mes año}. No lo mostramos porque tiene más de 12 meses."_ That is honest provenance — it tells the student the number they may find elsewhere is stale — and it is the reason `PriceSummary` keeps `verifiedAt` on a non-displayable price.

**The accreditation block explains what the status means**, in four different ways for four different statuses, and it says out loud that a CONES _habilitación_ is not an ANEAES _acreditación_. `sin_datos` reads "No encontramos un registro… Eso no significa que no esté acreditado: significa que no lo pudimos verificar." Never "no acreditada" (risks.md §R-09).

**The map link is a search, not a pin.** We do not store coordinates, and dropping a marker somewhere plausible would be inventing a location for a real building. "Buscar la sede en el mapa" opens a Google Maps _search_ for the sede's name and city.

**Fields with no value say so and stay visible.** "Plan de estudio — sin datos publicados" and "Título que otorga — sin datos publicados" are rendered, not omitted: a missing título is exactly the fact a student needs to know we could not verify, and a hidden row reads as "not applicable".

**The hero's primary CTA is "Comparar con otras universidades"** — it pre-selects this program in the comparador and lands on the table view scoped to the same carrera. It is a real action built on shipped machinery. "Solicitar info" and the WhatsApp CTA belong to PR-14, which owns the lead pipeline; the hero already has the slot laid out for them.

## 12. What PR-11 settled (the institution pages)

**Institutions with no published carreras are listed, not hidden.** They are in the CONES register; dropping them would make the register look smaller than it is. The card says "Todavía no cargamos las carreras de esta institución" and shows a zero.

**The directory groups by tipo de institución, which is a property of the row** — universidad, instituto superior, instituto técnico, IFD. It is not a ranking, and there is no "top" anything: we have no ratings, no student numbers and no basis for an order beyond the alphabet.

**"Inline filters" on a profile is the same `FilterRail`, pointed at the route.** Because `institutionSlug` is part of the query, the facet counts arrive already scoped to that institution — no scoped variant of the search semantics exists, and none should. The `institucion=` param never appears in a link the page builds, since the path already scopes it.

**The contact block renders only what we have.** A missing website is omitted, never guessed from the slug — plenty of institutions have none, and a fabricated URL is a broken promise on the page that is meant to be the reliable one. With nothing at all it says so, and always invites a correction.

**The accreditation summary is a ratio over what we published, worded as such.** "De las N carreras que publicamos, M tienen una acreditación de la ANEAES vigente según las fuentes que pudimos verificar." A zero reads "No encontramos… Eso no significa que no las tenga", never "no está acreditada".

## 13. What PR-14 settled (the lead CTAs)

**The result card's CTA row is now three controls, and the accent moved.** "Solicitar info" is the primary — the card exists to produce a lead — "Ver carrera" drops to the secondary outline it should always have been, and the WhatsApp icon button sits beside them as an outline with a green glyph, never as a peer of the accent (§8.2). At 390px the two text buttons split the row and the WhatsApp button is a 48px square, which is the Dirección 1 mobile prototype (§7).

**The program detail hero's primary CTA is "Solicitar info".** §11 recorded "Comparar con otras universidades" holding the slot because the lead form did not exist; it does now, so comparar becomes a secondary alongside WhatsApp. All three are above the fold at 390px.

**The table view still has no per-row "Solicitar".** §10 gave the reason as "PR-14 has not shipped", which is no longer true — but §1 has the real one: the table's moment is decision and its action is multi-select → comparar. A lead button on fifteen dense rows competes with the compare checkboxes and buys nothing the card view does not already offer.

**A WhatsApp button with no number renders nothing.** `institutions.whatsapp_e164` is absent for most rows until the data is collected, and there is no fallback to the landline: a plausible-looking wrong number under a CTA sends a student to a stranger. This is the same rule as §12's contact block, applied to an action instead of a fact.

**The consent checkbox is unchecked, required, and names the institution in its label.** Declaring `menor_18` reveals a second line about parent/guardian awareness rather than blocking the form (`risks.md` §R-06). The modal collects nombre, teléfono, email, mensaje and an age bracket — nothing else, ever.

**The institution profile's contact block is unchanged.** Its WhatsApp row is a contact _detail_ in a definition list, not a CTA, and it is not program-scoped, so a per-program prefill would be a lie about what the student is asking about.
