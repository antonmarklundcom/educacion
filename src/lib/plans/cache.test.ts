/**
 * `listPlans()` through the cache (PR-57), in the same shape as
 * `becas/cache.test.ts` and `posts/cache.test.ts`. `PlanBand` has no `Date`
 * field, so there is nothing to encode — the one property worth pinning is
 * that a second read does not reach the database.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listPlansQuery = vi.fn();

vi.mock('@/db/queries/plans', () => ({
  listPlans: (...args: unknown[]) => listPlansQuery(...args),
}));

const { listPlans } = await import('./index');

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
  listPlansQuery.mockResolvedValue([
    {
      id: 1,
      code: 'base',
      name: 'Base',
      priceUsdYear: 50,
      programBandMin: 1,
      programBandMax: 10,
      rank: 1,
      includedLeadsMonth: 5,
      featuresJson: null,
    },
  ]);
});

afterEach(() => {
  store.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
});

describe('listPlans', () => {
  it('queries once and serves the rest from the cache', async () => {
    const first = await listPlans();
    const second = await listPlans();
    expect(listPlansQuery).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});
