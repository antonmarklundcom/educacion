/**
 * The round-trip guarantee (PR-43).
 *
 * `unstable_cache` returns the live object on a miss and `JSON.parse` of it on
 * a hit, so anything that does not survive JSON is a bug that only shows up on
 * the *second* request. These tests are the guard: every one of them fails if
 * `encodeProgramSearchRow` stops converting a column.
 */

import { describe, expect, it } from 'vitest';

import { makeSyntheticRows } from '@/lib/search/__fixtures__/synthetic';

import { decodeProgramSearchRow, encodeProgramSearchRow } from './wire';

/** The fixture is typed `ProgramSearchRow`, so a new column has to appear here. */
const ROWS = makeSyntheticRows(24, { now: new Date('2026-08-02T12:00:00Z') });

function deepValues(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const entry of value) deepValues(entry, out);
  } else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const entry of Object.values(value)) deepValues(entry, out);
  } else {
    out.push(value);
  }
  return out;
}

describe('the program_search wire form', () => {
  it('contains no Date anywhere', () => {
    for (const row of ROWS) {
      const dates = deepValues(encodeProgramSearchRow(row)).filter((v) => v instanceof Date);
      expect(dates).toEqual([]);
    }
  });

  it('survives a JSON round-trip unchanged', () => {
    for (const row of ROWS) {
      const wire = encodeProgramSearchRow(row);
      expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);
    }
  });

  it('decodes back to the row it came from', () => {
    for (const row of ROWS) {
      const parsed = JSON.parse(JSON.stringify(encodeProgramSearchRow(row)));
      expect(decodeProgramSearchRow(parsed)).toEqual(row);
    }
  });

  it('keeps a null price_verified_at null rather than turning it into an epoch', () => {
    const unpriced = ROWS.find((row) => row.priceVerifiedAt == null);
    expect(unpriced, 'the fixture must contain an unpriced row').toBeDefined();
    const wire = encodeProgramSearchRow(unpriced!);
    expect(wire.priceVerifiedAt).toBeNull();
    expect(decodeProgramSearchRow(wire).priceVerifiedAt).toBeNull();
  });
});
