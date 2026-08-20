/**
 * The total cost of a career — matrícula + cuotas + derecho de examen composed
 * over its duration (PR-48).
 *
 * The question every family actually asks is not "how much is the cuota", it
 * is "how much does this carrera cost me". Both numbers are already in
 * `prices`; nobody had ever added them up.
 *
 * ### Pure arithmetic over verified rows, and nothing else
 *
 * No new data is collected and nothing is estimated. Every input is a column
 * an operator verified, and the only operations are multiplication and
 * addition of integers.
 *
 * ### Server-only, because the annual figure has one definition
 *
 * The per-year half is `computeAnnualCost()` from `@/db/invariants` — not a
 * fourth copy of `matricula + cuota × cuotas_por_año`. `data-model.md` says the
 * generated `annual_cost` column and `computeAnnualCost()` "must stay in
 * lockstep"; adding a third implementation here is how that stops being true,
 * so this module calls the second one instead of restating it. That import
 * pulls the schema module in, which is why `client-bundle.test.ts` holds this
 * file behind the server boundary.
 *
 * ### Matrícula is an annual charge
 *
 * Not this module's invention — `data-model.md` defines the canonical annual
 * figure as `matricula + monthly_fee × installments_per_year`. A total that
 * treated matrícula as a one-off would disagree with the number the comparador
 * already sorts on. So the total is `annual × years + derecho de examen`, and
 * the exam fee is the one-off.
 *
 * ### Why a fractional year is a gap
 *
 * A 30-month carrera bills either three matrículas or two and a half, and the
 * data does not say which. That is a gap in **our billing model**, not in the
 * institution's data, and the copy says so in as many words rather than
 * telling a reader something is missing that is not.
 *
 * ### Every component or no number at all
 *
 * `pr-plan.md` PR-48: *a total renders only when every component amount exists*.
 * A missing derecho de examen is unknown, not zero (`data-model.md`: NULL means
 * _sin datos_, 0 means _gratuita_) — so it produces a partial that names the
 * gap and shows **no figure**. Not a floor, not a "desde": a lower bound reads
 * as a total to anyone skimming, and this is the number families budget
 * against.
 *
 * ### The CHECKs `program_search` does not carry are mirrored here
 *
 * `prices` constrains `is_free` against the fee columns and `installments_per_year`
 * to 1–24. `program_search` is a denormalized copy with neither CHECK, and this
 * module reads that copy, so both are re-asserted before the arithmetic runs.
 * `computeAnnualCost` itself is deliberately **not** the place for them: it is
 * documented and tested as an exact mirror of the `annual_cost` STORED GENERATED
 * column, a column that cannot refuse a value its table's CHECK already rejects.
 * A guard added to the TypeScript copy alone would break the lockstep that is
 * that function's entire reason to exist, and would make the two disagree on
 * rows the database can hold. The guard belongs at the boundary where
 * unconstrained data enters, which is here (PR-48b; `architecture.md` §31.8).
 *
 * Staleness is carried, never used to hide (CLAUDE.md rule 3, PR-33): a stale
 * arancel still totals, and `freshness` travels with the result so the block
 * and the comparador cell can put the warning on the total itself.
 */

import { computeAnnualCost } from '@/db/invariants';
import type { Currency, PriceFreshness, PriceSummary } from '@/lib/search';

/**
 * What stops a total being composable.
 *
 * `duracion_parcial`, `incoherente` and `cuotas_invalidas` are **not** absent
 * data — they are cases where the numbers we hold do not determine a total.
 * They are reported separately for that reason; see `total-cost-display.ts`.
 */
export type TotalCostGap =
  | 'arancel'
  | 'matricula'
  | 'cuota'
  | 'cuotas_por_ano'
  | 'cuotas_invalidas'
  | 'derecho_examen'
  | 'duracion'
  | 'duracion_parcial'
  | 'incoherente';

export interface TotalCost {
  /** `complete` carries a number; `partial` never does. */
  kind: 'complete' | 'partial';
  /** Integer, in `currency`. Null on every partial. */
  total: number | null;
  currency: Currency | null;
  /** The carrera's length in whole years. Null when the duration is unusable. */
  years: number | null;
  /** How many cuotas are paid across the whole carrera. */
  installments: number | null;
  /** `matricula + cuota × cuotas/año` — the figure the comparador sorts on. */
  annualCost: number | null;
  /** Charged once, at entry. */
  admissionFee: number | null;
  /** Empty when `kind === 'complete'`. */
  missing: TotalCostGap[];
  /** True when the arancel is free; the cuotas half of the total is then 0. */
  isFree: boolean;
  freshness: PriceFreshness;
  verifiedAt: Date | null;
}

/**
 * The canonical order of the gaps. `TotalCost.missing` is always sorted into
 * it, so two rows missing the same things list them in the same order.
 *
 * It orders the gaps **within** each of the two clause groups
 * `partialLabel()` builds, and nothing more: absent data is always worded
 * before the undetermined cases whatever this list says, because that split is
 * made in `total-cost-display.ts`. `incoherente` leading here buys determinism,
 * not primacy — the claim that this is "the order the reader hears about it"
 * was more than the constant controls (PR-48b).
 */
const GAP_ORDER: readonly TotalCostGap[] = [
  'incoherente',
  'cuotas_invalidas',
  'arancel',
  'matricula',
  'cuota',
  'cuotas_por_ano',
  'derecho_examen',
  'duracion',
  'duracion_parcial',
];

function partial(price: PriceSummary, missing: TotalCostGap[], years: number | null): TotalCost {
  return {
    kind: 'partial',
    total: null,
    currency: price.currency,
    years,
    installments: null,
    annualCost: null,
    admissionFee: price.admissionFee,
    missing: GAP_ORDER.filter((gap) => missing.includes(gap)),
    isFree: price.isFree,
    freshness: price.freshness,
    verifiedAt: price.verifiedAt,
  };
}

/**
 * Composes the total, or says exactly what stops it being composable.
 *
 * `durationMonths` comes from the offering, not from the price row, which is
 * why it is a separate argument rather than something this module can look up.
 */
export function totalCost(price: PriceSummary, durationMonths: number | null): TotalCost {
  const missing: TotalCostGap[] = [];

  let years: number | null = null;
  if (durationMonths == null || durationMonths <= 0) {
    // Zero is not a duration. `offerings.duration_months` has a CHECK for it;
    // `program_search.duration_months` does not, and this module reads the
    // denormalized table.
    missing.push('duracion');
  } else if (durationMonths % 12 !== 0) {
    missing.push('duracion_parcial');
  } else {
    years = durationMonths / 12;
  }

  if (!price.hasAmount || price.currency == null) {
    // A currency-less row with amounts is representable in `program_search`
    // (`price_currency` is nullable and `matricula_gs` is written
    // independently), and a total whose units we cannot name is not a total.
    missing.push('arancel');
    return partial(price, missing, years);
  }

  // `prices_installments_range` (1–24) is the second CHECK `program_search`
  // does not carry, and the one that costs money: `computeAnnualCost` multiplies
  // by `coalesce(installments_per_year, 0)`, so a 0 does not fail — it deletes
  // every cuota and returns the bare matrícula. The total then renders as
  // `complete`, with no gap and no warning, and can win the cheapest marker
  // while being an order of magnitude below the real figure. Mirrored here for
  // the same reason `prices_free_has_no_fees` is, and before the free branch
  // because the value is impossible whatever `is_free` says.
  const installments = price.installmentsPerYear;
  if (
    installments != null &&
    (!Number.isInteger(installments) || installments < 1 || installments > 24)
  ) {
    missing.push('cuotas_invalidas');
  }

  if (price.isFree) {
    // `prices_free_has_no_fees` forbids this on the `prices` table, but this
    // module reads `program_search`, which carries no such CHECK. Rather than
    // trust the flag and silently drop a fee that is sitting right there, an
    // incoherent row is reported as one.
    if (price.matricula != null || price.monthlyFee != null) missing.push('incoherente');
  } else {
    if (price.matricula == null) missing.push('matricula');
    if (price.monthlyFee == null) missing.push('cuota');
    if (price.monthlyFee != null && price.installmentsPerYear == null) {
      missing.push('cuotas_por_ano');
    }
  }
  if (price.admissionFee == null) missing.push('derecho_examen');

  if (missing.length > 0 || years == null) return partial(price, missing, years);

  const annualCost = computeAnnualCost(price);
  // Unreachable: every input `computeAnnualCost` refuses has already been
  // pushed onto `missing` above. Asserted rather than assumed, because a
  // silent `null` here would become `NaN` in the total.
  if (annualCost == null) return partial(price, ['arancel'], years);

  return {
    kind: 'complete',
    total: annualCost * years + price.admissionFee!,
    currency: price.currency,
    years,
    installments: price.isFree ? 0 : price.installmentsPerYear! * years,
    annualCost,
    admissionFee: price.admissionFee,
    missing: [],
    isFree: price.isFree,
    freshness: price.freshness,
    verifiedAt: price.verifiedAt,
  };
}

/**
 * Ordering for the comparador: cheapest first, **incomplete last**.
 *
 * Currencies are never compared against each other — `data-model.md` says a
 * USD row sorts after the guaraní ones rather than being converted at a rate
 * we would have to defend. Ties compare equal, so a stable sort keeps the
 * column order the URL asked for.
 */
export function compareTotalCost(a: TotalCost, b: TotalCost): number {
  const rank = (t: TotalCost) => (t.kind === 'partial' ? 2 : t.currency === 'USD' ? 1 : 0);
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  if (a.kind === 'partial' || b.kind === 'partial') return 0;
  return a.total! - b.total!;
}

/**
 * The single cheapest column, or `null` when there is no honest winner —
 * fewer than two complete totals, a tie, or totals in more than one currency.
 * Marking a "cheapest" across currencies would be the FX claim rule 1 bans.
 *
 * Built on `compareTotalCost` so the ordering has one definition rather than
 * two that agree by inspection.
 */
export function cheapestTotalIndex(totals: readonly TotalCost[]): number | null {
  const complete = totals
    .map((total, index) => ({ total, index }))
    .filter((entry) => entry.total.kind === 'complete');

  if (complete.length < 2) return null;
  if (new Set(complete.map((entry) => entry.total.currency)).size > 1) return null;

  const [best, runnerUp] = [...complete].sort((a, b) => compareTotalCost(a.total, b.total));
  return compareTotalCost(best!.total, runnerUp!.total) < 0 ? best!.index : null;
}
