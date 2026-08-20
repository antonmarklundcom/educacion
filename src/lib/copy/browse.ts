/**
 * The browse chrome: search bar, sort, view toggle, chips, empty state.
 *
 * Every consumer of this slice is a server component. Keeping it out of
 * `filter-sheet.ts` is what keeps it out of the browser bundle.
 */
export const browseCopy = {
  searchLabel: 'Encontrá tu carrera',
  searchPlaceholder: 'Ej. Medicina en Asunción',
  searchSubmit: 'Buscar carreras',
  sortPrefix: 'Ordenar:',
  viewGroupLabel: 'Cambiar vista',
  views: {
    tarjetas: 'Tarjetas',
    tabla: 'Tabla',
  },
  clearFilters: 'Limpiar filtros',
  removeFilter: 'Quitar filtro',
  freeOnly: 'Solo gratuitas',
  paidOnly: 'Solo con arancel',
  noUpperBound: 'sin límite',
  zeroAmount: 'Gs. 0',
  annualCostChip: (from: string, to: string) => `Arancel anual ${from} – ${to}`,
  empty: {
    filteredHeading: 'No encontramos carreras con esos filtros',
    filteredBody:
      'Probá quitando algún filtro o ampliando el rango de arancel. Si buscabas una carrera puntual, escribila con otras palabras.',
    /**
     * Never "Paraguay has no programmes" and never papered over with sample
     * rows — CLAUDE.md rule 1.
     */
    unloadedHeading: 'Todavía no hay carreras cargadas',
    unloadedBody:
      'El índice se arma con los registros públicos del CONES y de la ANEAES. Todavía no cargamos ese relevamiento, así que preferimos mostrarte nada antes que datos inventados.',
  },
} as const;
