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
 * ### Matrícula is an annual charge
 *
 * Not this module's invention — `data-model.md` §prices defines the canonical
 * annual figure as `matricula + monthly_fee × installments_per_year`, and the
 * generated `annual_cost` column and `computeAnnualCost()` both implement it.
 * A total that treated matrícula as a one-off would disagree with the number
 * the comparador already sorts on. So the total is
 * `annual × years + derecho de examen`, and the exam fee is the one-off.
 *
 * ### Why a fractional year is a gap and not a rounding
 *
 * A 30-month carrera bills either three matrículas or two-and-a-half, and the
 * data does not say which. Rather than pick one, a duration that is not a
 * whole number of years is reported as a gap like any other. Careers in the
 * index are overwhelmingly 48, 60 or 72 months, so this is the rare case, and
 * the rare case is exactly where an invented convention would do its damage.
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
 * Staleness is carried, never used to hide (CLAUDE.md rule 3, PR-33): a stale
 * arancel still totals, and `freshness` travels with the result so the block
 * and the comparador cell can put the warning on the total itself.
 */

import type { Currency, PriceFreshness, PriceSummary } from '@/lib/search';

/** What is missing, in the order a reader should hear about it. */
export type TotalCostGap =
  | 'arancel'
  | 'matricula'
  | 'cuota'
  | 'cuotas_por_ano'
  | 'derecho_examen'
  | 'duracion'
  | 'duracion_parcial';

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

const GAP_ORDER: readonly TotalCostGap[] = [
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
 * Composes the total, or says exactly what is missing.
 *
 * `durationMonths` comes from the offering, not from the price row, which is
 * why it is a separate argument rather than something this module can look up.
 */
export function totalCost(price: PriceSummary, durationMonths: number | null): TotalCost {
  const missing: TotalCostGap[] = [];

  let years: number | null = null;
  if (durationMonths == null || durationMonths <= 0) {
    missing.push('duracion');
  } else if (durationMonths % 12 !== 0) {
    missing.push('duracion_parcial');
  } else {
    years = durationMonths / 12;
  }

  if (!price.hasAmount || price.currency == null) {
    missing.push('arancel');
    return partial(price, missing, years);
  }

  // A free arancel has no matrícula and no cuota by construction
  // (`prices_free_has_no_fees`), so there is nothing to be missing on that
  // side — only the derecho de examen can still be unknown.
  if (!price.isFree) {
    if (price.matricula == null) missing.push('matricula');
    if (price.monthlyFee == null) missing.push('cuota');
    if (price.monthlyFee != null && price.installmentsPerYear == null)
      missing.push('cuotas_por_ano');
  }
  if (price.admissionFee == null) missing.push('derecho_examen');

  if (missing.length > 0 || years == null) return partial(price, missing, years);

  const annualCost = price.isFree
    ? 0
    : price.matricula! + price.monthlyFee! * price.installmentsPerYear!;
  const installments = price.isFree ? 0 : price.installmentsPerYear! * years;

  return {
    kind: 'complete',
    total: annualCost * years + price.admissionFee!,
    currency: price.currency,
    years,
    installments,
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
 * we would have to defend. Ties keep their original order (the sort is
 * stable), so the comparador never reshuffles equal columns.
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
 */
export function cheapestTotalIndex(totals: readonly TotalCost[]): number | null {
  const complete = totals
    .map((total, index) => ({ total, index }))
    .filter((entry) => entry.total.kind === 'complete');

  if (complete.length < 2) return null;
  if (new Set(complete.map((entry) => entry.total.currency)).size > 1) return null;

  const lowest = Math.min(...complete.map((entry) => entry.total.total!));
  const winners = complete.filter((entry) => entry.total.total === lowest);
  return winners.length === 1 ? winners[0]!.index : null;
}
