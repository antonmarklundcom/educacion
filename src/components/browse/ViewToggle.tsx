/**
 * Tarjetas ⇄ Tabla. Two views of one dataset, one filter state, one URL
 * (plan.md §3) — so the toggle is two links that differ only in `vista`, and
 * every active filter, the sort and the comparador selection ride along.
 *
 * The active view is marked with ink, not the accent (design-system.md §2).
 */

import { cn } from '@/lib/cn';
import {
  DEFAULT_VIEW,
  VIEW_MODES,
  VIEW_PARAM,
  searchHref,
  type SearchFilters,
  type ViewMode,
} from '@/lib/search';

const LABELS: Record<ViewMode, string> = {
  tarjetas: 'Tarjetas',
  tabla: 'Tabla',
};

export interface ViewToggleProps {
  view: ViewMode;
  filters: SearchFilters;
  basePath: string;
  /** Everything except `vista`, which this control owns. */
  extra?: Record<string, string | number | undefined | null>;
}

export function ViewToggle({ view, filters, basePath, extra }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Cambiar vista"
      className="border-border-strong bg-surface inline-flex rounded-md border p-0.5"
    >
      {VIEW_MODES.map((mode) => (
        <a
          key={mode}
          href={searchHref(basePath, filters, {
            ...extra,
            [VIEW_PARAM]: mode === DEFAULT_VIEW ? undefined : mode,
          })}
          aria-current={mode === view ? 'true' : undefined}
          className={cn(
            'focus-visible:ring-ink inline-flex min-h-9 items-center rounded px-3 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none',
            mode === view ? 'bg-ink text-white' : 'text-body hover:bg-card-alt',
          )}
        >
          {LABELS[mode]}
        </a>
      ))}
    </div>
  );
}
