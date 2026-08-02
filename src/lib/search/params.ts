/**
 * `searchParams` ⇄ `SearchFilters`.
 *
 * `FILTER_PARAMS` in the contract is the single source of truth for the URL
 * vocabulary; this module is the single source of truth for how those strings
 * become filters and back. The card view and the table view share one filter
 * state precisely because neither of them is allowed to read `searchParams`
 * directly (data-model.md §5, plan.md §3).
 *
 * Deliberately free of any `@/db` import: the mobile filter sheet is a client
 * component and must not drag Drizzle into the bundle. The allowed values for
 * every enum group are derived from the label maps in `./labels`, whose
 * `Record<Enum, string>` types the compiler already checks for exhaustiveness —
 * so adding a value to the schema enum breaks the build here instead of
 * silently becoming an unparseable URL.
 */

import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  FILTER_PARAMS,
  MAX_PAGE_SIZE,
  SORT_KEYS,
  type AccreditationStatus,
  type EnrollmentStatus,
  type InstitutionType,
  type Level,
  type Management,
  type Modality,
  type SearchFilters,
  type Shift,
  type SortKey,
} from './contract';
import {
  ACCREDITATION_STATUS_LABELS,
  ENROLLMENT_STATUS_LABELS,
  INSTITUTION_TYPE_LABELS,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
} from './labels';

/** Bounds that keep a hand-edited URL from turning into an unbounded query. */
const MAX_QUERY_LENGTH = 120;
const MAX_VALUES_PER_GROUP = 50;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

export const LEVEL_VALUES = Object.keys(LEVEL_LABELS) as Level[];
export const MANAGEMENT_VALUES = Object.keys(MANAGEMENT_LABELS) as Management[];
export const INSTITUTION_TYPE_VALUES = Object.keys(INSTITUTION_TYPE_LABELS) as InstitutionType[];
export const MODALITY_VALUES = Object.keys(MODALITY_LABELS) as Modality[];
export const SHIFT_VALUES = Object.keys(SHIFT_LABELS) as Shift[];
export const ACCREDITATION_STATUS_VALUES = Object.keys(
  ACCREDITATION_STATUS_LABELS,
) as AccreditationStatus[];
export const ENROLLMENT_STATUS_VALUES = Object.keys(ENROLLMENT_STATUS_LABELS) as EnrollmentStatus[];

/** The array-valued filter keys, and what a legal member of each looks like. */
export const ARRAY_FILTER_KEYS = [
  'areaSlugs',
  'careerSlugs',
  'levels',
  'managements',
  'institutionTypes',
  'modalities',
  'shifts',
  'citySlugs',
  'departmentSlugs',
  'accreditationStatuses',
  'enrollmentStatuses',
] as const;

export type ArrayFilterKey = (typeof ARRAY_FILTER_KEYS)[number];

const ARRAY_FILTER_VALUES: Record<ArrayFilterKey, readonly string[] | 'slug'> = {
  areaSlugs: 'slug',
  careerSlugs: 'slug',
  levels: LEVEL_VALUES,
  managements: MANAGEMENT_VALUES,
  institutionTypes: INSTITUTION_TYPE_VALUES,
  modalities: MODALITY_VALUES,
  shifts: SHIFT_VALUES,
  citySlugs: 'slug',
  departmentSlugs: 'slug',
  accreditationStatuses: ACCREDITATION_STATUS_VALUES,
  enrollmentStatuses: ENROLLMENT_STATUS_VALUES,
};

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** What a Next.js server component receives, plus plain `URLSearchParams`. */
export type SearchParamsInput =
  URLSearchParams | Record<string, string | string[] | undefined> | undefined | null;

function readAll(input: SearchParamsInput, name: string): string[] {
  if (!input) return [];
  const raw = input instanceof URLSearchParams ? input.getAll(name) : input[name];
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  // Repeated params and comma-separated values are both accepted on the way
  // in; only the repeated form is ever written back out.
  return values.flatMap((value) => value.split(',')).map((value) => value.trim());
}

function readOne(input: SearchParamsInput, name: string): string | undefined {
  const [first] = readAll(input, name);
  return first === '' ? undefined : first;
}

function parseValues(input: SearchParamsInput, key: ArrayFilterKey): string[] | undefined {
  const allowed = ARRAY_FILTER_VALUES[key];
  const seen = new Set<string>();
  for (const raw of readAll(input, FILTER_PARAMS[key])) {
    const value = raw.toLowerCase();
    if (!value) continue;
    const ok = allowed === 'slug' ? SLUG_PATTERN.test(value) : allowed.includes(value);
    if (!ok) continue; // Unknown values are dropped, not rejected: a stale
    // bookmark should still return results, just not that one facet.
    seen.add(value);
    if (seen.size >= MAX_VALUES_PER_GROUP) break;
  }
  return seen.size ? [...seen] : undefined;
}

function parsePositiveInt(value: string | undefined, max?: number): number | undefined {
  if (value == null || !/^\d{1,12}$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return max != null ? Math.min(parsed, max) : parsed;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  if (['1', 'true', 'si', 'sí'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(value.toLowerCase())) return false;
  return undefined;
}

function parseSort(value: string | undefined): SortKey | undefined {
  return (SORT_KEYS as readonly string[]).includes(value ?? '') ? (value as SortKey) : undefined;
}

/**
 * Parse a URL into filters. Never throws: an unparseable value is dropped and
 * the rest of the URL still works.
 */
export function parseSearchFilters(input: SearchParamsInput): SearchFilters {
  const filters: SearchFilters = {};

  const q = readOne(input, FILTER_PARAMS.q)?.slice(0, MAX_QUERY_LENGTH).trim();
  if (q) filters.q = q;

  for (const key of ARRAY_FILTER_KEYS) {
    const values = parseValues(input, key);
    if (values) {
      // Every array member has been validated against its own vocabulary
      // above, so the cast is checked, not assumed.
      (filters[key] as string[]) = values;
    }
  }

  const institutionSlug = readOne(input, FILTER_PARAMS.institutionSlug)?.toLowerCase();
  if (institutionSlug && SLUG_PATTERN.test(institutionSlug)) {
    filters.institutionSlug = institutionSlug;
  }

  const min = parsePositiveInt(readOne(input, FILTER_PARAMS.annualCostMin));
  const max = parsePositiveInt(readOne(input, FILTER_PARAMS.annualCostMax));
  if (min != null) filters.annualCostMin = min;
  if (max != null) filters.annualCostMax = max;

  const isFree = parseBoolean(readOne(input, FILTER_PARAMS.isFree));
  if (isFree != null) filters.isFree = isFree;

  const durationMonthsMax = parsePositiveInt(readOne(input, FILTER_PARAMS.durationMonthsMax));
  if (durationMonthsMax) filters.durationMonthsMax = durationMonthsMax;

  const sort = parseSort(readOne(input, FILTER_PARAMS.sort));
  if (sort) filters.sort = sort;

  const page = parsePositiveInt(readOne(input, FILTER_PARAMS.page));
  if (page && page > 1) filters.page = page;

  const pageSize = parsePositiveInt(readOne(input, FILTER_PARAMS.pageSize), MAX_PAGE_SIZE);
  if (pageSize) filters.pageSize = pageSize;

  return filters;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Filters back to a URL. Defaults are omitted and array values are sorted, so
 * one filter state has exactly one URL — which is what keeps `/carreras` from
 * generating an unbounded set of near-duplicate crawlable URLs (seo.md §3).
 */
export function serializeSearchFilters(
  filters: SearchFilters,
  extra?: Record<string, string | number | undefined | null>,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q?.trim()) params.set(FILTER_PARAMS.q, filters.q.trim());

  for (const key of ARRAY_FILTER_KEYS) {
    const values = filters[key] as string[] | undefined;
    if (!values?.length) continue;
    for (const value of [...new Set(values)].sort()) {
      params.append(FILTER_PARAMS[key], value);
    }
  }

  if (filters.institutionSlug) params.set(FILTER_PARAMS.institutionSlug, filters.institutionSlug);
  if (filters.annualCostMin != null) {
    params.set(FILTER_PARAMS.annualCostMin, String(filters.annualCostMin));
  }
  if (filters.annualCostMax != null) {
    params.set(FILTER_PARAMS.annualCostMax, String(filters.annualCostMax));
  }
  if (filters.isFree != null) params.set(FILTER_PARAMS.isFree, filters.isFree ? '1' : '0');
  if (filters.durationMonthsMax != null) {
    params.set(FILTER_PARAMS.durationMonthsMax, String(filters.durationMonthsMax));
  }
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set(FILTER_PARAMS.sort, filters.sort);
  if (filters.page && filters.page > 1) params.set(FILTER_PARAMS.page, String(filters.page));
  if (filters.pageSize && filters.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set(FILTER_PARAMS.pageSize, String(filters.pageSize));
  }

  for (const [name, value] of Object.entries(extra ?? {})) {
    if (value != null && value !== '') params.set(name, String(value));
  }

  return params;
}

/** `/carreras?...` — the href every filter control links to. */
export function searchHref(
  pathname: string,
  filters: SearchFilters,
  extra?: Record<string, string | number | undefined | null>,
): string {
  const query = serializeSearchFilters(filters, extra).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Add or remove one option from a facet group.
 *
 * Resets pagination — staying on page 7 after narrowing the result set to 12
 * rows is the classic faceted-browse bug.
 */
export function toggleFilterValue(
  filters: SearchFilters,
  key: ArrayFilterKey,
  value: string,
): SearchFilters {
  const current = (filters[key] as string[] | undefined) ?? [];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  const updated: SearchFilters = { ...filters, page: undefined };
  if (next.length) {
    (updated[key] as string[]) = next;
  } else {
    delete updated[key];
  }
  return updated;
}

/** True when anything at all is narrowing the result set. */
export function hasActiveFilters(filters: SearchFilters): boolean {
  if (filters.q?.trim()) return true;
  if (ARRAY_FILTER_KEYS.some((key) => (filters[key] as string[] | undefined)?.length)) return true;
  return (
    filters.institutionSlug != null ||
    filters.annualCostMin != null ||
    filters.annualCostMax != null ||
    filters.isFree != null ||
    filters.durationMonthsMax != null
  );
}

/** Everything except the free-text query and paging — the "Limpiar filtros" action. */
export function clearFilters(filters: SearchFilters): SearchFilters {
  return {
    q: filters.q,
    institutionSlug: filters.institutionSlug,
    sort: filters.sort,
    pageSize: filters.pageSize,
  };
}
