/**
 * The JSON wire form of a `program_search` row (PR-43).
 *
 * `unstable_cache` round-trips its payload through `JSON.stringify` /
 * `JSON.parse`, so a `Date` in a cached value is a `Date` on the request that
 * filled the entry and a string on every request that hits it. Two columns of
 * `program_search` are `Date`s — `price_verified_at` and `updated_at`; every
 * other date column is already `mode: 'string'`. Those two are converted here,
 * explicitly, in one place.
 *
 * The guard against a *third* one appearing is in `wire.test.ts`: it encodes
 * the synthetic fixture — typed `ProgramSearchRow`, so a new column has to be
 * added there for the file to compile — and asserts that nothing in the result
 * is a `Date` and that the whole thing survives a JSON round-trip unchanged.
 */

import type { ProgramSearchRow } from '@/lib/search/row';

/** A `program_search` row with its two `Date` columns as ISO-8601 strings. */
export type ProgramSearchRowWire = Omit<ProgramSearchRow, 'priceVerifiedAt' | 'updatedAt'> & {
  priceVerifiedAt: string | null;
  updatedAt: string;
};

export function encodeProgramSearchRow(row: ProgramSearchRow): ProgramSearchRowWire {
  return {
    ...row,
    priceVerifiedAt: row.priceVerifiedAt ? row.priceVerifiedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function decodeProgramSearchRow(wire: ProgramSearchRowWire): ProgramSearchRow {
  return {
    ...wire,
    priceVerifiedAt: wire.priceVerifiedAt ? new Date(wire.priceVerifiedAt) : null,
    updatedAt: new Date(wire.updatedAt),
  };
}
