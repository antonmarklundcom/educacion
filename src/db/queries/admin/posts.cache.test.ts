/**
 * `createPost`/`updatePost`/`archivePost` expire the public-read cache
 * (PR-57), in the same shape as `becas.cache.test.ts` and
 * `areas.cache.test.ts`.
 *
 * PR-57 put `listPublishedPosts`/`getPostBySlug` (`@/lib/posts`) behind
 * `PUBLIC_READ_TAG`. Posts are not in `program_search`, so none of these
 * mutations ever called `rebuildProgramSearch()` — the exception
 * `cache/tags.ts` now lists next to `admin/areas.ts` and `admin/becas.ts`.
 * Without an explicit expiry, a post an editor just published would not
 * appear on `/blog` for up to an hour.
 *
 * Asserted through the functions, not by scanning their source.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const expirePublicReads = vi.fn();

vi.mock('@/lib/cache', () => ({ expirePublicReads: () => expirePublicReads() }));
vi.mock('./activity-log', () => ({ logActivity: vi.fn(async () => undefined) }));

const { archivePost, createPost, updatePost } = await import('./posts');

const actor = { id: 1, role: 'editor' as const, institutionId: null, mustChangePassword: false };

const input = {
  slug: null,
  title: 'Un artículo',
  excerpt: 'x'.repeat(10),
  bodyMd: '# hola',
  authorName: 'Redacción',
  authorBio: null,
  status: 'published' as const,
  publishedAt: null,
};

/** Enough of a `Db` for one insert or update inside one transaction. */
function fakeDb(existing: Record<string, unknown> | undefined) {
  const insertId = 9;
  const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (existing ? [existing] : []) }) }),
    }),
    insert: () => ({ values: async () => [{ insertId }] }),
    update: () => ({ set }),
  };
  return {
    db: { transaction: async (run: (t: unknown) => Promise<unknown>) => run(tx) } as never,
    set,
  };
}

beforeEach(() => {
  expirePublicReads.mockReset();
});

describe('createPost', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db } = fakeDb(undefined);
    await createPost(actor, input, db);
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller without the role before touching the database', async () => {
    const { db } = fakeDb(undefined);
    await expect(createPost(null, input, db)).rejects.toThrow();
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});

describe('updatePost', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db, set } = fakeDb({ id: 3, slug: 'un-articulo', status: 'published' });
    await updatePost(actor, 3, input, db);
    expect(set).toHaveBeenCalled();
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('does not expire anything when the post was not there to update', async () => {
    const { db } = fakeDb(undefined);
    await expect(updatePost(actor, 404, input, db)).rejects.toThrow('Post no encontrado.');
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});

describe('archivePost', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db } = fakeDb({ id: 3, status: 'published' });
    await archivePost(actor, 3, db);
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('does not expire anything when the post was not there to archive', async () => {
    const { db } = fakeDb(undefined);
    await expect(archivePost(actor, 404, db)).rejects.toThrow('Post no encontrado.');
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});
