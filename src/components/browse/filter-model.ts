/**
 * What the filter rail renders, in the order it renders it.
 *
 * The eight facet groups come from the search layer (`FACET_GROUPS`); this
 * module only adds the Spanish section headings and the display order the
 * Dirección 1 prototype fixes. It deliberately does not re-declare which
 * filter a group owns — that lives in `src/lib/search/groups.ts` and drifting
 * from it would break cross-filtering silently.
 */

import {
  ARRAY_FILTER_KEYS,
  FACET_GROUPS,
  INSTITUTION_TYPE_LABELS,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
  ACCREDITATION_STATUS_LABELS,
  ENROLLMENT_STATUS_LABELS,
  type ArrayFilterKey,
  type FacetGroupKey,
  type SearchFilters,
} from '@/lib/search';

export const FACET_GROUP_TITLES: Record<FacetGroupKey, string> = {
  managements: 'Tipo de gestión',
  levels: 'Nivel',
  modalities: 'Modalidad',
  areas: 'Área de estudio',
  accreditationStatuses: 'Acreditación',
  shifts: 'Turno',
  enrollmentStatuses: 'Estado de inscripción',
  cities: 'Ciudad',
};

/** Rail order, top to bottom. Arancel is injected between shifts and cities. */
export const RAIL_ORDER: readonly FacetGroupKey[] = [
  'managements',
  'levels',
  'modalities',
  'areas',
  'accreditationStatuses',
  'shifts',
  'enrollmentStatuses',
  'cities',
];

const FILTER_KEY_BY_GROUP = new Map<FacetGroupKey, ArrayFilterKey>(
  FACET_GROUPS.map((group) => [group.key, group.filterKey]),
);

export function filterKeyFor(group: FacetGroupKey): ArrayFilterKey {
  const key = FILTER_KEY_BY_GROUP.get(group);
  if (!key) throw new Error(`Unknown facet group: ${group}`);
  return key;
}

/**
 * Labels for the active-filter chips. Enum groups have a fixed vocabulary;
 * slug-valued groups (áreas, ciudades, carreras, departamentos) fall back to
 * the slug itself, which is at least honest and never a guessed display name.
 */
const ENUM_LABELS: Partial<Record<ArrayFilterKey, Record<string, string>>> = {
  levels: LEVEL_LABELS,
  managements: MANAGEMENT_LABELS,
  institutionTypes: INSTITUTION_TYPE_LABELS,
  modalities: MODALITY_LABELS,
  shifts: SHIFT_LABELS,
  accreditationStatuses: ACCREDITATION_STATUS_LABELS,
  enrollmentStatuses: ENROLLMENT_STATUS_LABELS,
};

export function filterValueLabel(key: ArrayFilterKey, value: string): string {
  return ENUM_LABELS[key]?.[value] ?? value;
}

/** How many things the user has narrowed by — the number in "Filtrar (N)". */
export function countActiveFilters(filters: SearchFilters): number {
  let count = 0;
  for (const key of ARRAY_FILTER_KEYS) {
    count += (filters[key] as string[] | undefined)?.length ?? 0;
  }
  if (filters.isFree != null) count += 1;
  if (filters.annualCostMin != null || filters.annualCostMax != null) count += 1;
  if (filters.durationMonthsMax != null) count += 1;
  return count;
}
