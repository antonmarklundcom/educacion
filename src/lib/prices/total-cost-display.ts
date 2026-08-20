/**
 * How a `TotalCost` is allowed to be worded (PR-48).
 *
 * One module so the programme page and the comparador cannot phrase the same
 * gap differently — the same reason `components/browse/price.ts` exists for
 * the arancel.
 */

import { copy } from '@/lib/copy';
import { formatDurationMonths, formatMoney } from '@/lib/format';

import type { TotalCost, TotalCostGap } from './total-cost';

/** "a", "a y b", "a, b y c" — Spanish list, no Oxford comma. */
export function joinEs(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function gapLabel(gap: TotalCostGap): string {
  return copy.totalCost.gaps[gap];
}

/**
 * The partial sentence: what is missing, then the words `total incompleto`.
 * Deliberately carries no figure — see `total-cost.ts`.
 */
export function partialLabel(total: TotalCost): string {
  const gaps = joinEs(total.missing.map(gapLabel));
  return gaps ? `${gaps} — ${copy.totalCost.incompleteSuffix}` : copy.totalCost.incompleteSuffix;
}

/** The amount, or the partial sentence. Never both, never neither. */
export function totalCostLabel(total: TotalCost): string {
  if (total.kind === 'partial' || total.total == null || total.currency == null) {
    return partialLabel(total);
  }
  return formatMoney(total.total, total.currency);
}

export function yearsLabel(total: TotalCost): string | null {
  return total.years == null ? null : formatDurationMonths(total.years * 12);
}
