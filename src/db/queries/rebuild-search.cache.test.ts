/**
 * The invalidation funnel (PR-43).
 *
 * `src/lib/cache/tags.ts` argues that one cache tag is enough *because* every
 * write that can change a public read goes through `rebuildProgramSearch()`.
 * That argument is only worth anything if this function actually expires the
 * tag, so this file holds it to it: delete the `expirePublicReads()` call and
 * the first test goes red.
 *
 * The database is a proxy that answers every query builder chain with an empty
 * result, so the rebuild runs end to end over zero offerings — which is all
 * this file is about. The row-building logic has its own tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const expirePublicReads = vi.fn();
vi.mock('@/lib/cache', () => ({ expirePublicReads: () => expirePublicReads() }));

/** Any drizzle chain, ending in an empty array. */
function emptyQuery(): unknown {
  const handler: ProxyHandler<() => void> = {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (rows: unknown[]) => unknown) => resolve([]);
      return () => proxy;
    },
    apply: () => proxy,
  };
  const proxy: unknown = new Proxy(() => {}, handler);
  return proxy;
}

const fakeDb = {
  select: () => emptyQuery(),
  delete: () => emptyQuery(),
  insert: () => emptyQuery(),
  transaction: (run: (tx: unknown) => Promise<unknown>) => run(fakeDb),
};

vi.mock('@/db', () => ({ db: fakeDb }));

const { rebuildProgramSearch } = await import('./rebuild-search');

beforeEach(() => {
  expirePublicReads.mockClear();
});

describe('rebuildProgramSearch', () => {
  it('expires the public-read cache, so no cached page outlives the rebuild', async () => {
    await rebuildProgramSearch();
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('expires it on the explicit-connection path too', async () => {
    // Every admin and panel write passes its own transaction handle in. If the
    // expiry hung off the default-connection branch it would fire for the cron
    // and for nothing else.
    await rebuildProgramSearch({ db: fakeDb as never });
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('does not expire the cache when the rebuild throws', async () => {
    const failing = {
      ...fakeDb,
      transaction: () => Promise.reject(new Error('deadlock')),
    };
    await expect(rebuildProgramSearch({ db: failing as never })).rejects.toThrow('deadlock');
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});
