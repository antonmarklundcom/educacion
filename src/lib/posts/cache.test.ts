/**
 * The post read paths through the cache (PR-57), in the same shape as
 * `becas/cache.test.ts`.
 *
 * The property worth pinning here is scheduling (`admin/posts.ts`'s
 * `publishedAtFor`): a post whose `published_at` is now in the past must
 * become visible without a write in between, which is exactly why both keys
 * carry the date.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listPublishedPostsQuery = vi.fn();
const getPostBySlugQuery = vi.fn();

vi.mock('@/db/queries/posts', () => ({
  listPublishedPosts: (...args: unknown[]) => listPublishedPostsQuery(...args),
  getPostBySlug: (...args: unknown[]) => getPostBySlugQuery(...args),
}));

const { getPostBySlug, listPublishedPosts } = await import('./index');

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

const BEFORE_SCHEDULED = new Date('2027-04-01T10:00:00Z');
const AFTER_SCHEDULED = new Date('2027-04-15T10:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  store = installIncrementalCache();
  listPublishedPostsQuery.mockResolvedValue([
    {
      id: 1,
      slug: 'un-articulo',
      title: 'Un artículo',
      excerpt: 'x',
      authorName: 'Redacción',
      publishedAt: new Date('2027-01-01T00:00:00Z'),
    },
  ]);
  getPostBySlugQuery.mockImplementation(async () => ({
    id: 1,
    slug: 'un-articulo',
    title: 'Un artículo',
    excerpt: 'x',
    bodyMd: '# hola',
    authorName: 'Redacción',
    authorBio: null,
    publishedAt: new Date('2027-01-01T00:00:00Z'),
    updatedAt: new Date('2027-01-02T00:00:00Z'),
  }));
});

afterEach(() => {
  store.clear();
  delete (globalThis as Record<string, unknown>).__incrementalCache;
});

describe('listPublishedPosts', () => {
  it('queries once for the same day and serves the Date fields back as Dates', async () => {
    const [first] = await listPublishedPosts({ now: BEFORE_SCHEDULED });
    const [second] = await listPublishedPosts({ now: BEFORE_SCHEDULED });
    expect(listPublishedPostsQuery).toHaveBeenCalledTimes(1);
    expect(second.publishedAt).toBeInstanceOf(Date);
    expect(second.publishedAt.toISOString()).toBe(first.publishedAt.toISOString());
  });

  it('rolls the key over at midnight, so a scheduled post is not stuck behind yesterday’s cache', async () => {
    await listPublishedPosts({ now: BEFORE_SCHEDULED });
    await listPublishedPosts({ now: AFTER_SCHEDULED });
    expect(listPublishedPostsQuery).toHaveBeenCalledTimes(2);
  });
});

describe('getPostBySlug', () => {
  it('queries once per slug per day', async () => {
    await getPostBySlug('un-articulo', BEFORE_SCHEDULED);
    await getPostBySlug('un-articulo', BEFORE_SCHEDULED);
    expect(getPostBySlugQuery).toHaveBeenCalledTimes(1);
  });

  it('caches a 404 without turning it into something else', async () => {
    getPostBySlugQuery.mockResolvedValue(null);
    expect(await getPostBySlug('no-existe', BEFORE_SCHEDULED)).toBeNull();
    expect(await getPostBySlug('no-existe', BEFORE_SCHEDULED)).toBeNull();
    expect(getPostBySlugQuery).toHaveBeenCalledTimes(1);
  });

  it('rolls over at midnight — a post scheduled for today does not 404 past its own date', async () => {
    getPostBySlugQuery.mockResolvedValueOnce(null); // not yet published, as of BEFORE_SCHEDULED
    expect(await getPostBySlug('un-articulo', BEFORE_SCHEDULED)).toBeNull();

    // A day the query would now return the post for.
    expect(await getPostBySlug('un-articulo', AFTER_SCHEDULED)).not.toBeNull();
    expect(getPostBySlugQuery).toHaveBeenCalledTimes(2);
  });
});
