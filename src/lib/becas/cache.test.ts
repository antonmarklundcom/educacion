/**
 * The becas read paths through the cache (PR-57), in the same shape as
 * `institutions/cache.test.ts` and `careers/cache.test.ts`, against the same
 * real `unstable_cache`.
 *
 * Two properties beyond "a second read does not reach the database": the
 * `listBecas`/`becaTypeCounts` cache key rolls over at midnight, so a beca
 * whose deadline just passed cannot survive in "becas abiertas" past the date
 * that closed it — and `getBecaBySlug`'s `isClosed` is recomputed from the
 * cached `deadline` on every read, so a cache **hit** still reflects the
 * request's own clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listBecasQuery = vi.fn();
const getBecaBySlugQuery = vi.fn();
const becaTypeCountsQuery = vi.fn();

vi.mock('@/db/queries/becas', () => ({
  listBecas: (...args: unknown[]) => listBecasQuery(...args),
  getBecaBySlug: (...args: unknown[]) => getBecaBySlugQuery(...args),
  becaTypeCounts: (...args: unknown[]) => becaTypeCountsQuery(...args),
}));

const { becaTypeCounts, getBecaBySlug, listBecas } = await import('./index');

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

const BEFORE_DEADLINE = new Date('2027-03-01T10:00:00Z');
const AFTER_DEADLINE = new Date('2027-03-15T10:00:00Z');

function detailFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    slug: 'beca-una',
    title: 'Beca UNA',
    summary: 'x',
    type: 'estatal',
    coverage: 'total',
    amountPyg: null,
    percentage: null,
    deadline: '2027-03-10',
    providerLabel: 'UNA',
    institutionSlug: 'una',
    areaName: null,
    areaSlug: null,
    sourceUrl: 'https://una.py',
    verifiedAt: new Date('2027-01-01T00:00:00Z'),
    detailsMd: null,
    requirementsMd: null,
    applyUrl: null,
    updatedAt: new Date('2027-01-01T00:00:00Z'),
    isClosed: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store = installIncrementalCache();
  listBecasQuery.mockResolvedValue([
    {
      id: 1,
      slug: 'beca-una',
      title: 'Beca UNA',
      summary: 'x',
      type: 'estatal',
      coverage: 'total',
      amountPyg: null,
      percentage: null,
      deadline: '2027-03-10',
      providerLabel: 'UNA',
      institutionSlug: 'una',
      areaName: null,
      areaSlug: null,
      sourceUrl: 'https://una.py',
      verifiedAt: new Date('2027-01-01T00:00:00Z'),
    },
  ]);
  getBecaBySlugQuery.mockImplementation(async () => detailFixture());
  becaTypeCountsQuery.mockResolvedValue([{ type: 'estatal', count: 1 }]);
});

afterEach(() => {
  store.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
});

describe('listBecas', () => {
  it('queries once for the same filters and date, and serves the Date field back as a Date', async () => {
    const [first] = await listBecas({}, BEFORE_DEADLINE);
    const [second] = await listBecas({}, BEFORE_DEADLINE);
    expect(listBecasQuery).toHaveBeenCalledTimes(1);
    expect(second.verifiedAt).toBeInstanceOf(Date);
    expect(second.verifiedAt?.toISOString()).toBe(first.verifiedAt?.toISOString());
  });

  it('keys by filters — the type filter does not share the unfiltered entry', async () => {
    await listBecas({}, BEFORE_DEADLINE);
    await listBecas({ type: 'estatal' }, BEFORE_DEADLINE);
    expect(listBecasQuery).toHaveBeenCalledTimes(2);
  });

  it('rolls the key over at midnight, so a stale day cannot serve a closed beca', async () => {
    await listBecas({}, BEFORE_DEADLINE);
    await listBecas({}, AFTER_DEADLINE);
    expect(listBecasQuery).toHaveBeenCalledTimes(2);
  });
});

describe('becaTypeCounts', () => {
  it('caches within the same day', async () => {
    await becaTypeCounts(BEFORE_DEADLINE);
    await becaTypeCounts(BEFORE_DEADLINE);
    expect(becaTypeCountsQuery).toHaveBeenCalledTimes(1);
  });

  it('rolls over at midnight', async () => {
    await becaTypeCounts(BEFORE_DEADLINE);
    await becaTypeCounts(AFTER_DEADLINE);
    expect(becaTypeCountsQuery).toHaveBeenCalledTimes(2);
  });
});

describe('getBecaBySlug', () => {
  it('queries once per slug and serves the rest from the cache', async () => {
    await getBecaBySlug('beca-una', BEFORE_DEADLINE);
    await getBecaBySlug('beca-una', BEFORE_DEADLINE);
    expect(getBecaBySlugQuery).toHaveBeenCalledTimes(1);
  });

  it('caches a 404 without turning it into something else', async () => {
    getBecaBySlugQuery.mockResolvedValue(null);
    expect(await getBecaBySlug('no-existe')).toBeNull();
    expect(await getBecaBySlug('no-existe')).toBeNull();
    expect(getBecaBySlugQuery).toHaveBeenCalledTimes(1);
  });

  // The property that matters: `isClosed` is derived from `deadline` and
  // *this* request's clock on every read, hit or miss — a cache filled before
  // the deadline must not keep saying the beca is open once it has passed.
  it('recomputes isClosed on a cache hit, against the read’s own clock', async () => {
    const beforeRead = await getBecaBySlug('beca-una', BEFORE_DEADLINE);
    expect(beforeRead?.isClosed).toBe(false);

    const afterRead = await getBecaBySlug('beca-una', AFTER_DEADLINE);
    expect(afterRead?.isClosed).toBe(true);
    // The key is the slug alone — no date — so the second call is a cache
    // *hit*: this is `decode` recomputing `isClosed`, not a refill.
    expect(getBecaBySlugQuery).toHaveBeenCalledTimes(1);
  });
});
