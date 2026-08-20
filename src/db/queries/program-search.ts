/**
 * Every SQL statement the search layer runs (CLAUDE.md rule 5).
 *
 * One flat table, no joins at query time: a filtered page is one `SELECT`, the
 * total is one `COUNT`, and each of the eight facet groups is one small
 * `GROUP BY` that applies every *other* active filter but not its own. Ten
 * statements per request against ~10k rows — see `architecture.md` §4.
 *
 * The semantics (what a filter means, how facets are assembled, what
 * `plan_rank` is allowed to do) live in `src/lib/search/engine.ts` and are
 * shared with the in-memory engine. This file is the translation of those
 * semantics into MySQL and nothing else.
 *
 * `today` is passed in from Node rather than read as `CURDATE()`: the app's
 * pool is pinned to UTC but the MySQL session timezone on shared hosting is
 * not ours to guarantee, and "which day is it" decides whether an arancel is
 * still displayable.
 */

import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';

import { db as defaultDb, type Db } from '@/db';
import { areas, programSearch as ps } from '@/db/schema';
import { toDateOnly } from '@/lib/search/accreditation';
import type { Facets, SearchFilters, SearchResponse, SortKey } from '@/lib/search/contract';
import {
  buildFacetGroup,
  emptyFacets,
  resolvePaging,
  resolveSort,
  type RawFacetCount,
} from '@/lib/search/engine';
import { FACET_GROUPS, type AreaOption } from '@/lib/search/groups';
import { buildBooleanModeQuery, parseQuery, type ParsedQuery } from '@/lib/search/normalize';
import type { ArrayFilterKey } from '@/lib/search/params';
import { toOfferingSummary, type ProgramSearchRow } from '@/lib/search/row';

/* -------------------------------------------------------------------------- */
/* Shared expressions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Annual cost in guaraníes, or NULL (which sorts last).
 *
 * **PR-33 removed the freshness gate that used to be here.** A stale arancel
 * is now displayed rather than hidden, so filtering it out of a price range
 * would make a visible number unfilterable — see `isPriceFilterable()` in
 * `lib/search/engine.ts`, which this must keep matching exactly.
 */
function sortableCost(): SQL {
  return sql`(case when ${ps.priceCurrency} = 'PYG' then ${ps.annualCostGs} end)`;
}

function fullTextMatch(query: ParsedQuery): SQL {
  return sql`match(${ps.searchText}) against (${buildBooleanModeQuery(query.fullTextTokens)} in boolean mode)`;
}

/** `institution_short` starts with any of the query's short tokens. */
function acronymMatch(query: ParsedQuery): SQL | undefined {
  if (!query.shortTokens.length) return undefined;
  return sql`(${sql.join(
    query.shortTokens.map((token) => sql`lower(${ps.institutionShort}) like ${`${token}%`}`),
    sql` or `,
  )})`;
}

/**
 * Free text.
 *
 * Long tokens go to the FULLTEXT index. Tokens below
 * `innodb_ft_min_token_size` are invisible to it and fall back to a prefix
 * `LIKE` on `institution_short` — but only as a filter when the whole query is
 * short ("uc"). Alongside real words they only rank, because Spanish
 * two-letter function words would otherwise empty the page. See `parseQuery`.
 */
function queryCondition(query: ParsedQuery): SQL | undefined {
  if (query.isEmpty) return undefined;
  if (query.shortTokensAreRequired) return acronymMatch(query);
  return query.fullTextTokens.length ? fullTextMatch(query) : undefined;
}

/** Filter key → the column it constrains. One entry per array-valued filter. */
const FILTER_COLUMNS: Record<ArrayFilterKey, AnyMySqlColumn> = {
  areaSlugs: ps.areaSlug,
  careerSlugs: ps.careerSlug,
  levels: ps.level,
  managements: ps.management,
  institutionTypes: ps.institutionType,
  modalities: ps.modality,
  shifts: ps.shift,
  citySlugs: ps.citySlug,
  departmentSlugs: ps.departmentSlug,
  accreditationStatuses: ps.accreditationStatus,
  enrollmentStatuses: ps.enrollmentStatus,
};

interface ConditionOptions {
  /** The facet group's own filter, dropped so its counts cross-filter. */
  except?: ArrayFilterKey;
  today: string;
  query: ParsedQuery;
}

function buildConditions(filters: SearchFilters, options: ConditionOptions): SQL[] {
  const { except, query } = options;
  const conditions: SQL[] = [eq(ps.isPublished, true)];

  const q = queryCondition(query);
  if (q) conditions.push(q);

  for (const [key, column] of Object.entries(FILTER_COLUMNS) as [
    ArrayFilterKey,
    AnyMySqlColumn,
  ][]) {
    if (key === except) continue;
    const values = filters[key] as string[] | undefined;
    if (values?.length) conditions.push(inArray(column, values));
  }

  if (filters.institutionSlug) conditions.push(eq(ps.institutionSlug, filters.institutionSlug));

  if (filters.annualCostMin != null || filters.annualCostMax != null) {
    const cost = sortableCost();
    conditions.push(sql`${cost} is not null`);
    if (filters.annualCostMin != null) conditions.push(sql`${cost} >= ${filters.annualCostMin}`);
    if (filters.annualCostMax != null) conditions.push(sql`${cost} <= ${filters.annualCostMax}`);
  }

  if (filters.isFree != null) {
    conditions.push(eq(ps.isFree, filters.isFree));
  }

  if (filters.durationMonthsMax != null) {
    conditions.push(sql`${ps.durationMonths} is not null`);
    conditions.push(sql`${ps.durationMonths} <= ${filters.durationMonthsMax}`);
  }

  return conditions;
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `plan_rank` appears only after the user's own sort key, so paid placement can
 * reorder rows that already tie and nothing else (pr-plan.md PR-27).
 * `offering_id` closes the chain so pagination is stable.
 */
const TIEBREAKERS: SQL[] = [
  desc(ps.planRank),
  asc(ps.institutionShort),
  asc(ps.programName),
  asc(ps.offeringId),
];

function buildOrderBy(sort: SortKey, query: ParsedQuery): SQL[] {
  const cost = sortableCost();
  const primary: SQL[] = [];

  switch (sort) {
    case 'relevancia': {
      // With no query every row ties on relevance and the tiebreakers decide.
      // An acronym hit leads, then the FULLTEXT score — the same two-level
      // ordering the in-memory engine expresses with `ACRONYM_WEIGHT`.
      const acronym = acronymMatch(query);
      if (acronym) primary.push(sql`(${acronym}) desc`);
      if (query.fullTextTokens.length) primary.push(desc(fullTextMatch(query)));
      break;
    }
    case 'arancel_asc':
      primary.push(sql`${cost} is null`, sql`${cost} asc`);
      break;
    case 'arancel_desc':
      primary.push(sql`${cost} is null`, sql`${cost} desc`);
      break;
    case 'duracion_asc':
      primary.push(sql`${ps.durationMonths} is null`, asc(ps.durationMonths));
      break;
    case 'duracion_desc':
      primary.push(sql`${ps.durationMonths} is null`, desc(ps.durationMonths));
      break;
    case 'nombre_asc':
      primary.push(asc(ps.programName));
      break;
    case 'institucion_asc':
      primary.push(asc(ps.institutionShort));
      break;
  }

  return [...primary, ...TIEBREAKERS];
}

/* -------------------------------------------------------------------------- */
/* Facet columns                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The column each group counts on, and the column its label comes from where
 * that label is data rather than a fixed vocabulary. Keyed by `FacetGroupKey`,
 * so a group added in `groups.ts` fails to compile until it has a column here.
 */
const FACET_COLUMNS = {
  areas: { value: ps.areaSlug, label: null },
  levels: { value: ps.level, label: null },
  managements: { value: ps.management, label: null },
  modalities: { value: ps.modality, label: null },
  shifts: { value: ps.shift, label: null },
  cities: { value: ps.citySlug, label: ps.cityName },
  accreditationStatuses: { value: ps.accreditationStatus, label: null },
  enrollmentStatuses: { value: ps.enrollmentStatus, label: null },
} satisfies Record<
  (typeof FACET_GROUPS)[number]['key'],
  { value: AnyMySqlColumn; label: AnyMySqlColumn | null }
>;

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

/** `searchProgramSearchRows`' answer: the page of rows, plus everything the
 *  response carries that is not derived from a clock. */
export interface SearchRowsResult {
  rows: ProgramSearchRow[];
  facets: Facets;
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
}

export interface SearchQueryOptions {
  db?: Db;
  now?: Date;
  /** Skips the eight facet queries where the caller has no rail to render. */
  withFacets?: boolean;
}

/** Area slug → name, for the one facet group whose labels are not an enum. */
export async function listAreaOptions(database: Db = defaultDb): Promise<AreaOption[]> {
  return database
    .select({ slug: areas.slug, name: areas.nameEs })
    .from(areas)
    .orderBy(asc(areas.sortOrder), asc(areas.nameEs));
}

async function countFacet(
  database: Db,
  columns: { value: AnyMySqlColumn; label: AnyMySqlColumn | null },
  where: SQL | undefined,
): Promise<RawFacetCount[]> {
  const label = columns.label;
  if (label) {
    const rows = await database
      .select({ value: columns.value, label, count: sql<number>`count(*)` })
      .from(ps)
      .where(where)
      .groupBy(columns.value, label);
    return rows.map((row) => ({
      value: String(row.value),
      label: String(row.label),
      count: Number(row.count),
    }));
  }
  const rows = await database
    .select({ value: columns.value, count: sql<number>`count(*)` })
    .from(ps)
    .where(where)
    .groupBy(columns.value);
  return rows.map((row) => ({
    value: String(row.value),
    label: String(row.value),
    count: Number(row.count),
  }));
}

/**
 * The rows behind a search, **unmapped**.
 *
 * PR-43 caches this rather than `searchProgramSearch`: a `program_search` row
 * is a fact with a date on it, while an `OfferingSummary` carries
 * `price.freshness`, which is that date compared against *now*. Caching the
 * comparison would let a "vigente" label outlive the twelve-month boundary it
 * describes; caching the row and re-deriving the label on every read cannot
 * (CLAUDE.md rule 3, `architecture.md` §27).
 */
export async function searchProgramSearchRows(
  filters: SearchFilters,
  options: SearchQueryOptions = {},
): Promise<SearchRowsResult> {
  const database = options.db ?? defaultDb;
  const now = options.now ?? new Date();
  const today = toDateOnly(now);
  const query = parseQuery(filters.q);
  const sort = resolveSort(filters);
  const { page, pageSize, offset } = resolvePaging(filters);
  const withFacets = options.withFacets ?? true;

  const where = and(...buildConditions(filters, { today, query }));

  const rowsPromise = database
    .select()
    .from(ps)
    .where(where)
    .orderBy(...buildOrderBy(sort, query))
    .limit(pageSize)
    .offset(offset);

  const totalPromise = database
    .select({ total: sql<number>`count(*)` })
    .from(ps)
    .where(where);

  const areaOptionsPromise: Promise<AreaOption[]> = withFacets
    ? listAreaOptions(database)
    : Promise.resolve([]);

  const facetPromises = withFacets
    ? FACET_GROUPS.map((group) => {
        const columns = FACET_COLUMNS[group.key];
        const groupWhere = and(
          ...buildConditions(filters, { today, query, except: group.filterKey }),
          sql`${columns.value} is not null`,
        );
        return countFacet(database, columns, groupWhere);
      })
    : [];

  const [rows, totalRows, areaOptions, ...facetCounts] = await Promise.all([
    rowsPromise,
    totalPromise,
    areaOptionsPromise,
    ...facetPromises,
  ]);

  const facets = emptyFacets();
  if (withFacets) {
    FACET_GROUPS.forEach((group, index) => {
      facets[group.key] = buildFacetGroup(group, facetCounts[index] ?? [], filters, areaOptions);
    });
  }

  return {
    rows: rows as ProgramSearchRow[],
    facets,
    total: Number(totalRows[0]?.total ?? 0),
    page,
    pageSize,
    sort,
  };
}

/**
 * The mapped search response — what `searchPrograms()` used to be before the
 * cache split, and still is for every caller that reads uncached (the bench
 * script, the in-memory cross-check).
 */
export async function searchProgramSearch(
  filters: SearchFilters,
  options: SearchQueryOptions = {},
): Promise<SearchResponse> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const { rows, ...rest } = await searchProgramSearchRows(filters, options);
  return {
    ...rest,
    results: rows.map((row) => toOfferingSummary(row, now)),
    tookMs: Date.now() - startedAt,
  };
}

/**
 * The comparador reads the same rows through the same table — a comparison
 * never joins (data-model.md §2).
 *
 * Returned in the order the ids were given: the compare columns follow the
 * user's selection, not the database's convenience.
 */
export async function getOfferingRowsByIds(
  ids: readonly number[],
  options: { db?: Db } = {},
): Promise<ProgramSearchRow[]> {
  if (!ids.length) return [];
  const database = options.db ?? defaultDb;
  const rows = (await database
    .select()
    .from(ps)
    .where(and(eq(ps.isPublished, true), inArray(ps.offeringId, [...ids])))) as ProgramSearchRow[];

  const byId = new Map(rows.map((row) => [row.offeringId, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ProgramSearchRow => row != null);
}
