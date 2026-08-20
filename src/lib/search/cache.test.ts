/**
 * `searchPrograms()` and `getOfferingsByIds()` **through the cache** (PR-43).
 *
 * `src/lib/cache/*.test.ts` proves the primitive; this file proves the wiring,
 * which is the part a test over the helpers alone cannot see. Every assertion
 * here is written against a second call — the one that reads a
 * `JSON.parse`d entry rather than the object the query returned.
 *
 * The database layer is mocked; the cache is not. `globalThis.__incrementalCache`
 * is the hook `unstable_cache` itself looks for, so the code under test is the
 * shipped path including its serialization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSyntheticRows } from './__fixtures__/synthetic';
import { emptyFacets } from './engine';
import type { ProgramSearchRow } from './row';

const searchProgramSearchRows = vi.fn();
const getOfferingRowsByIds = vi.fn();

vi.mock('@/db/queries/program-search', () => ({
  searchProgramSearchRows: (...args: unknown[]) => searchProgramSearchRows(...args),
  getOfferingRowsByIds: (...args: unknown[]) => getOfferingRowsByIds(...args),
}));

const { getOfferingsByIds, searchPrograms } = await import('./index');

/**
 * The twelve-month boundary is crossed at an arbitrary *moment*, not at a date
 * change — a price verified at 18:00 turns stale at 18:00 a year later. These
 * three instants put the crossing in the middle of one day on purpose: the two
 * reads below therefore share a cache key (which carries the date, see
 * `searchCacheKey`), so what changes between them can only be the freshness
 * derivation, never a refill.
 */
const VERIFIED_AT = new Date('2026-02-14T18:00:00Z');
const WHILE_FRESH = new Date('2027-02-14T10:00:00Z');
const AFTER_TWELVE_MONTHS = new Date('2027-02-14T20:00:00Z');

function pricedRow(): ProgramSearchRow {
  const [row] = makeSyntheticRows(1, { now: VERIFIED_AT });
  return { ...row, priceVerifiedAt: VERIFIED_AT, isFree: false, monthlyFeeGs: 300_000 };
}

function installIncrementalCache() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).__incrementalCache = {
    isOnDemandRevalidate: false,
    async generateSimpleCacheKey(key: string) {
      return key;
    },
    async get(key: string) {
      const body = store.get(key);
      return body === undefined
        ? null
        : { isStale: false, value: { kind: 'FETCH', data: { body } } };
    },
    async set(key: string, value: { data: { body: string } }) {
      store.set(key, value.data.body);
    },
  };
  return store;
}

let store: Map<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  store = installIncrementalCache();
  const row = pricedRow();
  searchProgramSearchRows.mockResolvedValue({
    rows: [row],
    facets: emptyFacets(),
    total: 1,
    page: 1,
    pageSize: 20,
    sort: 'relevancia',
  });
  getOfferingRowsByIds.mockResolvedValue([row]);
});

afterEach(() => {
  store.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
  vi.useRealTimers();
});

describe('searchPrograms through the cache', () => {
  it('queries once for two identical searches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);

    await searchPrograms({ levels: ['grado'] });
    await searchPrograms({ levels: ['grado'] });

    expect(searchProgramSearchRows).toHaveBeenCalledTimes(1);
  });

  it('queries again for a search that differs only in a filter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);

    await searchPrograms({ levels: ['grado'] });
    await searchPrograms({ levels: ['maestria'] });

    expect(searchProgramSearchRows).toHaveBeenCalledTimes(2);
  });

  it('returns a real Date for verifiedAt on the cached read, not the ISO string', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);

    await searchPrograms({});
    const cached = await searchPrograms({});

    expect(searchProgramSearchRows).toHaveBeenCalledTimes(1);
    expect(cached.results[0].price.verifiedAt).toBeInstanceOf(Date);
    expect(cached.results[0].price.verifiedAt?.toISOString()).toBe(VERIFIED_AT.toISOString());
  });

  it('turns the stale-price warning on from a cache entry filled while it was fresh', async () => {
    // The PR-43 acceptance criterion in one test: the warning is derived from
    // the cached `verified_at` against *this* request's clock, so it cannot
    // outlive the price it belongs to (CLAUDE.md rule 3).
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);
    const fresh = await searchPrograms({});
    expect(fresh.results[0].price.freshness).toBe('fresh');

    vi.setSystemTime(AFTER_TWELVE_MONTHS);
    const later = await searchPrograms({});

    expect(later.results[0].price.freshness).toBe('stale');
    expect(later.results[0].price.hasAmount, 'the amount still travels').toBe(true);
    expect(
      searchProgramSearchRows,
      'and it is the same entry, not a refill that could have re-derived it',
    ).toHaveBeenCalledTimes(1);
  });

  it('measures tookMs per request instead of replaying the fill', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);
    searchProgramSearchRows.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(500);
      return {
        rows: [pricedRow()],
        facets: emptyFacets(),
        total: 1,
        page: 1,
        pageSize: 20,
        sort: 'relevancia' as const,
      };
    });

    const filled = await searchPrograms({});
    const cached = await searchPrograms({});

    expect(filled.tookMs).toBeGreaterThanOrEqual(500);
    expect(cached.tookMs).toBeLessThan(500);
  });
});

describe('getOfferingsByIds through the cache', () => {
  it('queries once for the same selection and keeps the Date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);

    await getOfferingsByIds([1]);
    const cached = await getOfferingsByIds([1]);

    expect(getOfferingRowsByIds).toHaveBeenCalledTimes(1);
    expect(cached[0].price.verifiedAt).toBeInstanceOf(Date);
  });

  it('does not serve one selection order from another', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(WHILE_FRESH);

    await getOfferingsByIds([1, 2]);
    await getOfferingsByIds([2, 1]);

    expect(getOfferingRowsByIds).toHaveBeenCalledTimes(2);
  });
});
