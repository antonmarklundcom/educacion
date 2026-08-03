/**
 * The hero search field. A GET form to the same route — the whole browse page
 * is one URL, so searching is navigation, not a fetch.
 *
 * "Buscar carreras" is a primary CTA and is therefore one of the few places
 * the accent is allowed (design-system.md §2).
 */

import { FILTER_PARAMS, type SearchFilters } from '@/lib/search';

import type { ExtraParams } from './FilterRail';
import { HiddenFilters } from './HiddenFilters';

export interface SearchBarProps {
  filters: SearchFilters;
  basePath: string;
  extra?: ExtraParams;
  label?: string;
}

export function SearchBar({
  filters,
  basePath,
  extra,
  label = 'Encontrá tu carrera',
}: SearchBarProps) {
  return (
    <form method="get" action={basePath} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <HiddenFilters filters={filters} omit={['q', 'page']} extra={extra} />
      <label htmlFor="q" className="text-ink flex-1 text-sm font-medium">
        {label}
        <span className="border-border-strong bg-surface mt-1.5 flex min-h-12 items-center gap-2 rounded-md border px-3">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="stroke-muted size-5 shrink-0 fill-none stroke-2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
          <input
            id="q"
            name={FILTER_PARAMS.q}
            type="search"
            defaultValue={filters.q ?? ''}
            placeholder="Ej. Medicina en Asunción"
            maxLength={120}
            className="text-ink placeholder:text-faint min-h-11 w-full bg-transparent text-sm font-normal focus-visible:outline-none"
          />
        </span>
      </label>
      <button
        type="submit"
        className="bg-accent hover:bg-accent-hover focus-visible:ring-ink min-h-12 w-full rounded-md px-6 text-sm font-medium text-white transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
      >
        Buscar carreras
      </button>
    </form>
  );
}
