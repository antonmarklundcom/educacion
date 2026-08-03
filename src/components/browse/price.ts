/**
 * How a `PriceSummary` is allowed to be worded.
 *
 * The 12-month rule (CLAUDE.md rule 3) is already applied upstream: when it
 * fails, every amount on the object is `null` before it reaches a component,
 * so nothing here can leak a stale arancel. What this module owns is the
 * *honest gap* — what we say when there is no displayable number, which is
 * "Consultá el arancel", never a guess, a range or an "desde".
 *
 * Shared by the card view, the table view and the comparador so the three
 * cannot word the same absence differently.
 */

import { formatMoney } from '@/lib/format';
import type { PriceSummary } from '@/lib/search';

export const NO_PRICE_LABEL = 'Consultá el arancel';
export const FREE_LABEL = 'Gratuita';

export interface PriceDisplay {
  /** The short string a card or a table cell shows. */
  label: string;
  /** "/mes" or "/año" — rendered smaller next to the amount. */
  unit: string | null;
  /** True for "Gratuita", which is the only price worth colouring. */
  isFree: boolean;
  /** True when `label` is the honest gap rather than a number. */
  isGap: boolean;
}

/**
 * Preference order: monthly fee (how Paraguayan aranceles are actually quoted)
 * → annual cost → matrícula → the gap. `isFree` short-circuits everything.
 */
export function priceDisplay(price: PriceSummary): PriceDisplay {
  if (!price.isDisplayable || !price.currency) {
    return { label: NO_PRICE_LABEL, unit: null, isFree: false, isGap: true };
  }
  if (price.isFree) {
    return { label: FREE_LABEL, unit: null, isFree: true, isGap: false };
  }
  if (price.monthlyFee != null) {
    return {
      label: formatMoney(price.monthlyFee, price.currency),
      unit: '/mes',
      isFree: false,
      isGap: false,
    };
  }
  if (price.annualCost != null) {
    return {
      label: formatMoney(price.annualCost, price.currency),
      unit: '/año',
      isFree: false,
      isGap: false,
    };
  }
  if (price.matricula != null) {
    return {
      label: `${formatMoney(price.matricula, price.currency)} de matrícula`,
      unit: null,
      isFree: false,
      isGap: false,
    };
  }
  return { label: NO_PRICE_LABEL, unit: null, isFree: false, isGap: true };
}
