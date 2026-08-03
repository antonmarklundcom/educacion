/**
 * What the results column says when there is nothing to show.
 *
 * Two genuinely different situations, and conflating them would be dishonest:
 *
 *  - **Filters returned nothing.** The index has programs; this combination has
 *    none. Offer a way back.
 *  - **The index is empty.** No filters are set and there is still nothing,
 *    which means the data is not loaded yet. Say exactly that. It must never
 *    read as "Paraguay has no programs", and it must never be papered over
 *    with sample rows (CLAUDE.md rule 1).
 */

import { clearFilters, hasActiveFilters, searchHref, type SearchFilters } from '@/lib/search';

import type { ExtraParams } from './FilterRail';

export interface EmptyStateProps {
  filters: SearchFilters;
  basePath: string;
  extra?: ExtraParams;
}

export function EmptyState({ filters, basePath, extra }: EmptyStateProps) {
  const filtered = hasActiveFilters(filters);

  return (
    <div className="border-border-strong bg-surface rounded-lg border border-dashed px-6 py-12 text-center">
      <h2 className="text-ink text-lg font-semibold">
        {filtered ? 'No encontramos carreras con esos filtros' : 'Todavía no hay carreras cargadas'}
      </h2>
      <p className="text-body mx-auto mt-2 max-w-prose text-sm">
        {filtered
          ? 'Probá quitando algún filtro o ampliando el rango de arancel. Si buscabas una carrera puntual, escribila con otras palabras.'
          : 'El índice se arma con los registros públicos del CONES y de la ANEAES. Todavía no cargamos ese relevamiento, así que preferimos mostrarte nada antes que datos inventados.'}
      </p>
      {filtered && (
        <a
          href={searchHref(basePath, clearFilters(filters), extra)}
          className="border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink mt-6 inline-flex min-h-12 items-center justify-center rounded-md border px-5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Limpiar filtros
        </a>
      )}
    </div>
  );
}
