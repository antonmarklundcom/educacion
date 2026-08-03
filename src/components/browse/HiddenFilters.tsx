/**
 * Carries the current filter state through a plain GET form.
 *
 * Every JS-free control on the browse page that is a form rather than a link
 * (the search field, the arancel range) submits to the same route, and a GET
 * form sends only its own fields — so anything not re-emitted here would be
 * silently cleared. `FILTER_PARAMS` is the single source of truth for the
 * names, so this can never drift from what `parseSearchFilters` reads back.
 *
 * Paging is never carried: any change to the query or the range means page 1.
 */

import { ARRAY_FILTER_KEYS, FILTER_PARAMS, type SearchFilters } from '@/lib/search';

export interface HiddenFiltersProps {
  filters: SearchFilters;
  /** Params the surrounding form supplies itself, e.g. `q` on the search bar. */
  omit?: readonly (keyof SearchFilters)[];
  /** `vista` / `comparar` — not filters, but they must survive a submit. */
  extra?: Record<string, string | number | undefined | null>;
}

export function HiddenFilters({ filters, omit = [], extra }: HiddenFiltersProps) {
  const skip = new Set<keyof SearchFilters>(omit);
  const hidden: [string, string][] = [];

  if (filters.q && !skip.has('q')) hidden.push([FILTER_PARAMS.q, filters.q]);

  for (const key of ARRAY_FILTER_KEYS) {
    if (skip.has(key)) continue;
    for (const value of (filters[key] as string[] | undefined) ?? []) {
      hidden.push([FILTER_PARAMS[key], value]);
    }
  }

  if (filters.institutionSlug && !skip.has('institutionSlug')) {
    hidden.push([FILTER_PARAMS.institutionSlug, filters.institutionSlug]);
  }
  if (filters.annualCostMin != null && !skip.has('annualCostMin')) {
    hidden.push([FILTER_PARAMS.annualCostMin, String(filters.annualCostMin)]);
  }
  if (filters.annualCostMax != null && !skip.has('annualCostMax')) {
    hidden.push([FILTER_PARAMS.annualCostMax, String(filters.annualCostMax)]);
  }
  if (filters.isFree != null && !skip.has('isFree')) {
    hidden.push([FILTER_PARAMS.isFree, filters.isFree ? '1' : '0']);
  }
  if (filters.durationMonthsMax != null && !skip.has('durationMonthsMax')) {
    hidden.push([FILTER_PARAMS.durationMonthsMax, String(filters.durationMonthsMax)]);
  }
  if (filters.sort && !skip.has('sort')) hidden.push([FILTER_PARAMS.sort, filters.sort]);
  if (filters.pageSize && !skip.has('pageSize')) {
    hidden.push([FILTER_PARAMS.pageSize, String(filters.pageSize)]);
  }

  for (const [name, value] of Object.entries(extra ?? {})) {
    if (value != null && value !== '') hidden.push([name, String(value)]);
  }

  return (
    <>
      {hidden.map(([name, value], index) => (
        <input key={`${name}-${value}-${index}`} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
