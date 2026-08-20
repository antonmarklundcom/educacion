/**
 * Facet, sort and pagination semantics, over the synthetic dataset.
 *
 * The expected counts are recomputed here with plain array filters rather than
 * by calling back into the engine, so a bug in `matchesFilters` cannot make the
 * assertions agree with it.
 *
 * These run against the in-memory engine. The SQL engine is the same semantics
 * translated into MySQL and is exercised by `npm run search:bench -- --verify`
 * against a throwaway database — see the PR body.
 */

import { describe, expect, it } from 'vitest';

import { makeSyntheticRows, SYNTHETIC_AREA_OPTIONS } from './__fixtures__/synthetic';
import type { SearchFilters } from './contract';
import { compareRows, isPriceFilterable, searchInMemory, sortableAnnualCost } from './engine';
import { parseQuery } from './normalize';
import type { ProgramSearchRow } from './row';

const NOW = new Date('2026-08-02T12:00:00Z');
const ROWS = makeSyntheticRows(2_000, { now: NOW });
const PUBLISHED = ROWS.filter((row) => row.isPublished);

/** No free text — the state in which every row ties on relevance (§4.1). */
const EMPTY_QUERY = parseQuery(undefined);

const run = (filters: SearchFilters) =>
  searchInMemory(ROWS, filters, { now: NOW, areas: SYNTHETIC_AREA_OPTIONS });

const countBy = (rows: ProgramSearchRow[], value: (row: ProgramSearchRow) => string | null) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = value(row);
    if (key == null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const optionCount = (options: { value: string; count: number }[], value: string) =>
  options.find((option) => option.value === value)?.count ?? 0;

describe('visibility', () => {
  it('never returns an unpublished row', () => {
    const { total } = run({ pageSize: 100 });
    expect(total).toBe(PUBLISHED.length);
    expect(total).toBeLessThan(ROWS.length);
  });
});

describe('facets', () => {
  it('returns all eight groups', () => {
    const { facets } = run({});
    expect(Object.keys(facets).sort()).toEqual(
      [
        'accreditationStatuses',
        'areas',
        'cities',
        'enrollmentStatuses',
        'levels',
        'managements',
        'modalities',
        'shifts',
      ].sort(),
    );
  });

  it('counts the unfiltered dataset correctly', () => {
    const { facets } = run({});
    const expected = countBy(PUBLISHED, (row) => row.level);
    for (const [level, count] of expected) {
      expect(optionCount(facets.levels, level)).toBe(count);
    }
  });

  it('counts a group with every OTHER filter applied but not its own', () => {
    const filters: SearchFilters = { levels: ['grado'], modalities: ['presencial'] };
    const { facets } = run(filters);

    // The level group ignores the level filter but keeps the modality filter.
    const scopeForLevels = PUBLISHED.filter((row) => row.modality === 'presencial');
    for (const [level, count] of countBy(scopeForLevels, (row) => row.level)) {
      expect(optionCount(facets.levels, level)).toBe(count);
    }

    // The modality group ignores the modality filter but keeps the level one.
    const scopeForModalities = PUBLISHED.filter((row) => row.level === 'grado');
    for (const [modality, count] of countBy(scopeForModalities, (row) => row.modality)) {
      expect(optionCount(facets.modalities, modality)).toBe(count);
    }
  });

  it('does not zero a group’s siblings when one of its options is selected', () => {
    const before = run({});
    const after = run({ levels: ['grado'] });
    for (const option of after.facets.levels) {
      expect(option.count).toBe(optionCount(before.facets.levels, option.value));
    }
    expect(after.facets.levels.filter((option) => option.count > 0).length).toBeGreaterThan(1);
  });

  it('marks the selected options', () => {
    const { facets } = run({ levels: ['grado'], citySlugs: ['ciudad-de-prueba-001'] });
    expect(facets.levels.find((option) => option.value === 'grado')?.selected).toBe(true);
    expect(facets.levels.find((option) => option.value === 'maestria')?.selected).toBe(false);
    expect(facets.cities.find((option) => option.value === 'ciudad-de-prueba-001')?.selected).toBe(
      true,
    );
  });

  it('keeps the fixed vocabularies whole and labelled, zero counts included', () => {
    const { facets } = run({ q: 'programa de prueba 00001' });
    expect(facets.levels).toHaveLength(5);
    expect(facets.shifts).toHaveLength(4);
    expect(facets.accreditationStatuses).toHaveLength(5);
    expect(facets.accreditationStatuses.find((option) => option.value === 'sin_datos')?.label).toBe(
      'Sin datos de acreditación',
    );
  });

  it('labels areas from the taxonomy and cities from the data', () => {
    const { facets } = run({});
    expect(facets.areas).toHaveLength(SYNTHETIC_AREA_OPTIONS.length);
    expect(facets.areas[0].label).toBe('Área de prueba 001');
    expect(facets.cities[0].label).toMatch(/^Ciudad de prueba/);
    expect(facets.cities.every((option) => option.count > 0)).toBe(true);
  });

  it('cross-filters the price filters into the facet counts too', () => {
    const filters: SearchFilters = { isFree: true };
    const { facets } = run(filters);
    const scope = PUBLISHED.filter((row) => isPriceFilterable(row) && row.isFree);
    for (const [level, count] of countBy(scope, (row) => row.level)) {
      expect(optionCount(facets.levels, level)).toBe(count);
    }
  });
});

describe('filters', () => {
  it('ORs within a group and ANDs across groups', () => {
    const { total } = run({ levels: ['grado', 'maestria'], managements: ['publica'] });
    const expected = PUBLISHED.filter(
      (row) => ['grado', 'maestria'].includes(row.level) && row.management === 'publica',
    ).length;
    expect(total).toBe(expected);
  });

  it('excludes rows with no price at all from an arancel range', () => {
    const { results, total } = run({ annualCostMin: 1, pageSize: 100 });
    const expected = PUBLISHED.filter((row) => {
      const cost = sortableAnnualCost(row);
      return cost != null && cost >= 1;
    }).length;
    expect(total).toBe(expected);
    expect(results.every((result) => result.price.hasAmount)).toBe(true);
    expect(results.every((result) => (result.price.annualCost ?? 0) >= 1)).toBe(true);
  });

  /**
   * **This test asserted the opposite before PR-33.** While a stale arancel was
   * hidden, letting one into a price-filtered page meant filtering on a number
   * the reader could not see. Now that the number is shown with a visible
   * "dato desactualizado", excluding it would make a visible price
   * unfilterable — and would quietly drop the cheap options a family is
   * hunting for out of "hasta Gs. X".
   */
  it('includes a stale arancel in a price-filtered page, marked as stale', () => {
    const stale = PUBLISHED.filter(
      (row) =>
        row.priceVerifiedAt != null &&
        row.priceCurrency === 'PYG' &&
        row.annualCostGs != null &&
        row.priceExpiresOn != null &&
        row.priceExpiresOn <= NOW.toISOString().slice(0, 10),
    );
    expect(stale.length).toBeGreaterThan(0); // the fixture really does contain some

    // Counted rather than paged through: the property is about the filter, and
    // the fixture is larger than one page.
    const { total } = run({ annualCostMax: 999_999_999, pageSize: 1 });
    const everyPricedRow = PUBLISHED.filter(
      (row) => row.priceCurrency === 'PYG' && row.annualCostGs != null,
    ).length;
    expect(total).toBe(everyPricedRow);

    // And when one does surface, it is labelled.
    const { results } = run({ annualCostMax: 999_999_999, pageSize: 400 });
    const shown = results.filter((result) =>
      stale.some((row) => row.offeringId === result.offeringId),
    );
    expect(shown.every((result) => result.price.freshness === 'stale')).toBe(true);
  });

  it('is accent-insensitive on free text', () => {
    const accented = run({ q: 'Área de prueba 002' });
    const plain = run({ q: 'area de prueba 002' });
    expect(accented.total).toBe(plain.total);
    expect(accented.total).toBeGreaterThan(0);
  });

  it('finds an institution by its acronym', () => {
    const { results, total } = run({ q: 'IP07', pageSize: 100 });
    expect(total).toBeGreaterThan(0);
    expect(results.every((result) => result.institutionShort === 'IP07')).toBe(true);
  });

  it('falls back to institution_short for a query below the FULLTEXT floor', () => {
    // "ZA" is two characters: InnoDB never indexed it, so only the LIKE
    // fallback can find it.
    const { results, total } = run({ q: 'ZA', pageSize: 100 });
    expect(total).toBeGreaterThan(0);
    expect(results.every((result) => result.institutionShort === 'ZA')).toBe(true);
  });

  it('lets a two-letter word rank but never filter when the query has real words', () => {
    // "de" and "la" are two-letter Spanish function words. Requiring them to
    // prefix an acronym would empty the page.
    const withStopwords = run({ q: 'carrera de prueba 007' });
    const without = run({ q: 'carrera prueba 007' });
    expect(withStopwords.total).toBe(without.total);
    expect(withStopwords.total).toBeGreaterThan(0);
  });

  it('ranks the acronym match first when it cannot filter', () => {
    const { results, total } = run({ q: 'ZA carrera de prueba 007', pageSize: 10 });
    expect(total).toBeGreaterThan(results.length);
    expect(results[0]?.institutionShort).toBe('ZA');
  });

  it('requires every indexable token', () => {
    const both = run({ q: 'ciudad de prueba 003 carrera de prueba 007' });
    const one = run({ q: 'ciudad de prueba 003' });
    expect(both.total).toBeGreaterThan(0);
    expect(both.total).toBeLessThan(one.total);
  });

  it('scopes to one institution for the institution page', () => {
    const { results, total } = run({ institutionSlug: 'institucion-de-prueba-005' });
    expect(total).toBeGreaterThan(0);
    expect(results.every((r) => r.institutionSlug === 'institucion-de-prueba-005')).toBe(true);
  });
});

describe('sorting', () => {
  it('sorts by annual cost with undisplayable prices last, in both directions', () => {
    for (const sort of ['arancel_asc', 'arancel_desc'] as const) {
      const { results } = run({ sort, pageSize: 100 });
      const costs = results.map((result) => result.price.annualCost);
      const firstNull = costs.findIndex((cost) => cost == null);
      const present = firstNull === -1 ? costs : costs.slice(0, firstNull);
      expect(present.every((cost) => cost != null)).toBe(true);
      const sorted = [...(present as number[])].sort((a, b) =>
        sort === 'arancel_asc' ? a - b : b - a,
      );
      expect(present).toEqual(sorted);
    }
  });

  it('sorts by duration with unknown durations last', () => {
    const { results } = run({ sort: 'duracion_asc', pageSize: 100 });
    const durations = results.map((result) => result.durationMonths);
    const known = durations.filter((value): value is number => value != null);
    expect(known).toEqual([...known].sort((a, b) => a - b));
    expect(durations.slice(known.length).every((value) => value == null)).toBe(true);
  });

  it('sorts alphabetically by program and by institution', () => {
    const byName = run({ sort: 'nombre_asc', pageSize: 50 }).results.map((r) => r.programName);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'es')));

    const byInstitution = run({ sort: 'institucion_asc', pageSize: 50 }).results.map(
      (r) => r.institutionShort,
    );
    expect(byInstitution).toEqual([...byInstitution].sort((a, b) => a.localeCompare(b, 'es')));
  });

  /**
   * PR-27's headline promise, asserted as a **property of the comparator**
   * rather than by scanning a page.
   *
   * The previous version of this test read the first 100 results of
   * `arancel_asc` and checked they were monotonic. The independent review of
   * PR-27 (PR-46) showed it was vacuous: promoting `plan_rank` to the *primary*
   * sort key — paid placement fully overriding the user's choice, the single
   * thing PR-27 exists to prevent — left all 28 tests green, because the
   * fixture has enough rank-2 rows to fill page one and no adjacent pair ever
   * crossed a rank boundary.
   *
   * Comparing every cross-rank pair directly cannot be satisfied that way.
   */
  it('uses plan_rank only as a tiebreaker, never to override the chosen sort', () => {
    const cheaperButFree = PUBLISHED.filter((row) => sortableAnnualCost(row) != null);
    let pairs = 0;

    for (const low of cheaperButFree) {
      for (const high of cheaperButFree) {
        const lowCost = sortableAnnualCost(low)!;
        const highCost = sortableAnnualCost(high)!;
        // The dangerous shape: the cheaper row is the one WITHOUT the placement.
        if (!(lowCost < highCost && low.planRank < high.planRank)) continue;
        pairs += 1;
        expect(
          compareRows(low, high, 'arancel_asc', EMPTY_QUERY),
          `${low.offeringId} (${lowCost}, rank ${low.planRank}) must precede ${high.offeringId} (${highCost}, rank ${high.planRank})`,
        ).toBeLessThan(0);
        if (pairs > 500) return; // The property holds pairwise; 500 is plenty.
      }
    }

    expect(pairs, 'the fixture must contain the shape being tested').toBeGreaterThan(0);
  });

  it('applies plan_rank only after every user-chosen key, for every sort', () => {
    // The same property across the whole sort vocabulary, not just `arancel_asc`.
    const ranked = PUBLISHED.find((row) => row.planRank > 0)!;
    const unranked = PUBLISHED.find((row) => row.planRank === 0)!;
    expect(ranked && unranked).toBeTruthy();

    // Two rows that differ on the sort key AND on rank: the sort key decides.
    const byName = [ranked, unranked].sort((a, b) => a.programName.localeCompare(b.programName));
    expect(compareRows(byName[0], byName[1], 'nombre_asc', EMPTY_QUERY)).toBeLessThan(0);

    // Two rows identical on the sort key: now, and only now, rank decides.
    const twin = { ...unranked, programName: ranked.programName };
    expect(compareRows(ranked, twin, 'nombre_asc', EMPTY_QUERY)).toBeLessThan(0);
  });

  it('does not let plan_rank pull an excluded row into a filtered result set', () => {
    // The old version asserted only that every row matched the filter, which a
    // filter test already does — it stayed green with the tiebreaker deleted.
    // This one names a rank-2 row the filter excludes and looks for it.
    const { results, total } = run({ levels: ['doctorado'], pageSize: 100 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.level === 'doctorado')).toBe(true);

    const boostedOutsider = PUBLISHED.find((row) => row.planRank > 0 && row.level !== 'doctorado');
    expect(boostedOutsider, 'the fixture must contain a boosted excluded row').toBeDefined();
    expect(results.map((r) => r.offeringId)).not.toContain(boostedOutsider!.offeringId);
    expect(total).toBe(PUBLISHED.filter((row) => row.level === 'doctorado').length);
  });

  it('ranks the better free-text match first', () => {
    const { results } = run({ q: 'programa de prueba 00101', pageSize: 5 });
    expect(results[0]?.programName).toBe('Programa de prueba 00101');
  });
});

describe('pagination', () => {
  it('pages without gaps or repeats and keeps a stable order', () => {
    const pageSize = 25;
    const first = run({ pageSize, page: 1 });
    const second = run({ pageSize, page: 2 });
    const wholeRun = run({ pageSize: 50, page: 1 });

    expect(first.results).toHaveLength(pageSize);
    expect(second.results).toHaveLength(pageSize);
    expect(wholeRun.results.map((r) => r.offeringId)).toEqual([
      ...first.results.map((r) => r.offeringId),
      ...second.results.map((r) => r.offeringId),
    ]);
    expect(first.total).toBe(second.total);
  });

  it('returns an empty page past the end without lying about the total', () => {
    const response = run({ pageSize: 20, page: 10_000 });
    expect(response.results).toEqual([]);
    expect(response.total).toBe(PUBLISHED.length);
    expect(response.page).toBe(10_000);
  });

  it('reports the resolved sort and page size back to the caller', () => {
    const response = run({});
    expect(response.sort).toBe('relevancia');
    expect(response.pageSize).toBe(20);
    expect(response.page).toBe(1);
  });
});
