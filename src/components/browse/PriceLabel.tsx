/**
 * A price, or the honest absence of one. Monospace per design-system.md §3 —
 * numeric columns are the one place IBM Plex Mono is used.
 *
 * Since PR-33 a stale arancel is shown rather than hidden, so it comes with a
 * visible warning badge right beside the amount — never a footnote, never a
 * tooltip. A visitor must not be able to read the number without reading that
 * it is old (CLAUDE.md rule 3).
 *
 * The badge said "Dato de mayo de 2026" until PR-48b, which is the date without
 * the words: a reader who does not already know the rule reads it as
 * provenance. `staleWarning()` owns the sentence now, and the card, the
 * comparador cell and the total all say it identically.
 */

import { cn } from '@/lib/cn';
import type { PriceSummary } from '@/lib/search';

import { priceDisplay, staleWarning } from './price';

export function PriceLabel({ price, className }: { price: PriceSummary; className?: string }) {
  const display = priceDisplay(price);

  if (display.isGap) {
    return <span className={cn('text-muted text-sm', className)}>{display.label}</span>;
  }

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span
        className={cn('font-mono text-sm font-medium', display.isFree ? 'text-ok' : 'text-ink')}
      >
        {display.label}
        {display.unit && <span className="text-muted font-sans text-xs">{display.unit}</span>}
      </span>
      {display.isStale && (
        <span className="bg-warn-bg text-warn rounded px-1.5 py-0.5 text-[0.7rem] font-medium">
          {staleWarning(display.verifiedLabel)}
        </span>
      )}
    </span>
  );
}
