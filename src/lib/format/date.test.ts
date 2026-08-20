/**
 * The Asunción day helpers (PR-44).
 *
 * The independent review found `/admin/actividad`'s date filter parsing its
 * bounds as UTC midnight while rendering every row in `America/Asuncion`: an
 * entry the operator saw as 20/08 22:30 is stored 21/08 01:30Z, so "hasta el
 * 20" dropped it and "desde el 20" swept in three hours of the 19th. These
 * tests are the boundary, stated as instants.
 */

import { describe, expect, it } from 'vitest';

import { ASUNCION_UTC_OFFSET, asuncionToday, nextAsuncionDay, parseAsuncionDay } from './date';

describe('parseAsuncionDay', () => {
  it('starts the day at 03:00 UTC, not at midnight UTC', () => {
    expect(parseAsuncionDay('2026-08-20')?.toISOString()).toBe('2026-08-20T03:00:00.000Z');
  });

  it('rejects anything that is not a plain date rather than guessing', () => {
    for (const value of ['', '2026-8-20', '20/08/2026', '2026-08-20T10:00', 'ayer', '2026-08']) {
      expect(parseAsuncionDay(value)).toBeUndefined();
    }
  });

  it('rejects a well-shaped date that is not a date', () => {
    expect(parseAsuncionDay('2026-13-45')).toBeUndefined();
  });

  it('states the offset as a constant rather than computing a DST rule', () => {
    // Paraguay abolished DST in 2024 and is permanently UTC−03:00.
    expect(ASUNCION_UTC_OFFSET).toBe('-03:00');
  });
});

describe('nextAsuncionDay', () => {
  it('is the exclusive bound that keeps the whole day in range', () => {
    const start = parseAsuncionDay('2026-08-20')!;
    const end = nextAsuncionDay(start);
    expect(end.toISOString()).toBe('2026-08-21T03:00:00.000Z');

    // The row an operator reads as "20/08 22:30" in Asunción.
    const lateOnTheTwentieth = new Date('2026-08-21T01:30:00.000Z');
    expect(lateOnTheTwentieth.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(
      lateOnTheTwentieth.getTime(),
      'a UTC-midnight bound would have dropped this row',
    ).toBeLessThan(end.getTime());

    // And the row they read as "19/08 22:30" stays out of it.
    const lateOnTheNineteenth = new Date('2026-08-20T01:30:00.000Z');
    expect(lateOnTheNineteenth.getTime()).toBeLessThan(start.getTime());
  });
});

describe('asuncionToday', () => {
  it('is still yesterday for the last three hours of UTC', () => {
    // 21/08 01:30Z is 20/08 22:30 in Asunción. This is the whole reason the
    // helper exists: `toISOString().slice(0, 10)` answers 2026-08-21 here, and
    // the PR-29 review traced a subscription losing its features on its final
    // evening to exactly that hour.
    expect(asuncionToday(new Date('2026-08-21T01:30:00.000Z'))).toBe('2026-08-20');
    expect(new Date('2026-08-21T01:30:00.000Z').toISOString().slice(0, 10)).toBe('2026-08-21');
  });

  it('rolls over at 03:00Z, not at midnight', () => {
    expect(asuncionToday(new Date('2026-08-21T02:59:59.999Z'))).toBe('2026-08-20');
    expect(asuncionToday(new Date('2026-08-21T03:00:00.000Z'))).toBe('2026-08-21');
  });

  it('agrees with UTC for the rest of the day', () => {
    expect(asuncionToday(new Date('2026-08-20T12:00:00.000Z'))).toBe('2026-08-20');
  });

  it('crosses the month and the year at the same boundary', () => {
    expect(asuncionToday(new Date('2027-01-01T01:00:00.000Z'))).toBe('2026-12-31');
    expect(asuncionToday(new Date('2027-01-01T03:00:00.000Z'))).toBe('2027-01-01');
  });

  it('names the day `parseAsuncionDay` would round-trip', () => {
    // The two helpers have to use the same offset or a filter built from
    // "today" would exclude today.
    const now = new Date('2026-08-21T01:30:00.000Z');
    const day = parseAsuncionDay(asuncionToday(now))!;
    expect(now.getTime()).toBeGreaterThanOrEqual(day.getTime());
    expect(now.getTime()).toBeLessThan(nextAsuncionDay(day).getTime());
  });
});
