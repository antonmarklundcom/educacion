/**
 * Search semantics, expressed once in TypeScript.
 *
 * Two things live here:
 *
 * 1. **The parts both engines share** — paging and sort resolution, the price
 *    displayability test used for filtering, and the assembly of raw group
 *    counts into `Facets`. The SQL engine in `src/db/queries/program-search.ts`
 *    calls into these so that the two paths cannot present facets differently.
 * 2. **A complete in-memory engine** over an array of `program_search` rows.
 *    This is the fast path `architecture.md` §4.4 keeps in reserve (10k rows ×
 *    ~400 bytes ≈ 4 MB), and it is what makes the facet, sort and pagination
 *    semantics testable in CI without a MySQL to point at.
 *
 * The SQL engine is authoritative in production. The one place the two are
 * knowingly approximate is free-text ranking: MySQL scores `MATCH ... AGAINST`
 * with its own term weighting and the in-memory engine counts matched tokens.
 * Membership (which rows match) is identical; the order within a relevance tie
 * is not.
 */

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  MAX_PAGE_SIZE,
  type FacetGroupKey,
  type FacetOption,
  type Facets,
  type SearchFilters,
  type SearchResponse,
  type SortKey,
} from './contract';
import { FACET_GROUPS, type AreaOption, type FacetGroupDef } from './groups';
import { parseQuery, type ParsedQuery } from './normalize';
import type { ArrayFilterKey } from './params';
import { toOfferingSummary, type ProgramSearchRow } from './row';

/* -------------------------------------------------------------------------- */
/* Paging & sorting                                                           */
/* -------------------------------------------------------------------------- */

export interface Paging {
  page: number;
  pageSize: number;
  offset: number;
}

export function resolvePaging(filters: SearchFilters): Paging {
  const pageSize = Math.min(Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(filters.page ?? 1, 1);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function resolveSort(filters: SearchFilters): SortKey {
  return filters.sort ?? DEFAULT_SORT;
}

/* -------------------------------------------------------------------------- */
/* Price displayability, for filtering                                        */
/* -------------------------------------------------------------------------- */

/**
 * Whether a row's arancel takes part in price filtering and price sorting.
 *
 * **Since PR-33 age is no longer a gate.** While a stale price was hidden,
 * excluding it from a range filter was the only coherent option: a row cannot
 * be filtered on a number the user is not allowed to see. Now that the number
 * is shown — with its date and a warning — the honest behaviour is the
 * consistent one: what you can read, you can filter and sort on. Excluding it
 * would mean a carrera visibly quoting Gs. 1.200.000 vanishing from the
 * "hasta Gs. 1.500.000" filter, which reads as a bug and hides exactly the
 * cheap options a family is looking for.
 *
 * What remains is the currency rule.
 */
export function isPriceFilterable(row: ProgramSearchRow): boolean {
  return row.priceCurrency != null && (row.annualCostGs != null || row.isFree);
}

/**
 * The number the arancel filters and the arancel sorts use: the annual cost,
 * in guaraníes.
 *
 * USD rows keep their native amount and are treated as unsorted (`null`, hence
 * last) rather than converted — an FX rate is a number we would have to defend
 * on a date we do not control (data-model.md §2).
 */
export function sortableAnnualCost(row: ProgramSearchRow): number | null {
  if (row.priceCurrency !== 'PYG') return null;
  return row.annualCostGs ?? null;
}

/* -------------------------------------------------------------------------- */
/* In-memory filtering                                                        */
/* -------------------------------------------------------------------------- */

/** True when the row's acronym starts with one of the query's short tokens. */
function matchesShortToken(row: ProgramSearchRow, query: ParsedQuery): boolean {
  if (!query.shortTokens.length) return false;
  const short = row.institutionShort.toLowerCase();
  return query.shortTokens.some((token) => short.startsWith(token));
}

function matchesQuery(row: ProgramSearchRow, query: ParsedQuery): boolean {
  if (query.isEmpty) return true;
  const haystack = ` ${row.searchText} `;
  for (const token of query.fullTextTokens) {
    if (!haystack.includes(` ${token}`)) return false;
  }
  if (query.shortTokensAreRequired) return matchesShortToken(row, query);
  return true;
}

function includesValue(selected: string[] | undefined, value: string | null): boolean {
  if (!selected?.length) return true;
  return value != null && selected.includes(value);
}

export interface MatchOptions {
  /** The filter to ignore — how a facet group counts without its own filter. */
  except?: ArrayFilterKey;
  now?: Date;
  query?: ParsedQuery;
}

export function matchesFilters(
  row: ProgramSearchRow,
  filters: SearchFilters,
  options: MatchOptions = {},
): boolean {
  const except = options.except;
  const value = <K extends ArrayFilterKey>(key: K): string[] | undefined =>
    except === key ? undefined : (filters[key] as string[] | undefined);

  if (!row.isPublished) return false;

  const query = options.query ?? parseQuery(filters.q);
  if (!matchesQuery(row, query)) return false;

  if (!includesValue(value('areaSlugs'), row.areaSlug)) return false;
  if (!includesValue(value('careerSlugs'), row.careerSlug)) return false;
  if (!includesValue(value('levels'), row.level)) return false;
  if (!includesValue(value('managements'), row.management)) return false;
  if (!includesValue(value('institutionTypes'), row.institutionType)) return false;
  if (!includesValue(value('modalities'), row.modality)) return false;
  if (!includesValue(value('shifts'), row.shift)) return false;
  if (!includesValue(value('citySlugs'), row.citySlug)) return false;
  if (!includesValue(value('departmentSlugs'), row.departmentSlug)) return false;
  if (!includesValue(value('accreditationStatuses'), row.accreditationStatus)) return false;
  if (!includesValue(value('enrollmentStatuses'), row.enrollmentStatus)) return false;

  if (filters.institutionSlug && row.institutionSlug !== filters.institutionSlug) return false;

  if (filters.annualCostMin != null || filters.annualCostMax != null) {
    const cost = sortableAnnualCost(row);
    if (cost == null) return false;
    if (filters.annualCostMin != null && cost < filters.annualCostMin) return false;
    if (filters.annualCostMax != null && cost > filters.annualCostMax) return false;
  }

  if (filters.isFree != null) {
    // "Gratuita" is a price claim like any other: an unverifiable one is not
    // evidence of either answer, so rows without a displayable price are out
    // of both sides of this filter.
    if (!isPriceFilterable(row)) return false;
    if (row.isFree !== filters.isFree) return false;
  }

  if (filters.durationMonthsMax != null) {
    if (row.durationMonths == null || row.durationMonths > filters.durationMonthsMax) return false;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* In-memory sorting                                                          */
/* -------------------------------------------------------------------------- */

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function nullsLast(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * direction;
}

/**
 * A stand-in for MySQL's `MATCH ... AGAINST` score.
 *
 * An acronym hit outranks any number of word hits, mirroring the SQL engine
 * where that comparison is a separate leading `ORDER BY` term — hence the
 * weight, which is far above anything the token count can reach.
 */
const ACRONYM_WEIGHT = 1_000_000;

function relevanceScore(row: ProgramSearchRow, query: ParsedQuery): number {
  if (query.isEmpty) return 0;
  let score = matchesShortToken(row, query) ? ACRONYM_WEIGHT : 0;
  const haystack = ` ${row.searchText} `;
  for (const token of query.fullTextTokens) {
    if (haystack.includes(` ${token} `)) score += 2;
    else if (haystack.includes(` ${token}`)) score += 1;
  }
  return score;
}

/**
 * `plan_rank` is the first tiebreaker and never more than that.
 *
 * It is appended *after* whatever the user asked to sort by, so a paid
 * placement can only reorder rows that are already equal on the user's own
 * criterion — it can never move a cheaper program below a more expensive one
 * (pr-plan.md PR-27 acceptance).
 */
function compareTiebreakers(a: ProgramSearchRow, b: ProgramSearchRow): number {
  if (a.planRank !== b.planRank) return b.planRank - a.planRank;
  const byInstitution = collator.compare(a.institutionShort, b.institutionShort);
  if (byInstitution !== 0) return byInstitution;
  const byProgram = collator.compare(a.programName, b.programName);
  if (byProgram !== 0) return byProgram;
  return a.offeringId - b.offeringId;
}

export function compareRows(
  a: ProgramSearchRow,
  b: ProgramSearchRow,
  sort: SortKey,
  query: ParsedQuery,
): number {
  switch (sort) {
    case 'relevancia': {
      const byScore = relevanceScore(b, query) - relevanceScore(a, query);
      if (byScore !== 0) return byScore;
      break;
    }
    case 'arancel_asc':
    case 'arancel_desc': {
      const byCost = nullsLast(
        sortableAnnualCost(a),
        sortableAnnualCost(b),
        sort === 'arancel_asc' ? 1 : -1,
      );
      if (byCost !== 0) return byCost;
      break;
    }
    case 'duracion_asc':
    case 'duracion_desc': {
      const byDuration = nullsLast(
        a.durationMonths ?? null,
        b.durationMonths ?? null,
        sort === 'duracion_asc' ? 1 : -1,
      );
      if (byDuration !== 0) return byDuration;
      break;
    }
    case 'nombre_asc': {
      const byName = collator.compare(a.programName, b.programName);
      if (byName !== 0) return byName;
      break;
    }
    case 'institucion_asc': {
      const byInstitution = collator.compare(a.institutionShort, b.institutionShort);
      if (byInstitution !== 0) return byInstitution;
      break;
    }
  }
  return compareTiebreakers(a, b);
}

/* -------------------------------------------------------------------------- */
/* Facet assembly — shared by both engines                                    */
/* -------------------------------------------------------------------------- */

/** One `GROUP BY` row, or its in-memory equivalent. */
export interface RawFacetCount {
  value: string;
  label: string;
  count: number;
}

/**
 * Turn raw counts into the option list the rail renders.
 *
 * The universe rules matter for the UX more than the counts do: a fixed
 * vocabulary always renders every option (a checkbox that disappears when it
 * would return nothing makes the rail jump under the user's finger), while
 * cities only render where there is something to find — plus any city the user
 * has selected, so their own choice never vanishes from the list.
 */
export function buildFacetGroup(
  def: FacetGroupDef,
  counts: readonly RawFacetCount[],
  filters: SearchFilters,
  areas: readonly AreaOption[] = [],
): FacetOption[] {
  const selected = new Set((filters[def.filterKey] as string[] | undefined) ?? []);
  const byValue = new Map(counts.map((entry) => [entry.value, entry]));

  const option = (value: string, label: string): FacetOption => ({
    value,
    label,
    count: byValue.get(value)?.count ?? 0,
    selected: selected.has(value),
  });

  if (def.universe === 'enum') {
    return Object.entries(def.labels ?? {}).map(([value, label]) => option(value, label));
  }

  if (def.universe === 'taxonomy') {
    return areas.map((area) => option(area.slug, area.name));
  }

  const options = counts
    .filter((entry) => entry.count > 0 || selected.has(entry.value))
    .map((entry) => option(entry.value, entry.label));
  for (const value of selected) {
    if (!byValue.has(value)) options.push({ value, label: value, count: 0, selected: true });
  }
  return options.sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
}

export function emptyFacets(): Facets {
  return Object.fromEntries(
    FACET_GROUPS.map((group) => [group.key, [] as FacetOption[]]),
  ) as unknown as Facets;
}

/* -------------------------------------------------------------------------- */
/* The in-memory engine                                                       */
/* -------------------------------------------------------------------------- */

export interface InMemoryOptions {
  areas?: readonly AreaOption[];
  now?: Date;
}

/**
 * A complete `searchPrograms` over an array of rows — same inputs, same
 * outputs, no database. Used by the tests and available as the §4.4 fast path.
 */
export function searchInMemory(
  rows: readonly ProgramSearchRow[],
  filters: SearchFilters,
  options: InMemoryOptions = {},
): SearchResponse {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const query = parseQuery(filters.q);
  const sort = resolveSort(filters);
  const { page, pageSize, offset } = resolvePaging(filters);

  const matched = rows.filter((row) => matchesFilters(row, filters, { now, query }));

  const facets = emptyFacets();
  for (const def of FACET_GROUPS) {
    const scope = rows.filter((row) =>
      matchesFilters(row, filters, { now, query, except: def.filterKey }),
    );
    const counts = new Map<string, RawFacetCount>();
    for (const row of scope) {
      const value = def.valueOf(row);
      if (value == null) continue;
      const entry = counts.get(value);
      if (entry) entry.count += 1;
      else counts.set(value, { value, label: def.labelOf(row), count: 1 });
    }
    facets[def.key as FacetGroupKey] = buildFacetGroup(
      def,
      [...counts.values()],
      filters,
      options.areas,
    );
  }

  const results = [...matched]
    .sort((a, b) => compareRows(a, b, sort, query))
    .slice(offset, offset + pageSize)
    .map((row) => toOfferingSummary(row, now));

  return {
    results,
    facets,
    total: matched.length,
    page,
    pageSize,
    sort,
    tookMs: Date.now() - startedAt,
  };
}
