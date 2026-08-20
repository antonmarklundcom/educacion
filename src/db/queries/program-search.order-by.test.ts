/**
 * The ordering promise, pinned against the code that actually serves pages.
 *
 * `architecture.md` §17.1: `plan_rank` is appended **after** the user's sort
 * key, always. `engine.test.ts` asserts that of `compareRows`, and PR-46's
 * independent review found the gap: `compareRows` belongs to `searchInMemory`,
 * whose only non-test caller is `scripts/search-bench.ts`. Every real request
 * goes through `buildOrderBy`, and moving `desc(plan_rank)` to the front of it
 * — paid placement overriding every user sort on every page — left 1111/1111
 * green.
 *
 * `buildOrderBy` is a pure function returning an array of SQL fragments, so
 * this needs no database: it renders them through Drizzle's own dialect and
 * asserts where the tiebreakers sit.
 */

import { describe, expect, it } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';

import { SORT_KEYS, type SortKey } from '@/lib/search/contract';
import { parseQuery } from '@/lib/search/normalize';

import { TIEBREAKERS, buildConditions, buildOrderBy } from './program-search';

const dialect = new MySqlDialect();
const NO_QUERY = parseQuery(undefined);
const WITH_QUERY = parseQuery('medicina');

function render(fragments: { toString?: () => string }[]): string[] {
  return fragments.map((fragment) => dialect.sqlToQuery(fragment as never).sql);
}

describe('buildOrderBy', () => {
  it.each(SORT_KEYS)('puts the tiebreakers last for %s', (sort: SortKey) => {
    for (const query of [NO_QUERY, WITH_QUERY]) {
      const clauses = render(buildOrderBy(sort, query) as never[]);
      const tiebreakers = render(TIEBREAKERS as never[]);

      expect(
        clauses.slice(-tiebreakers.length),
        `${sort}: the tiebreakers must be the tail, not the head`,
      ).toEqual(tiebreakers);
    }
  });

  it.each(SORT_KEYS)('never lets plan_rank precede the user’s key for %s', (sort: SortKey) => {
    // The mutation the review used, stated as its own assertion because it is
    // the one a reader will look for. "Never first" is *not* the property: with
    // `relevancia` and no free text there is no user key at all — every row
    // ties (§4.1) — and `plan_rank` legitimately leads the tiebreakers. What
    // must never happen is `plan_rank` ahead of a clause the user asked for.
    for (const query of [NO_QUERY, WITH_QUERY]) {
      const clauses = render(buildOrderBy(sort, query) as never[]);
      const userClauses = clauses.length - TIEBREAKERS.length;
      if (userClauses === 0) continue; // relevancia with no query: nothing to precede.
      expect(clauses[0], `${sort} leads with plan_rank`).not.toMatch(/plan_rank/i);
    }
  });

  it('is the tiebreakers alone when there is nothing to sort on', () => {
    // Recorded rather than left implicit: this is the state `/carreras` is in
    // by default, and the reason `plan_rank` is worth auditing at all.
    expect(render(buildOrderBy('relevancia', NO_QUERY) as never[])[0]).toMatch(/plan_rank/i);
  });

  it('has exactly one plan_rank clause, and it is a tiebreaker', () => {
    for (const sort of SORT_KEYS) {
      const clauses = render(buildOrderBy(sort, NO_QUERY) as never[]);
      const positions = clauses
        .map((clause, index) => (/plan_rank/i.test(clause) ? index : -1))
        .filter((index) => index >= 0);
      expect(positions, sort).toHaveLength(1);
      expect(positions[0], `${sort}: plan_rank must sit inside the tiebreakers`).toBe(
        clauses.length - TIEBREAKERS.length,
      );
    }
  });

  it('ends every sort with offering_id, so paging is total', () => {
    // Without a total order the same row can appear on two pages or on none.
    for (const sort of SORT_KEYS) {
      const clauses = render(buildOrderBy(sort, NO_QUERY) as never[]);
      expect(clauses[clauses.length - 1], sort).toMatch(/offering_id/i);
    }
  });

  it('leads with the user’s key, for the sorts that have a column of their own', () => {
    expect(render(buildOrderBy('nombre_asc', NO_QUERY) as never[])[0]).toMatch(/program_name/i);
    expect(render(buildOrderBy('institucion_asc', NO_QUERY) as never[])[0]).toMatch(
      /institution_short/i,
    );
    expect(render(buildOrderBy('duracion_asc', NO_QUERY) as never[])[0]).toMatch(
      /duration_months/i,
    );
    // Price sorts lead with the nulls-last guard, then the cost itself.
    const byCost = render(buildOrderBy('arancel_asc', NO_QUERY) as never[]);
    expect(byCost[0]).toMatch(/is null/i);
    expect(byCost[1]).toMatch(/asc/i);
  });

  it('adds the relevance clauses only when there is a query to rank on', () => {
    // With no free text every row ties and the tiebreakers decide — which is
    // §4.1's premise, and the reason plan_rank matters as much as it does.
    expect(render(buildOrderBy('relevancia', NO_QUERY) as never[])).toEqual(
      render(TIEBREAKERS as never[]),
    );
    expect(render(buildOrderBy('relevancia', WITH_QUERY) as never[]).length).toBeGreaterThan(
      TIEBREAKERS.length,
    );
  });
});

describe('the filtered set is decided without plan_rank', () => {
  /**
   * §17.1's other half: a paid placement reorders results, it never adds one.
   * `engine.test.ts` asserts this of the in-memory mirror; the SQL path's
   * version is that `plan_rank` appears in the ORDER BY and nowhere in the
   * WHERE, so no filter combination can be widened by it.
   */
  const TODAY = '2026-08-20';

  it.each([
    ['no filters', {}],
    ['an area filter', { areaSlugs: ['salud'] }],
    ['a modality filter', { modalities: ['presencial'] }],
    ['a cost range', { annualCostMin: 1_000_000, annualCostMax: 9_000_000 }],
    ['a duration cap', { durationMonthsMax: 48 }],
    ['a free-only filter', { isFree: true }],
    ['an institution scope', { institutionSlug: 'una' }],
  ])('%s', (_label, filters) => {
    for (const query of [NO_QUERY, WITH_QUERY]) {
      const rendered = render(
        buildConditions(filters as never, { today: TODAY, query }) as never[],
      ).join(' and ');
      expect(rendered).not.toContain('plan_rank');
    }
  });

  it('and plan_rank really is in the ORDER BY, so the assertion above is not vacuous', () => {
    expect(render(TIEBREAKERS as never[]).join(', ')).toContain('plan_rank');
  });
});
