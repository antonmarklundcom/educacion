import { describe, expect, it } from 'vitest';

import { DEFAULT_RANGE_DAYS, fillDays, parseRangeDays, toRange } from './range';

const NOW = new Date('2026-08-04T18:30:00Z');

describe('parseRangeDays', () => {
  it('accepts the offered ranges and falls back for everything else', () => {
    expect(parseRangeDays('7')).toBe(7);
    expect(parseRangeDays('90')).toBe(90);
    expect(parseRangeDays(['30'])).toBe(30);
    for (const raw of ['365', 'abc', '', undefined, '-7']) {
      expect(parseRangeDays(raw), String(raw)).toBe(DEFAULT_RANGE_DAYS);
    }
  });
});

describe('toRange', () => {
  it('includes today whole and starts days-1 days back, at UTC midnight', () => {
    const range = toRange(7, NOW);
    expect(range.since.toISOString()).toBe('2026-07-29T00:00:00.000Z');
    expect(range.until.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('spans exactly `days` day-buckets', () => {
    for (const days of [7, 30, 90] as const) {
      const range = toRange(days, NOW);
      const spanned = (range.until.getTime() - range.since.getTime()) / (24 * 60 * 60 * 1000);
      expect(spanned).toBe(days);
    }
  });

  it('is half-open, so an event at midnight belongs to exactly one bucket', () => {
    const range = toRange(7, NOW);
    // `until` is a boundary the query excludes; the day it opens is tomorrow's.
    expect(range.until.getTime() % (24 * 60 * 60 * 1000)).toBe(0);
  });

  it('does not move with the local clock — the range is UTC', () => {
    const lateAsuncion = new Date('2026-08-04T02:00:00Z'); // 22:00 the 3rd in PY
    expect(toRange(7, lateAsuncion).until.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });
});

describe('fillDays', () => {
  it('fills the days the query did not return with a measured zero', () => {
    const range = toRange(7, NOW);
    const filled = fillDays(range, [{ day: '2026-08-01', events: 3 }]);

    expect(filled).toHaveLength(7);
    expect(filled[0].day).toBe('2026-07-29');
    expect(filled[6].day).toBe('2026-08-04');
    expect(filled.find((row) => row.day === '2026-08-01')?.events).toBe(3);
    expect(filled.filter((row) => row.events === 0)).toHaveLength(6);
  });

  it('ignores a day outside the range rather than widening it', () => {
    const range = toRange(7, NOW);
    const filled = fillDays(range, [{ day: '2020-01-01', events: 99 }]);
    expect(filled).toHaveLength(7);
    expect(filled.every((row) => row.events === 0)).toBe(true);
  });
});
