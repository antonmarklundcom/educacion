# Decisions moved from `docs/pr-plan.md` — PR-48b

## PR entry

### PR-48b — the second review pass on PR-48 · **Opus**
PR-48's second review landed after it merged, so its findings are a follow-up PR rather than
more commits on the same branch. Four defects, one of them money — and then PR-48b's own
independent review found seven more, which is the reason this entry is longer than the one
above it.

1. **`installments_per_year = 0` produced a complete total with every cuota deleted.**
   Gs. 22.650.000 rendered as Gs. 2.650.000 — no gap, no warning, eligible for "el más
   barato". `computeAnnualCost` multiplies by `coalesce(installments_per_year, 0)`, so a 0
   does not fail; it deletes the cuotas.
2. **Rule 3, in the branch PR-48 did not fix.** The comparador's arancel cell warned
   properly when it had a date and emitted only "Sin fecha de verificación" when it did
   not — a price shown with no warning at all.
3. **The PR-48 doc sweep was under-scoped**, including on `/legal/fuentes`, where the page
   contradicted itself paragraph to paragraph.
4. **PR-48's own per-option fix was untested**: deleting the per-sede total from
   `OfferingsBlock`, or the sede-name gate in the programme page, left all 1212 tests green.

**What the independent review then found, all fixed here:**

5. **The same defect class, twice more.** `prices` has **three** CHECKs, not two:
   `prices_non_negative` was not mirrored either, so a negative matrícula subtracted from
   the total exactly as silently (Gs. 17.650.000 for the same carrera). And
   `catalog-schema.ts` is a **second** boundary reading the same unconstrained copy — an
   `installments_per_year` of 0 published a Gs. 2.650.000 `Offer` to Google. There is now
   one statement of the rules, `priceCheckViolations()`, which `assertPriceIsCoherent`,
   `total-cost.ts` and `catalog-schema.ts` all read, so a fourth constraint cannot be
   missed by three modules independently.
6. **Rule 3 was still broken on both OG images** — the surface with the *least* context
   around it, read in a WhatsApp preview with no page attached. Same "Dato de mayo de 2026"
   string the PR had just removed from `PriceLabel`, duplicated in two route files.
7. **`PriceLabel` had no test**, and deleting its badge outright left 1231 green: the price
   on every result card, both table layouts, `RelatedPrograms` and `OfferingsBlock`. Now
   `PriceLabel.test.ts`.
8. **The área/ciudad intro printed a price range with no warning.** PR-48b removed the
   false clause ("con datos verificados en el último año") and put nothing in its place, so
   a range built from a 2024 price rendered bare. Rule 3 does not exempt prose.
9. **`/panel`'s replacement copy was false in the more dangerous direction** — it told an
   institution its *unpublished* prices were live on the site, and called never-verified
   rows "con más de 12 meses". The stat counts both; the copy says so now.
10. **§31.8 claimed `computeAnnualCost` has three callers.** It has one. The decision it
    justified is right and stands — the function is a mirror of a generated column and must
    not refuse what the column cannot — but the invented count is what made finding 5's
    `catalog-schema.ts` exposure invisible to the author.
11. **Seven more survivors of the hide rule**, including `architecture.md`'s "Two price
    predicates, deliberately" — which named `isPriceDisplayable()`, a function PR-33 deleted
    and that exists nowhere in the repo, and cited a `row.test.ts` assertion that does not
    exist. The dead `today` parameter that paragraph described is removed with it.

Smaller, all applied: the `computeAnnualCost` agreement test was a tautology (both sides
were the same call) and now asserts against literals; the comparador's "N de M datos
difieren" counted a differing arancel twice by counting its total as a second datum, so
derived rows no longer vote; `cuotas_por_ano`'s gap copy was a clause, making "sin datos de
matrícula y cuántas cuotas se pagan por año"; `GAP_ORDER`'s comment claimed an ordering it
does not control; three comments described files or pipelines inaccurately
(`TotalCostBlock.tsx` naming a `.tsx` test that is `.ts`, `TotalCostBlock.test.ts` calling
the transform pipeline unchanged when the PR added the `oxc` JSX line, `vitest.config.mts`
saying it matches `tsconfig.json` when tsconfig sets `jsx: preserve`); `withDisplayablePrice`
in the rebuild summary counts fresh prices and is named for it; and `eslint.config.mjs`
ignores `.claude/worktrees`, without which a reviewer's scratch checkout makes `npm run
lint` report 1234 errors that are not ours.

**One rule-1 fix taken in passing**, because it is the same surface and one conditional:
`/panel/ofertas/[id]` printed `formatMonthYear(price.verifiedAt ?? new Date())` — *today's*
month, presented to the institution as the date it last verified a price that has no date
at all. It now says it has none.

And `architecture.md` §31.7 no longer implies more than `renderToStaticMarkup` proves: a
substring in one component's HTML, in PYG, with no RSC pipeline exercised and nothing said
about visibility, since CSS is not applied. §31.8 is new and states the rule the whole
entry is about — **a module reading `program_search` re-asserts the constraints of the
table it was copied from**, because "the source table has a CHECK" is not a property of the
copy.

**Deps:** PR-48 (merged).
**Accept:** an impossible or negative amount never reaches the arithmetic, never renders a
figure and never reaches JSON-LD; no price renders anywhere without rule 3's words once it
is stale — cards, table, comparador, programme page, per-sede list, área/ciudad prose and
both OG images; every guard above has a test that goes red when the guard is removed; no
statement of the pre-PR-33 hide rule survives in `src/` or `docs/`.
