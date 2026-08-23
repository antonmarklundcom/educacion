/**
 * The import lock (PR-50).
 *
 * `/admin/importaciones`' acceptance criterion is that a running import cannot
 * be started twice, with `import_runs` as the lock. What that reduces to in
 * code is one conditional insert and one branch on how many rows it wrote —
 * and the branch is the part a refactor can quietly invert, so it is pinned
 * here. The database is a stub: this proves the decision, not MySQL's locking,
 * which is why the SQL text is asserted too.
 */

import { describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';

import { ImportAlreadyRunningError, beginImport, claimImportRun } from './repository';

/** A `db` whose only ability is `execute`, answering with one insert header. */
/** The `sql` template Drizzle hands `db.execute`, as much of it as we read. */
interface ExecutedQuery {
  queryChunks: unknown[];
}

function dbWith(header: { affectedRows: number; insertId?: number }) {
  const execute = vi.fn(async (query: ExecutedQuery) => {
    void query;
    return [header, []];
  });
  return { db: { execute } as unknown as Db, execute };
}

describe('claimImportRun', () => {
  it('returns the new run id when it won the claim', async () => {
    const { db } = dbWith({ affectedRows: 1, insertId: 42 });
    await expect(claimImportRun(db, 'CONES')).resolves.toBe(42);
  });

  it('refuses when the insert wrote nothing — somebody else holds the run', async () => {
    const { db } = dbWith({ affectedRows: 0 });
    await expect(claimImportRun(db, 'CONES')).rejects.toBeInstanceOf(ImportAlreadyRunningError);
  });

  it('names the source in the refusal, in the Spanish an operator reads', async () => {
    const { db } = dbWith({ affectedRows: 0 });
    await expect(claimImportRun(db, 'ANEAES')).rejects.toThrow(/ANEAES/);
  });

  it('decides inside one statement, conditioned on no run being open', async () => {
    const { db, execute } = dbWith({ affectedRows: 1, insertId: 1 });
    await claimImportRun(db, 'CONES');
    expect(execute).toHaveBeenCalledTimes(1);

    // The chunks a Drizzle `sql` template is built from: strings and column
    // references. Only the strings are readable, and they are the clause.
    const query = execute.mock.calls[0]![0];
    const text = query.queryChunks
      .map((chunk) => {
        const value = (chunk as { value?: unknown }).value;
        return Array.isArray(value) ? value.join(' ') : '';
      })
      .join(' ');
    expect(text).toContain('not exists');
    expect(text).toContain("'running'");
  });
});

describe('beginImport', () => {
  it('does not fetch anything when the claim is refused', async () => {
    const { db } = dbWith({ affectedRows: 0 });
    const produce = vi.fn(async () => []);

    await expect(beginImport(db, 'CONES', produce, { exclusive: true })).rejects.toBeInstanceOf(
      ImportAlreadyRunningError,
    );
    expect(produce, 'a refused claim must not start a second crawl').not.toHaveBeenCalled();
  });
});
