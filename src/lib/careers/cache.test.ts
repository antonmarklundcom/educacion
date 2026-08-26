/**
 * The career and área read paths through the cache (PR-55), in the same shape
 * as `institutions/cache.test.ts` and against the same real `unstable_cache`.
 *
 * These six were the ones PR-43 left out, and `architecture.md` §38 explains
 * why that mattered more than it looked: every career hub, área hub and city
 * page is `force-dynamic`, and the homepage's supply ranking walks áreas in a
 * loop it cannot parallelise. The property worth pinning is not "it is fast" —
 * it is that a second read of the same key does not reach the database, and
 * that two different keys do not share an entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAreaBySlugQuery = vi.fn();
const getCareerBySlugQuery = vi.fn();
const getCareerStatsQuery = vi.fn();
const getCareerCitySupplyQuery = vi.fn();
const listCareersByAreaQuery = vi.fn();
const listRelatedCareersQuery = vi.fn();

vi.mock('@/db/queries/careers', () => ({
  getAreaBySlug: (...a: unknown[]) => getAreaBySlugQuery(...a),
  getCareerBySlug: (...a: unknown[]) => getCareerBySlugQuery(...a),
  getCareerStats: (...a: unknown[]) => getCareerStatsQuery(...a),
  getCareerCitySupply: (...a: unknown[]) => getCareerCitySupplyQuery(...a),
  listCareersByArea: (...a: unknown[]) => listCareersByAreaQuery(...a),
  listRelatedCareers: (...a: unknown[]) => listRelatedCareersQuery(...a),
}));

const {
  getAreaBySlug,
  getCareerBySlug,
  getCareerCitySupply,
  getCareerStats,
  listCareersByArea,
  listRelatedCareers,
} = await import('./index');

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
  getAreaBySlugQuery.mockImplementation(async (slug: string) => ({ id: 1, slug, nameEs: 'Salud' }));
  getCareerBySlugQuery.mockImplementation(async (slug: string) => ({ id: 2, slug }));
  getCareerStatsQuery.mockResolvedValue({ offeringCount: 9, institutionCount: 4, cityCount: 3 });
  getCareerCitySupplyQuery.mockResolvedValue([{ citySlug: 'asuncion', offeringCount: 4 }]);
  listCareersByAreaQuery.mockResolvedValue([{ id: 2, slug: 'medicina', stats: {} }]);
  listRelatedCareersQuery.mockResolvedValue([{ slug: 'enfermeria', nameEs: 'Enfermería' }]);
});

afterEach(() => {
  store.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
});

describe('the by-slug reads', () => {
  it('query once per slug and serve the rest from the cache', async () => {
    await getCareerBySlug('medicina');
    await getCareerBySlug('medicina');
    expect(getCareerBySlugQuery).toHaveBeenCalledTimes(1);
  });

  it('key by slug rather than sharing one entry', async () => {
    await getAreaBySlug('salud');
    await getAreaBySlug('derecho');
    await getAreaBySlug('salud');
    expect(getAreaBySlugQuery).toHaveBeenCalledTimes(2);
  });

  it('cache a 404 without turning it into something else', async () => {
    getCareerBySlugQuery.mockResolvedValue(null);
    expect(await getCareerBySlug('no-existe')).toBeNull();
    expect(await getCareerBySlug('no-existe')).toBeNull();
    expect(getCareerBySlugQuery).toHaveBeenCalledTimes(1);
  });
});

describe('the by-id reads', () => {
  it('key career stats by career', async () => {
    await getCareerStats(2);
    await getCareerStats(3);
    await getCareerStats(2);
    expect(getCareerStatsQuery).toHaveBeenCalledTimes(2);
  });

  it('key the city supply by career', async () => {
    await getCareerCitySupply(2);
    await getCareerCitySupply(2);
    expect(getCareerCitySupplyQuery).toHaveBeenCalledTimes(1);
  });

  it('key the área listing by área — the home ranking reads several in a row', async () => {
    await listCareersByArea(1);
    await listCareersByArea(2);
    await listCareersByArea(1);
    expect(listCareersByAreaQuery).toHaveBeenCalledTimes(2);
  });
});

describe('listRelatedCareers', () => {
  // Three arguments, one entry: a key built from only the área would serve one
  // career's "related" list to every other career in it, with itself in it.
  it('keys on every argument that changes the answer', async () => {
    await listRelatedCareers(1, 2, 6);
    await listRelatedCareers(1, 2, 6);
    expect(listRelatedCareersQuery).toHaveBeenCalledTimes(1);

    await listRelatedCareers(1, 3, 6);
    await listRelatedCareers(1, 2, 3);
    expect(listRelatedCareersQuery).toHaveBeenCalledTimes(3);
  });
});

describe('the home ranking’s walk', () => {
  it('pays one round trip per área per request, not two per step forever', async () => {
    const { loadTopCareers } = await import('@/lib/home/top-careers');
    const areas = [
      { slug: 'salud', offeringCount: 40 },
      { slug: 'derecho', offeringCount: 30 },
    ];
    getAreaBySlugQuery.mockImplementation(async (slug: string) => ({
      id: slug === 'salud' ? 1 : 2,
      slug,
    }));
    listCareersByAreaQuery.mockImplementation(async (areaId: number) => [
      {
        id: areaId * 10,
        slug: `c-${areaId}`,
        nameEs: `Carrera ${areaId}`,
        stats: { offeringCount: 5, institutionCount: 2, cityCount: 1 },
      },
    ]);

    await loadTopCareers(areas, 8);
    const firstPass = getAreaBySlugQuery.mock.calls.length + listCareersByAreaQuery.mock.calls.length;

    await loadTopCareers(areas, 8);
    const total = getAreaBySlugQuery.mock.calls.length + listCareersByAreaQuery.mock.calls.length;

    expect(firstPass).toBeGreaterThan(0);
    // The second render of the same homepage reaches the database zero times.
    expect(total).toBe(firstPass);
  });
});
