/**
 * "Cache keys include every searchParam that changes the result" — PR-43's
 * acceptance criterion, tested by walking the contract rather than by listing
 * the fields a second time.
 *
 * `FILTER_PARAMS` is `satisfies Record<keyof SearchFilters, string>`, so it
 * cannot fall behind `SearchFilters`; this file gives each of its keys a value
 * and asserts the key moves. Delete a line from `serializeSearchFilters` and
 * one of these goes red.
 */

import { describe, expect, it } from 'vitest';

import { FILTER_PARAMS, type SearchFilters } from '@/lib/search/contract';

import { offeringsByIdsCacheKey, searchCacheKey } from './search-key';

const NOW = new Date('2026-08-02T12:00:00Z');

/** One non-default value per filter, chosen so `serialize` must emit it. */
const DISTINCT: Record<keyof typeof FILTER_PARAMS, SearchFilters> = {
  q: { q: 'derecho' },
  areaSlugs: { areaSlugs: ['salud'] },
  careerSlugs: { careerSlugs: ['medicina'] },
  levels: { levels: ['grado'] },
  managements: { managements: ['privada'] },
  institutionTypes: { institutionTypes: ['universidad'] },
  modalities: { modalities: ['presencial'] },
  shifts: { shifts: ['noche'] },
  citySlugs: { citySlugs: ['asuncion'] },
  departmentSlugs: { departmentSlugs: ['central'] },
  accreditationStatuses: { accreditationStatuses: ['vigente'] },
  enrollmentStatuses: { enrollmentStatuses: ['abiertas'] },
  institutionSlug: { institutionSlug: 'una' },
  annualCostMin: { annualCostMin: 1_000_000 },
  annualCostMax: { annualCostMax: 9_000_000 },
  isFree: { isFree: true },
  durationMonthsMax: { durationMonthsMax: 48 },
  sort: { sort: 'arancel_asc' },
  page: { page: 3 },
  pageSize: { pageSize: 50 },
};

describe('searchCacheKey', () => {
  const base = searchCacheKey({}, NOW);

  it.each(Object.keys(FILTER_PARAMS) as (keyof typeof FILTER_PARAMS)[])(
    'changes when %s changes',
    (field) => {
      expect(searchCacheKey(DISTINCT[field], NOW)).not.toBe(base);
    },
  );

  it('gives every filter its own key, not just a different one from the base', () => {
    const keys = Object.values(DISTINCT).map((filters) => searchCacheKey(filters, NOW));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is stable under key order and value order', () => {
    const a: SearchFilters = { levels: ['grado', 'maestria'], q: 'derecho', page: 2 };
    const b: SearchFilters = { page: 2, q: 'derecho', levels: ['maestria', 'grado'] };
    expect(searchCacheKey(a, NOW)).toBe(searchCacheKey(b, NOW));
  });

  it('does not split entries on a value that means the default', () => {
    // `sort: 'relevancia'` and `page: 1` are what an unfiltered request already
    // means, so they must share the base entry rather than double the keyspace.
    expect(searchCacheKey({ sort: 'relevancia', page: 1 }, NOW)).toBe(base);
  });

  it('separates the days, because the query compares against today', () => {
    const nextDay = new Date('2026-08-03T00:05:00Z');
    expect(searchCacheKey({}, nextDay)).not.toBe(base);
  });
});

describe('offeringsByIdsCacheKey', () => {
  it('distinguishes selection order, which is part of the answer', () => {
    expect(offeringsByIdsCacheKey([3, 1, 2])).not.toBe(offeringsByIdsCacheKey([1, 2, 3]));
  });

  it('distinguishes a different selection', () => {
    expect(offeringsByIdsCacheKey([1, 2])).not.toBe(offeringsByIdsCacheKey([1, 2, 3]));
  });
});
