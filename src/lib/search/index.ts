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
 * price carries its `freshness` beside its amounts, classified once by
 * `priceFreshness()`, and a component cannot need a second query.
 *
 * What this layer does **not** do is enforce rule 3. It hands over the amounts
 * and the freshness; whether the warning is rendered beside the number is the
 * component's to get right, and PR-48b found three that did not. What keeps
 * them in line is that `priceDisplay()` returns both in one call and
 * `staleWarning()` is the only wording of the sentence — a convention, held by
 * the render tests in `architecture.md` §31.7, not a type.
 */

import { getOfferingRowsByIds, searchProgramSearchRows } from '@/db/queries/program-search';
import {
  cachedRead,
  decodeProgramSearchRow,
  encodeProgramSearchRow,
  offeringsByIdsCacheKey,
  searchCacheKey,
  type ProgramSearchRowWire,
} from '@/lib/cache';

import type {
  Facets,
  GetOfferingsByIds,
  OfferingSummary,
  SearchFilters,
  SearchPrograms,
  SearchResponse,
  SortKey,
} from './contract';
import { toOfferingSummary } from './row';

export type { SearchQueryOptions } from '@/db/queries/program-search';

/** What one cache entry of a search holds: rows in wire form, nothing derived. */
interface SearchWire {
  rows: ProgramSearchRowWire[];
  facets: Facets;
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
}

/**
 * The single entry point (contract, `SearchPrograms`) — cached since PR-43.
 *
 * The cache holds rows, not results. `toOfferingSummary(row, now)` runs on
 * every read, hit or miss, so `price.freshness` — the "dato desactualizado"
 * warning — is always computed against *this* request's clock and can never
 * outlive the price it belongs to (`architecture.md` §27).
 *
 * `tookMs` is measured here rather than cached, so it reports what the page
 * actually waited for instead of replaying the fill.
 */
export const searchPrograms: SearchPrograms = async (
  filters: SearchFilters,
): Promise<SearchResponse> => {
  const startedAt = Date.now();
  const now = new Date();

  const response = await cachedRead<SearchWire, Omit<SearchResponse, 'tookMs'>>({
    name: 'search-programs',
    key: searchCacheKey(filters, now),
    load: async () => {
      const { rows, ...rest } = await searchProgramSearchRows(filters, { now });
      return { ...rest, rows: rows.map(encodeProgramSearchRow) };
    },
    decode: (wire) => ({
      facets: wire.facets,
      total: wire.total,
      page: wire.page,
      pageSize: wire.pageSize,
      sort: wire.sort,
      results: wire.rows.map((row) => toOfferingSummary(decodeProgramSearchRow(row), now)),
    }),
  });

  return { ...response, tookMs: Date.now() - startedAt };
};

/** The comparador's read path — same table, same rows, selection order kept. */
export const getOfferingsByIds: GetOfferingsByIds = async (
  ids: number[],
): Promise<OfferingSummary[]> => {
  const now = new Date();
  return cachedRead<ProgramSearchRowWire[], OfferingSummary[]>({
    name: 'offerings-by-ids',
    key: offeringsByIdsCacheKey(ids),
    load: async () => (await getOfferingRowsByIds(ids)).map(encodeProgramSearchRow),
    decode: (wire) => wire.map((row) => toOfferingSummary(decodeProgramSearchRow(row), now)),
  });
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
