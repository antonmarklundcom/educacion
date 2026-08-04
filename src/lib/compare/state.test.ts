import { describe, expect, it } from 'vitest';

import { MAX_COMPARE } from '@/lib/search/contract';

import {
  compareCtaLabel,
  compareHref,
  parseCompareIds,
  parseCompareLabels,
  serializeCompareIds,
  toggleCompareId,
} from './state';

describe('parseCompareIds', () => {
  it('reads a comma-separated list in the order it was given', () => {
    expect(parseCompareIds('12,3,45')).toEqual([12, 3, 45]);
  });

  it('accepts repeated params as well as a comma list', () => {
    expect(parseCompareIds(['12', '3,45'])).toEqual([12, 3, 45]);
  });

  it('drops junk members instead of rejecting the whole selection', () => {
    // A stale link with one bad id should still compare the rest.
    expect(parseCompareIds('12,abc,,-4,0,3')).toEqual([12, 3]);
  });

  it('collapses duplicates', () => {
    expect(parseCompareIds('7,7,7,8')).toEqual([7, 8]);
  });

  it('caps a hand-edited URL at the ceiling', () => {
    expect(parseCompareIds('1,2,3,4,5,6,7,8')).toHaveLength(MAX_COMPARE);
  });

  it('is empty for a missing value', () => {
    expect(parseCompareIds(undefined)).toEqual([]);
    expect(parseCompareIds(null)).toEqual([]);
    expect(parseCompareIds('')).toEqual([]);
  });
});

describe('toggleCompareId', () => {
  it('adds and removes', () => {
    expect(toggleCompareId([1, 2], 3)).toEqual({ ids: [1, 2, 3], rejected: false });
    expect(toggleCompareId([1, 2, 3], 2)).toEqual({ ids: [1, 3], rejected: false });
  });

  it('refuses the one past the ceiling rather than evicting an earlier pick', () => {
    const full = [1, 2, 3, 4];
    const result = toggleCompareId(full, 5, 4);
    expect(result.rejected).toBe(true);
    expect(result.ids).toEqual(full);
  });

  it('always allows removing, even when full', () => {
    expect(toggleCompareId([1, 2, 3, 4], 1, 4)).toEqual({ ids: [2, 3, 4], rejected: false });
  });

  it('does not mutate the input', () => {
    const ids = [1, 2];
    toggleCompareId(ids, 3);
    expect(ids).toEqual([1, 2]);
  });
});

describe('parseCompareLabels', () => {
  it('round-trips what the provider stores', () => {
    const entries = [
      {
        id: 4,
        programName: 'Programa de prueba 004',
        institutionShort: 'IP-004',
        brandColor: null,
      },
    ];
    expect(parseCompareLabels(JSON.stringify(entries))).toEqual(entries);
  });

  it('degrades to no labels on a corrupted mirror rather than throwing', () => {
    expect(parseCompareLabels('{not json')).toEqual([]);
    expect(parseCompareLabels('{"id":1}')).toEqual([]);
    expect(parseCompareLabels(null)).toEqual([]);
  });

  it('drops entries missing the fields it would have to render', () => {
    const raw = JSON.stringify([{ id: 1 }, { id: 'x', programName: 'a', institutionShort: 'b' }]);
    expect(parseCompareLabels(raw)).toEqual([]);
  });
});

describe('links and labels', () => {
  it('serializes and links to /comparar with the ids param', () => {
    expect(serializeCompareIds([3, 1])).toBe('3,1');
    expect(compareHref([3, 1])).toBe('/comparar?ids=3,1');
  });

  it('links to the bare page for an empty selection', () => {
    expect(compareHref([])).toBe('/comparar');
  });

  it('agrees with itself about singular and plural', () => {
    expect(compareCtaLabel(1)).toBe('Comparar 1 carrera');
    expect(compareCtaLabel(3)).toBe('Comparar 3 carreras');
  });
});
