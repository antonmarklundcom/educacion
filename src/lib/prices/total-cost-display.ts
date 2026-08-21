/**
 * How a `TotalCost` is allowed to be worded (PR-48).
 *
 * One module so the programme page and the comparador cannot phrase the same
 * gap differently — the same reason `components/browse/price.ts` exists for
 * the arancel.
 */

import { staleWarning } from '@/components/browse/price';
import { copy } from '@/lib/copy';
import { formatDurationMonths, formatMonthYear, formatMoney } from '@/lib/format';

import type { TotalCost, TotalCostGap } from './total-cost';

const UNDETERMINED = [
  'duracion_parcial',
  'incoherente',
  'cuotas_invalidas',
  'montos_invalidos',
] as const;

type UndeterminedGap = (typeof UNDETERMINED)[number];
type AbsenceGap = Exclude<TotalCostGap, UndeterminedGap>;

function isUndetermined(gap: TotalCostGap): gap is UndeterminedGap {
  return (UNDETERMINED as readonly TotalCostGap[]).includes(gap);
}

/** "a", "a y b", "a, b y c" — Spanish list, no Oxford comma. */
export function joinEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * The partial sentence: what is missing, what is undetermined, then the words
 * `total incompleto`. Deliberately carries no figure — see `total-cost.ts`.
 *
 * Absent data and undetermined-but-complete data are worded differently on
 * purpose: "sin datos de duración" is a statement about the institution's
 * record, and saying it about a row that has a duration would be false.
 */
export function partialLabel(total: TotalCost): string {
  const absent = total.missing.filter((gap): gap is AbsenceGap => !isUndetermined(gap));
  const undetermined = total.missing.filter(isUndetermined);

  const clauses = [
    absent.length > 0
      ? `${copy.totalCost.missingPrefix} ${joinEs(absent.map((gap) => copy.totalCost.gaps[gap]))}`
      : null,
    ...undetermined.map((gap) => copy.totalCost.undetermined[gap]),
  ].filter((clause): clause is string => clause !== null);

  return clauses.length > 0
    ? `${clauses.join('; ')} — ${copy.totalCost.incompleteSuffix}`
    : copy.totalCost.incompleteSuffix;
}

/** The amount, or the partial sentence. Never both, never neither. */
export function totalCostLabel(total: TotalCost): string {
  if (total.kind === 'partial' || total.total == null || total.currency == null) {
    return partialLabel(total);
  }
  return formatMoney(total.total, total.currency);
}

/**
 * The words CLAUDE.md rule 3 requires on a stale figure, or null when the
 * figure is fresh or there is no figure at all.
 *
 * `staleWarning()` is reused rather than reworded: "dato de mayo de 2026" alone
 * reads as provenance, and a reader cannot tell it from a fresh date.
 */
export function staleSuffix(total: TotalCost): string | null {
  if (total.kind !== 'complete' || total.freshness === 'fresh') return null;
  return staleWarning(total.verifiedAt ? formatMonthYear(total.verifiedAt) : null);
}

/** The comparador cell: the amount, with the warning attached when it is due. */
export function compareCellLabel(total: TotalCost): string {
  const label = totalCostLabel(total);
  const stale = staleSuffix(total);
  return stale ? `${label} · ${stale}` : label;
}

export function yearsLabel(total: TotalCost): string | null {
  return total.years == null ? null : formatDurationMonths(total.years * 12);
}
