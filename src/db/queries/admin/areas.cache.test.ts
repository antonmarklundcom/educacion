/**
 * `updateArea` expires the public-read cache (PR-55).
 *
 * PR-55 put `getAreaBySlug` and `listCareersByArea` behind
 * `PUBLIC_READ_TAG`, whose stated invalidation rule is "almost every write that
 * can change a public read goes through `rebuildProgramSearch()`, which expires
 * it" (`cache/tags.ts`). This module is one of the exceptions the same file
 * insists on listing rather than waving at: an área's name is not in
 * `program_search`, so there is correctly no rebuild here — and without an
 * explicit expiry the 150 words an editor writes to lift a hub out of
 * `noindex` (`seo.md` §4.1) would wait up to an hour to appear.
 *
 * Asserted through the function, not by scanning its source: a comment that
 * mentions the call reads the same to a grep as a call that makes it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const expirePublicReads = vi.fn();

vi.mock('@/lib/cache', () => ({ expirePublicReads: () => expirePublicReads() }));
vi.mock('./activity-log', () => ({ logActivity: vi.fn(async () => undefined) }));

const { updateArea } = await import('./areas');

const actor = { id: 1, role: 'editor' as const, institutionId: null, mustChangePassword: false };
const input = { nameEs: 'Salud', descriptionMd: 'x'.repeat(20), sortOrder: 1 };

/** Enough of a `Db` for one `update` inside one transaction. */
function fakeDb(existing: Record<string, unknown> | undefined) {
  const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
  const tx = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (existing ? [existing] : []) }) }),
    }),
    update: () => ({ set }),
  };
  return {
    db: { transaction: async (run: (t: unknown) => Promise<void>) => run(tx) } as never,
    set,
  };
}

beforeEach(() => {
  expirePublicReads.mockReset();
});

describe('updateArea', () => {
  it('expires the public reads after a write that committed', async () => {
    const { db, set } = fakeDb({ id: 3, nameEs: 'Antes', descriptionMd: null, sortOrder: 0 });
    await updateArea(actor, 3, input, db);
    expect(set).toHaveBeenCalled();
    expect(expirePublicReads).toHaveBeenCalledTimes(1);
  });

  it('does not expire anything when the área was not there to update', async () => {
    const { db } = fakeDb(undefined);
    await expect(updateArea(actor, 404, input, db)).rejects.toThrow('Área no encontrada.');
    expect(expirePublicReads).not.toHaveBeenCalled();
  });

  it('refuses a caller without the role before touching the database', async () => {
    const { db, set } = fakeDb({ id: 3 });
    await expect(updateArea(null, 3, input, db)).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
    expect(expirePublicReads).not.toHaveBeenCalled();
  });
});
