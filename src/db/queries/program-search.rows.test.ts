/**
 * The two read paths the comparador and the browse page actually call (PR-54).
 *
 * `program-search.order-by.test.ts` pins the ORDER BY and the WHERE — the parts
 * that decide *which* rows and in what order the database returns them.
 * Nothing covered what happens to those rows afterwards, and both functions
 * make a promise there that a refactor could drop silently:
 *
 * - `getOfferingRowsByIds` returns rows **in the order the ids were given**.
 *   The compare columns follow the user's selection, not the database's
 *   convenience, and MySQL's `IN` gives no ordering at all.
 * - `searchProgramSearchRows` runs eight facet queries it can be told to skip.
 *   `withFacets: false` exists because `/comparar` and the detail pages have no
 *   rail to render; a regression there is eight extra queries per request that
 *   nothing would fail on.
 *
 * The stubs stand in for Drizzle's builder rather than a database: these
 * assertions are about the code around the query, and a fake that returns rows
 * is enough to state them.
 */

import { describe, expect, it, vi } from 'vitest';

import type { ProgramSearchRow } from '@/lib/search/row';

import { getOfferingRowsByIds, searchProgramSearchRows } from './program-search';

function row(offeringId: number): ProgramSearchRow {
  return { offeringId, isPublished: true } as unknown as ProgramSearchRow;
}

/** `select().from().where()` awaited directly — what `getOfferingRowsByIds` does. */
function idsDb(rows: ProgramSearchRow[]) {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as never, select, from, where };
}

describe('getOfferingRowsByIds', () => {
  it('returns the rows in the order the ids were given, not the database’s', async () => {
    // Deliberately shuffled: MySQL's `IN` promises no ordering, so a passing
    // test needs the fake to disagree with the request.
    const { db } = idsDb([row(9), row(3), row(7)]);
    const result = await getOfferingRowsByIds([7, 9, 3], { db });
    expect(result.map((r) => r.offeringId)).toEqual([7, 9, 3]);
  });

  it('drops an id that matched nothing rather than leaving a hole', async () => {
    const { db } = idsDb([row(3)]);
    const result = await getOfferingRowsByIds([3, 404], { db });
    expect(result.map((r) => r.offeringId)).toEqual([3]);
  });

  it('short-circuits an empty selection without touching the database', async () => {
    const { db, select } = idsDb([]);
    expect(await getOfferingRowsByIds([], { db })).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('returns one row per id even when the caller repeats one', async () => {
    const { db } = idsDb([row(3)]);
    expect((await getOfferingRowsByIds([3, 3], { db })).map((r) => r.offeringId)).toEqual([3, 3]);
  });
});

/**
 * `select().from().where().orderBy().limit().offset()` for the rows,
 * `select().from().where()` for the count and the facets. One stub serves all
 * three by making every builder method return the thenable itself.
 */
function searchDb(rows: ProgramSearchRow[], total: number | null) {
  const calls: string[] = [];

  // The shape is captured per builder, not held in a variable the awaits read
  // later: all three queries are started before any of them resolves, so shared
  // mutable state would hand every await whichever select ran last.
  const builder = (shape: 'rows' | 'count' | 'facet'): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy', 'limit', 'offset', 'groupBy']) {
      self[method] = () => self;
    }
    self.then = (resolve: (value: unknown) => unknown) => {
      const value =
        shape === 'rows' ? rows : shape === 'count' ? (total == null ? [] : [{ total }]) : [];
      return Promise.resolve(value).then(resolve);
    };
    return self;
  };

  const db = {
    select: (columns?: Record<string, unknown>) => {
      // The row query selects everything; the others name their columns.
      const shape = !columns ? 'rows' : 'total' in columns ? 'count' : 'facet';
      calls.push(shape);
      return builder(shape);
    },
  } as never;

  return { db, calls };
}

describe('searchProgramSearchRows', () => {
  it('reports the total the count query returned, not the page length', async () => {
    const { db } = searchDb([row(1), row(2)], 57);
    const result = await searchProgramSearchRows({}, { db, withFacets: false });
    expect(result.total).toBe(57);
    expect(result.rows).toHaveLength(2);
  });

  it('skips the facet queries when the caller has no rail to render', async () => {
    const { db, calls } = searchDb([row(1)], 1);
    const result = await searchProgramSearchRows({}, { db, withFacets: false });
    // Rows and count, and nothing else — no facet counts, no area options.
    expect(calls).toEqual(['rows', 'count']);
    expect(result.facets.areas).toEqual([]);
  });

  it('runs them by default, because the browse page does have one', async () => {
    const { db, calls } = searchDb([row(1)], 1);
    await searchProgramSearchRows({}, { db });
    expect(calls.filter((c) => c === 'facet').length).toBeGreaterThan(1);
  });

  it('reports the page and sort it resolved, so the caller need not re-derive them', async () => {
    const { db } = searchDb([], 0);
    const result = await searchProgramSearchRows(
      { page: 3, sort: 'arancel_asc' } as never,
      { db, withFacets: false },
    );
    expect(result.page).toBe(3);
    expect(result.sort).toBe('arancel_asc');
  });

  it('treats a count query that returned no row as zero rather than NaN', async () => {
    const { db } = searchDb([], null);
    const result = await searchProgramSearchRows({}, { db, withFacets: false });
    expect(result.total).toBe(0);
  });
});
