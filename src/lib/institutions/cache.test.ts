/**
 * The institution read paths through the cache (PR-43), and — as much as the
 * point of the file — the one that is deliberately *not* cached.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listInstitutionsQuery = vi.fn();
const getInstitutionBySlugQuery = vi.fn();
const getWhatsappNumbersQuery = vi.fn();

vi.mock('@/db/queries/institutions', () => ({
  listInstitutions: (...args: unknown[]) => listInstitutionsQuery(...args),
  getInstitutionBySlug: (...args: unknown[]) => getInstitutionBySlugQuery(...args),
  getWhatsappNumbers: (...args: unknown[]) => getWhatsappNumbersQuery(...args),
}));

const { getInstitutionBySlug, getWhatsappNumbers, listInstitutions } = await import('./index');

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
  listInstitutionsQuery.mockResolvedValue([{ id: 1, slug: 'x', cityNames: ['Asunción'] }]);
  getInstitutionBySlugQuery.mockImplementation(async (slug: string) => ({ id: 1, slug }));
  getWhatsappNumbersQuery.mockResolvedValue(new Map([[1, '+595...']]));
});

afterEach(() => {
  store.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
});

describe('listInstitutions', () => {
  it('queries once and serves the rest from the cache', async () => {
    await listInstitutions();
    const cached = await listInstitutions();
    expect(listInstitutionsQuery).toHaveBeenCalledTimes(1);
    expect(cached[0].cityNames).toEqual(['Asunción']);
  });
});

describe('getInstitutionBySlug', () => {
  it('keys by slug rather than sharing one entry', async () => {
    await getInstitutionBySlug('una');
    await getInstitutionBySlug('uca');
    await getInstitutionBySlug('una');
    expect(getInstitutionBySlugQuery).toHaveBeenCalledTimes(2);
  });

  it('caches a 404 without turning it into something else', async () => {
    getInstitutionBySlugQuery.mockResolvedValue(null);
    expect(await getInstitutionBySlug('no-existe')).toBeNull();
    expect(await getInstitutionBySlug('no-existe')).toBeNull();
    expect(getInstitutionBySlugQuery).toHaveBeenCalledTimes(1);
  });
});

describe('getWhatsappNumbers', () => {
  it('is read live on every request', async () => {
    // architecture.md §6.2: the number under a WhatsApp CTA is not allowed to
    // have a refresh clock. It is also a `Map`, which JSON would flatten to
    // `{}` — so caching it would have been wrong twice over.
    await getWhatsappNumbers([1]);
    await getWhatsappNumbers([1]);
    expect(getWhatsappNumbersQuery).toHaveBeenCalledTimes(2);
  });
});
