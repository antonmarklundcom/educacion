/**
 * How a `PriceSummary` is allowed to be worded.
 *
 * Two things this module owns, shared by the card view, the table view and the
 * comparador so the three cannot word the same fact differently:
 *
 * - **The honest gap.** With no number at all we say "Consultá el arancel" —
 *   never a guess, a range or a "desde".
 * - **The staleness flag.** Since PR-33 an arancel older than twelve months is
 *   *shown* rather than hidden (CLAUDE.md rule 3), so every display carries
 *   `isStale` and the date, and the components render that as a visible
 *   warning rather than a footnote.
 */

import { formatMoney, formatMonthYear } from '@/lib/format';
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
  /** True when this number needs the "dato desactualizado" warning. */
  isStale: boolean;
  /** "marzo de 2024", or null when we never verified it. */
  verifiedLabel: string | null;
}

/** The one wording for a stale number, used wherever a price appears. */
export const STALE_LABEL = 'Dato desactualizado';
export const STALE_UNKNOWN_LABEL = 'Sin fecha de verificación';

export function staleNotice(price: PriceSummary): string | null {
  if (price.freshness === 'fresh' || !price.hasAmount) return null;
  return price.verifiedAt
    ? `Este arancel es de ${formatMonthYear(price.verifiedAt)} y los aranceles cambian todos los años. Confirmalo con la institución antes de decidir.`
    : 'No sabemos de cuándo es este arancel. Confirmalo con la institución antes de decidir.';
}

/**
 * Preference order: monthly fee (how Paraguayan aranceles are actually quoted)
 * → annual cost → matrícula → the gap. `isFree` short-circuits everything.
 */
export function priceDisplay(price: PriceSummary): PriceDisplay {
  const isStale = price.freshness !== 'fresh';
  const verifiedLabel = price.verifiedAt ? formatMonthYear(price.verifiedAt) : null;
  const base = { isStale, verifiedLabel };

  if (!price.hasAmount || !price.currency) {
    return {
      label: NO_PRICE_LABEL,
      unit: null,
      isFree: false,
      isGap: true,
      ...base,
      isStale: false,
    };
  }
  if (price.isFree) {
    return { label: FREE_LABEL, unit: null, isFree: true, isGap: false, ...base };
  }
  if (price.monthlyFee != null) {
    return {
      label: formatMoney(price.monthlyFee, price.currency),
      unit: '/mes',
      isFree: false,
      isGap: false,
      ...base,
    };
  }
  if (price.annualCost != null) {
    return {
      label: formatMoney(price.annualCost, price.currency),
      unit: '/año',
      isFree: false,
      isGap: false,
      ...base,
    };
  }
  if (price.matricula != null) {
    return {
      label: `${formatMoney(price.matricula, price.currency)} de matrícula`,
      unit: null,
      isFree: false,
      isGap: false,
      ...base,
    };
  }
  return { label: NO_PRICE_LABEL, unit: null, isFree: false, isGap: true, ...base, isStale: false };
}
