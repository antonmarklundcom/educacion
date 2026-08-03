/**
 * These tests guard the two things PR-05 promises.
 *
 * 1. **The raw-layer boundary.** The importer may write to `source_records`
 *    and `import_runs` and to nothing else. This is asserted against a fake db
 *    that records every table it is asked to write, so the test fails if
 *    someone later reaches into `institutions` from here — which is precisely
 *    the shortcut the PR-06 work will be tempted to take.
 *
 * 2. **Idempotency.** Re-running over an unchanged source inserts zero new
 *    rows. The fake models the UNIQUE (source, checksum) constraint, so the
 *    second run behaves the way MySQL would.
 */

import { describe, expect, it } from 'vitest';

import { runImport, writeRawRecords } from './repository';
import type { RawRecord } from './contract';
import type { Db } from '@/db';

interface FakeState {
  /** Every table name touched by an insert or update. */
  written: Set<string>;
  /** `${source}:${checksum}` → row, modelling the unique constraint. */
  rows: Map<string, Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
}

/**
 * A minimal stand-in for the drizzle query builder — enough of the fluent API
 * that `repository.ts` runs unmodified against it. A real MySQL is not
 * available in CI, and the behaviour under test is our logic, not the driver's.
 */
function fakeDb(): { db: Db; state: FakeState } {
  const state: FakeState = { written: new Set(), rows: new Map(), runs: [] };

  const tableName = (table: unknown): string => {
    const symbols = Object.getOwnPropertySymbols(table);
    for (const symbol of symbols) {
      if (String(symbol).includes('Name')) {
        return (table as Record<symbol, unknown>)[symbol] as string;
      }
    }
    return 'unknown';
  };

  const db = {
    insert(table: unknown) {
      const name = tableName(table);
      state.written.add(name);

      return {
        values(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = Array.isArray(rows) ? rows : [rows];

          if (name === 'import_runs') {
            const id = state.runs.length + 1;
            state.runs.push({ id, ...list[0] });
            return Object.assign(Promise.resolve([{ insertId: id }]), {
              onDuplicateKeyUpdate: () => Promise.resolve([{ insertId: id }]),
            });
          }

          const apply = (updateOnDuplicate?: Record<string, unknown>) => {
            for (const row of list) {
              const key = `${row.source}:${row.checksum}`;
              const existing = state.rows.get(key);
              if (existing) {
                if (updateOnDuplicate) Object.assign(existing, updateOnDuplicate);
              } else {
                state.rows.set(key, { ...row });
              }
            }
            return Promise.resolve([{ insertId: 0 }]);
          };

          return Object.assign(apply(undefined) as Promise<unknown>, {
            onDuplicateKeyUpdate: (config: { set: Record<string, unknown> }) => apply(config.set),
          });
        },
      };
    },

    select() {
      return {
        from(table: unknown) {
          const name = tableName(table);
          return {
            where() {
              if (name !== 'source_records') return Promise.resolve([]);
              return Promise.resolve(
                [...state.rows.values()].map((row) => ({ checksum: row.checksum })),
              );
            },
          };
        },
      };
    },

    update(table: unknown) {
      state.written.add(tableName(table));
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              Object.assign(state.runs[state.runs.length - 1] ?? {}, values);
              return Promise.resolve([{}]);
            },
          };
        },
      };
    },
  } as unknown as Db;

  return { db, state };
}

const record = (checksum: string, name: string): RawRecord => ({
  source: 'CONES',
  externalId: null,
  sourceUrl: 'https://source.test/',
  payload: { institutionName: name },
  checksum,
});

describe('writeRawRecords', () => {
  it('collapses records that duplicate within a single run', async () => {
    const { db } = fakeDb();
    const result = await writeRawRecords(
      db,
      [record('aa', 'A'), record('aa', 'A'), record('bb', 'B')],
      1,
      'CONES',
    );

    expect(result.rowsIn).toBe(2);
    expect(result.rowsNew).toBe(2);
  });

  it('refuses records belonging to another source', async () => {
    const { db } = fakeDb();
    await expect(
      writeRawRecords(db, [{ ...record('aa', 'A'), source: 'ANEAES' }], 1, 'CONES'),
    ).rejects.toThrow(/ANEAES/);
  });
});

describe('runImport', () => {
  it('writes only to source_records and import_runs', async () => {
    const { db, state } = fakeDb();
    await runImport(db, 'CONES', async () => [record('aa', 'A')]);

    expect([...state.written].sort()).toEqual(['import_runs', 'source_records']);
  });

  it('is idempotent: a second run over the same source inserts nothing new', async () => {
    const { db, state } = fakeDb();
    const produce = async () => [record('aa', 'A'), record('bb', 'B')];

    const first = await runImport(db, 'CONES', produce);
    expect(first.rowsNew).toBe(2);
    expect(first.rowsUnchanged).toBe(0);

    const second = await runImport(db, 'CONES', produce);
    expect(second.rowsIn).toBe(2);
    expect(second.rowsNew).toBe(0);
    expect(second.rowsUnchanged).toBe(2);

    // The point of the acceptance criterion: no duplicate rows exist.
    expect(state.rows.size).toBe(2);
  });

  it('reports a changed record as new, leaving the old row intact', async () => {
    const { db, state } = fakeDb();
    await runImport(db, 'CONES', async () => [record('aa', 'A')]);
    const second = await runImport(db, 'CONES', async () => [record('cc', 'A renamed')]);

    expect(second.rowsNew).toBe(1);
    // Raw provenance is append-only — the superseded row is still there.
    expect(state.rows.size).toBe(2);
  });

  it('closes the run as failed when the source throws, instead of leaving it running', async () => {
    const { db, state } = fakeDb();
    await expect(
      runImport(db, 'CONES', async () => {
        throw new Error('403 Forbidden');
      }),
    ).rejects.toThrow('403 Forbidden');

    expect(state.runs[0].status).toBe('failed');
    expect(String(state.runs[0].log)).toContain('403 Forbidden');
  });

  it('writes nothing on a dry run', async () => {
    const { db, state } = fakeDb();
    const summary = await runImport(db, 'CONES', async () => [record('aa', 'A')], {
      dryRun: true,
    });

    expect(summary.rowsIn).toBe(1);
    expect(state.written.size).toBe(0);
    expect(state.rows.size).toBe(0);
  });
});
