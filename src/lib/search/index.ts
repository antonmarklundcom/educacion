/**
 * The search layer's public surface.
 *
 * `searchPrograms(filters) => { results, facets, total }` is the only way any
 * other code may read `program_search` (data-model.md §5). Nothing outside
 * `src/db/queries/` writes SQL against it, and nothing outside this module
 * decides what a filter means.
 *
 * Everything returned is already resolved: hrefs can be built from the slugs
 * on the row, the accreditation badge carries its own source link, and the
 * price has the 12-month rule applied with the amounts stripped when it fails.
 * A component that receives an `OfferingSummary` cannot render a stale arancel
 * and cannot need a second query.
 */

import { getOfferingRowsByIds, searchProgramSearch } from '@/db/queries/program-search';

import type {
  GetOfferingsByIds,
  OfferingSummary,
  SearchFilters,
  SearchPrograms,
  SearchResponse,
} from './contract';
import { toOfferingSummary } from './row';

export type { SearchQueryOptions } from '@/db/queries/program-search';

/** The single entry point (contract, `SearchPrograms`). */
export const searchPrograms: SearchPrograms = (filters: SearchFilters): Promise<SearchResponse> =>
  searchProgramSearch(filters);

/** The comparador's read path — same table, same rows, selection order kept. */
export const getOfferingsByIds: GetOfferingsByIds = async (
  ids: number[],
): Promise<OfferingSummary[]> => {
  const now = new Date();
  const rows = await getOfferingRowsByIds(ids);
  return rows.map((row) => toOfferingSummary(row, now));
};

/* -------------------------------------------------------------------------- */
/* URL state — the same functions for both views                              */
/* -------------------------------------------------------------------------- */

export {
  ARRAY_FILTER_KEYS,
  clearFilters,
  hasActiveFilters,
  parseSearchFilters,
  searchHref,
  serializeSearchFilters,
  toggleFilterValue,
  type ArrayFilterKey,
  type SearchParamsInput,
} from './params';

export {
  ACCREDITATION_STATUS_LABELS,
  ENROLLMENT_STATUS_LABELS,
  INSTITUTION_TYPE_LABELS,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
  SORT_LABELS,
} from './labels';

export { FACET_GROUPS, type AreaOption, type FacetGroupDef } from './groups';

/** The in-memory engine (architecture.md §4.4) and the semantics it shares. */
export { searchInMemory, resolvePaging, resolveSort } from './engine';

export { toOfferingSummary, type ProgramSearchRow } from './row';

export * from './contract';
