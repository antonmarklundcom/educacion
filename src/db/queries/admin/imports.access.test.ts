/**
 * The console's gate and its lock (PR-50).
 *
 * `/admin/importaciones` is a page with three buttons that each start something
 * expensive against a government website. Two claims have to hold, and neither
 * is visible from the page:
 *
 * 1. **`editor` or nothing.** The layout's `requireRole` is a backstop; a
 *    Server Action is reachable without ever rendering it (CLAUDE.md rule 4).
 *    Deleting the `requireRole` line in `triggerImportJob` must turn something
 *    red, and this is it.
 * 2. **A source with a run in flight refuses a second one**, before anything is
 *    fetched — the acceptance criterion, and the reason `import_runs` is the
 *    lock rather than a boolean somebody remembers to check.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';
import type { Db } from '@/db';

const editor: SessionUser = {
  id: 7,
  role: 'editor',
  institutionId: null,
  mustChangePassword: false,
};
const institutionUser: SessionUser = {
  ...editor,
  id: 8,
  role: 'institution_admin',
  institutionId: 3,
};

/** Rows `select … from import_runs` answers with. Swapped per test. */
let runningRows: Array<Record<string, unknown>> = [];
let claimed = false;
let collected = false;

vi.mock('@/lib/ingest/sources', () => ({
  collectCones: async () => {
    collected = true;
    return [];
  },
  collectAneaes: async () => {
    collected = true;
    return [];
  },
}));

vi.mock('@/lib/ingest/repository', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/ingest/repository')>('@/lib/ingest/repository');
  return {
    ...actual,
    beginImport: async () => {
      claimed = true;
      return { importRunId: 99, done: Promise.resolve({}) };
    },
  };
});

vi.mock('@/db/queries/curation', () => ({ curate: async () => [] }));

const logged: unknown[] = [];
vi.mock('@/db/queries/admin/activity-log', () => ({
  logActivity: async (_db: unknown, entry: unknown) => {
    logged.push(entry);
  },
}));

/** A `db` whose selects answer `runningRows` and whose writes are recorded. */
function chain(rows: unknown[]): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (value: unknown) => void) => resolve(rows);
        return () => proxy;
      },
    },
  );
  return proxy;
}

const db = {
  select: () => chain(runningRows),
  insert: () => chain([]),
  update: () => chain([]),
} as unknown as Db;

beforeEach(() => {
  runningRows = [];
  claimed = false;
  collected = false;
  logged.length = 0;
});

const { triggerImportJob } = await import('./imports');

function runningRun(source: string) {
  return {
    id: 5,
    source,
    status: 'running',
    startedAt: new Date('2026-08-23T10:00:00Z'),
    finishedAt: null,
    rowsIn: 0,
    rowsNew: 0,
    rowsUnchanged: 0,
    rowsMatched: 0,
    rowsConflicted: 0,
    log: null,
  };
}

describe('who may trigger an import', () => {
  it('lets an editor start one', async () => {
    const result = await triggerImportJob(editor, 'import:cones', db);
    expect(result.importRunId).toBe(99);
    expect(claimed).toBe(true);
  });

  it('refuses an institution user, who is not staff at all', async () => {
    await expect(triggerImportJob(institutionUser, 'import:cones', db)).rejects.toThrow();
    expect(claimed, 'nothing may be claimed for a caller without the role').toBe(false);
  });

  it('refuses an anonymous caller', async () => {
    await expect(triggerImportJob(null, 'curate', db)).rejects.toThrow();
  });

  it('refuses a job name that is not one of the three', async () => {
    await expect(triggerImportJob(editor, 'rm -rf', db)).rejects.toThrow();
    expect(claimed).toBe(false);
  });
});

describe('the lock', () => {
  it('refuses a second import of a source that already has a run open', async () => {
    runningRows = [runningRun('CONES')];
    await expect(triggerImportJob(editor, 'import:cones', db)).rejects.toThrow(/CONES/);
    expect(collected, 'a refused trigger must not crawl the source').toBe(false);
  });

  it('refuses a curate pass while either of its sources is being imported', async () => {
    runningRows = [runningRun('ANEAES')];
    await expect(triggerImportJob(editor, 'curate', db)).rejects.toThrow(/ANEAES/);
  });

  it('lets an unrelated source through — the lock is per source, not global', async () => {
    runningRows = [runningRun('ANEAES')];
    await expect(triggerImportJob(editor, 'import:cones', db)).resolves.toBeTruthy();
  });
});

describe('the record', () => {
  it('lands every accepted trigger in activity_log, against the run it claimed', async () => {
    // PR-52: the row is written after the claim and carries the run id. Before,
    // it went out first, so a lost race left an `activity_log` row saying an
    // import started beside an `import_runs` table that never saw it.
    await triggerImportJob(editor, 'import:cones', db);
    expect(logged).toEqual([
      {
        userId: editor.id,
        entityType: 'import_run',
        entityId: 99,
        action: 'run',
        before: null,
        after: { job: 'import:cones', source: 'CONES', importRunId: 99 },
      },
    ]);
  });

  it('logs a curate pass too, which claims its runs inside itself', async () => {
    await triggerImportJob(editor, 'curate', db);
    expect(logged).toEqual([
      {
        userId: editor.id,
        entityType: 'import_run',
        entityId: null,
        action: 'run',
        before: null,
        after: { job: 'curate' },
      },
    ]);
  });

  it('logs nothing for a trigger it refused', async () => {
    runningRows = [runningRun('CONES')];
    await expect(triggerImportJob(editor, 'import:cones', db)).rejects.toThrow();
    expect(logged).toEqual([]);
  });
});
