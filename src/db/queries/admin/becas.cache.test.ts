/**
 * `createBeca`/`updateBeca`/`archiveBeca` expire the public-read cache
 * (PR-57), in the same shape as `areas.cache.test.ts`.
 *
 * PR-57 put `listBecas`/`getBecaBySlug`/`becaTypeCounts` (`@/lib/becas`)
 * behind `PUBLIC_READ_TAG`. Becas are not in `program_search`, so none of
 * these mutations ever called `rebuildProgramSearch()` — the exception
 * `cache/tags.ts` now lists next to `admin/areas.ts`. Without an explicit
 * expiry, a beca an editor just published would not appear on `/becas` for up
 * to an hour, which is the exact failure mode this PR exists to close.
 *
 * Asserted through the functions, not by scanning their source: a comment
 * that mentions the call reads the same to a grep as a call that makes it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const expirePublicReads = vi.fn();

vi.mock('@/lib/cache', () => ({ expirePublicReads: () => expirePublicReads() }));
vi.mock('./activity-log', () => ({ logActivity: vi.fn(async () => undefined) }));

const { archiveBeca, createBeca, updateBeca } = await import('./becas');

const actor = { id: 1, role: 'editor' as const, institutionId: null, mustChangePassword: false };

const input = {
  slug: null,
  title: 'Beca UNA',
  institutionId: null,
  providerName: 'UNA',
  areaId: null,
  type: 'estatal' as const,
  coverage: 'total' as const,
  amountPyg: null,
  percentage: null,
  summary: 'x'.repeat(10),
  detailsMd: null,
  requirementsMd: null,
  applyUrl: null,
  sourceUrl: 'https://una.py',
  deadline: null,
  status: 'published' as const,
};

/** Enough of a `Db` for one insert or update inside one transaction. */
function fakeDb(existing: Record<string, unknown> | undefined) {
  const insertId = 7;
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

describe('createBeca', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db } = fakeDb(undefined);
    await createBeca(actor, input, db);
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller without the role before touching the database', async () => {
    const { db } = fakeDb(undefined);
    await expect(createBeca(null, input, db)).rejects.toThrow();
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});

describe('updateBeca', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db, set } = fakeDb({ id: 3, slug: 'beca-una', status: 'published' });
    await updateBeca(actor, 3, input, db);
    expect(set).toHaveBeenCalled();
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('does not expire anything when the beca was not there to update', async () => {
    const { db } = fakeDb(undefined);
    await expect(updateBeca(actor, 404, input, db)).rejects.toThrow('Beca no encontrada.');
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});

describe('archiveBeca', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db } = fakeDb({ id: 3, status: 'published' });
    await archiveBeca(actor, 3, db);
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('does not expire anything when the beca was not there to archive', async () => {
    const { db } = fakeDb(undefined);
    await expect(archiveBeca(actor, 404, db)).rejects.toThrow('Beca no encontrada.');
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});
