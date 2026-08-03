/**
 * The chips above the results: what is currently narrowing the list, and one
 * click to remove each. The rail can be off-screen on mobile, so this is the
 * only place a user can see *why* they are looking at 12 results.
 */

import { formatGs } from '@/lib/format';
import {
  ARRAY_FILTER_KEYS,
  clearFilters,
  searchHref,
  toggleFilterValue,
  type SearchFilters,
} from '@/lib/search';

import type { ExtraParams } from './FilterRail';
import { countActiveFilters, filterValueLabel } from './filter-model';

export interface ActiveFiltersProps {
  filters: SearchFilters;
  basePath: string;
  extra?: ExtraParams;
}

export function ActiveFilters({ filters, basePath, extra }: ActiveFiltersProps) {
  if (countActiveFilters(filters) === 0) return null;

  const href = (next: SearchFilters) => searchHref(basePath, next, extra);
  const chips: { key: string; label: string; href: string }[] = [];

  for (const key of ARRAY_FILTER_KEYS) {
    for (const value of (filters[key] as string[] | undefined) ?? []) {
      chips.push({
        key: `${key}:${value}`,
        label: filterValueLabel(key, value),
        href: href(toggleFilterValue(filters, key, value)),
      });
    }
  }

  if (filters.isFree != null) {
    chips.push({
      key: 'isFree',
      label: filters.isFree ? 'Solo gratuitas' : 'Solo con arancel',
      href: href({ ...filters, isFree: undefined, page: undefined }),
    });
  }

  if (filters.annualCostMin != null || filters.annualCostMax != null) {
    const from = filters.annualCostMin != null ? formatGs(filters.annualCostMin) : 'Gs. 0';
    const to = filters.annualCostMax != null ? formatGs(filters.annualCostMax) : 'sin límite';
    chips.push({
      key: 'annualCost',
      label: `Arancel anual ${from} – ${to}`,
      href: href({
        ...filters,
        annualCostMin: undefined,
        annualCostMax: undefined,
        page: undefined,
      }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <a
          key={chip.key}
          href={chip.href}
          className="border-ink bg-ink hover:bg-body focus-visible:ring-ink inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium text-white transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {chip.label}
          <span aria-hidden>✕</span>
          <span className="sr-only">Quitar filtro</span>
        </a>
      ))}
      <a
        href={href(clearFilters(filters))}
        className="text-body hover:text-ink focus-visible:ring-ink rounded-sm text-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Limpiar filtros
      </a>
    </div>
  );
}
