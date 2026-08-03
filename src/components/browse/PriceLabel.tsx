/**
 * A price, or the honest absence of one. Monospace per design-system.md §3 —
 * numeric columns are the one place IBM Plex Mono is used.
 */

import { cn } from '@/lib/cn';
import type { PriceSummary } from '@/lib/search';

import { priceDisplay } from './price';

export function PriceLabel({ price, className }: { price: PriceSummary; className?: string }) {
  const display = priceDisplay(price);

  if (display.isGap) {
    return <span className={cn('text-muted text-sm', className)}>{display.label}</span>;
  }

  return (
    <span
      className={cn(
        'font-mono text-sm font-medium',
        display.isFree ? 'text-ok' : 'text-ink',
        className,
      )}
    >
      {display.label}
      {display.unit && <span className="text-muted font-sans text-xs">{display.unit}</span>}
    </span>
  );
}
