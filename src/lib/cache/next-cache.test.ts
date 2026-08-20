/**
 * The cache primitive, exercised against a real `unstable_cache`.
 *
 * These tests do not stub `unstable_cache`. They install a minimal incremental
 * cache on `globalThis.__incrementalCache` — the exact hook Next itself looks
 * for — so the code under test is the shipped code path, including the
 * `JSON.stringify` on the way in and the `JSON.parse` on the way out. That is
 * the whole point: the defect this module exists to prevent only appears on the
 * **second** call, and a fake that returns the object it was given cannot show
 * it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cachedRead,
  isMissingIncrementalCache,
  isMissingWorkStore,
  passthrough,
} from './next-cache';

/* -------------------------------------------------------------------------- */
/* A minimal stand-in for Next's incremental cache                            */
/* -------------------------------------------------------------------------- */

interface Entry {
  body: string;
}

function installIncrementalCache() {
  const store = new Map<string, Entry>();
  const cache = {
    isOnDemandRevalidate: false,
    async generateSimpleCacheKey(key: string) {
      return key;
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return { isStale: false, value: { kind: 'FETCH', data: { body: entry.body } } };
    },
    async set(key: string, value: { data: { body: string } }) {
      store.set(key, { body: value.data.body });
    },
  };
  (globalThis as Record<string, unknown>).__incrementalCache = cache;
  return { store, clear: () => store.clear() };
}

let installed: ReturnType<typeof installIncrementalCache>;

beforeEach(() => {
  installed = installIncrementalCache();
});

afterEach(() => {
  installed.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */

describe('cachedRead', () => {
  it('reads the loader once and serves the second call from the cache', async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    const read = () =>
      cachedRead<{ n: number }, { n: number }>({
        name: 'probe',
        key: 'k',
        load,
        decode: passthrough,
      });

    expect(await read()).toEqual({ n: 1 });
    expect(await read()).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('separates entries by key', async () => {
    const load = vi.fn(async (n: number) => ({ n }));
    const read = (key: string, n: number) =>
      cachedRead<{ n: number }, { n: number }>({
        name: 'probe',
        key,
        load: () => load(n),
        decode: passthrough,
      });

    expect(await read('a', 1)).toEqual({ n: 1 });
    expect(await read('b', 2)).toEqual({ n: 2 });
    expect(await read('a', 99)).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('runs decode on the cached read as well as the fresh one', async () => {
    const decode = vi.fn((wire: { n: number }) => ({ doubled: wire.n * 2 }));
    const read = () =>
      cachedRead<{ n: number }, { doubled: number }>({
        name: 'probe',
        key: 'k',
        load: async () => ({ n: 21 }),
        decode,
      });

    expect(await read()).toEqual({ doubled: 42 });
    expect(await read()).toEqual({ doubled: 42 });
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('derives a time-dependent answer from the request, not from the fill', async () => {
    // The property PR-43 must hold: a label computed from a cached timestamp
    // changes when the clock does, even though the entry did not.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const load = vi.fn(async () => ({ verifiedAt: '2025-06-01T00:00:00Z' }));
    const read = () =>
      cachedRead<{ verifiedAt: string }, { stale: boolean }>({
        name: 'probe',
        key: 'k',
        load,
        decode: (wire) => ({
          stale: Date.now() - Date.parse(wire.verifiedAt) > 365 * 24 * 3600 * 1000,
        }),
      });

    expect(await read()).toEqual({ stale: false });

    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    expect(await read()).toEqual({ stale: true });
    expect(load, 'the entry must be the same one, not a refill').toHaveBeenCalledTimes(1);
  });

  it('hands decode the same shape on a hit as on a miss', async () => {
    const seen: unknown[] = [];
    const read = () =>
      cachedRead<{ list: number[]; nested: { flag: boolean } }, null>({
        name: 'probe',
        key: 'k',
        load: async () => ({ list: [1, 2], nested: { flag: true } }),
        decode: (wire) => {
          seen.push(wire);
          return null;
        },
      });

    await read();
    await read();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(seen[1]);
  });

  it('lets a loader error through instead of treating it as a cache miss', async () => {
    await expect(
      cachedRead<{ n: number }, { n: number }>({
        name: 'probe',
        key: 'k',
        load: async () => {
          throw new Error('database down');
        },
        decode: passthrough,
      }),
    ).rejects.toThrow('database down');
  });

  it('reads uncached where there is no incremental cache at all', async () => {
    delete (globalThis as Record<string, unknown>).__incrementalCache;
    const load = vi.fn(async () => ({ n: 1 }));
    const read = () =>
      cachedRead<{ n: number }, { n: number }>({
        name: 'probe',
        key: 'k',
        load,
        decode: passthrough,
      });

    expect(await read()).toEqual({ n: 1 });
    expect(await read()).toEqual({ n: 1 });
    // No cache in this process, so every call is a real read — which is what a
    // `tsx` script and a unit test need.
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('the Next invariants we are allowed to swallow', () => {
  function nextError(code: string): Error {
    const error = new Error(`Invariant ${code}`);
    Object.defineProperty(error, '__NEXT_ERROR_CODE', { value: code });
    return error;
  }

  it('recognises the missing incremental cache, and nothing else', () => {
    expect(isMissingIncrementalCache(nextError('E469'))).toBe(true);
    // E7 is `revalidateTag` during render — a real bug that must not be eaten.
    expect(isMissingIncrementalCache(nextError('E7'))).toBe(false);
    expect(isMissingIncrementalCache(new Error('incrementalCache missing'))).toBe(false);
    expect(isMissingIncrementalCache(null)).toBe(false);
    expect(isMissingIncrementalCache('E469')).toBe(false);
  });

  it('recognises the missing work store, and nothing else', () => {
    expect(isMissingWorkStore(nextError('E263'))).toBe(true);
    expect(isMissingWorkStore(nextError('E7'))).toBe(false);
    expect(isMissingWorkStore(nextError('E469'))).toBe(false);
    expect(isMissingWorkStore(undefined)).toBe(false);
  });
});
