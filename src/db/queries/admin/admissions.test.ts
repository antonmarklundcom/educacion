/**
 * `deriveEnrollmentStatus` — the rule that turns a convocatoria into the badge
 * on a result card. Pure and tested here because PR-33's daily cron will read
 * the same function, and the two must not be able to disagree about a boundary
 * day.
 */

import { describe, expect, it } from 'vitest';

import { deriveEnrollmentStatus, todayIso } from './admissions';

const WINDOW = {
  registrationOpens: '2026-11-01',
  registrationCloses: '2027-01-31',
  isActive: true,
};

describe('deriveEnrollmentStatus', () => {
  it('is "próximamente" before the window opens', () => {
    expect(deriveEnrollmentStatus(WINDOW, '2026-10-31')).toBe('proximamente');
  });

  it('is "abiertas" on the opening day — the window includes its boundaries', () => {
    expect(deriveEnrollmentStatus(WINDOW, '2026-11-01')).toBe('abiertas');
    expect(deriveEnrollmentStatus(WINDOW, '2026-12-15')).toBe('abiertas');
  });

  it('is still "abiertas" on the closing day', () => {
    expect(deriveEnrollmentStatus(WINDOW, '2027-01-31')).toBe('abiertas');
  });

  it('is "cerradas" the day after', () => {
    expect(deriveEnrollmentStatus(WINDOW, '2027-02-01')).toBe('cerradas');
  });

  /**
   * The anti-fabrication case. A convocatoria with no dates tells us nothing
   * about whether enrolment is open, and "cerradas" would be a claim — a
   * student reading it would skip a carrera that may well be enrolling.
   */
  it('is "sin_datos" when the period carries no dates at all', () => {
    expect(
      deriveEnrollmentStatus(
        { registrationOpens: null, registrationCloses: null, isActive: true },
        '2026-12-01',
      ),
    ).toBe('sin_datos');
  });

  it('is "sin_datos" when the convocatoria is not active, never "cerradas"', () => {
    expect(deriveEnrollmentStatus({ ...WINDOW, isActive: false }, '2026-12-01')).toBe('sin_datos');
  });

  it('handles a one-sided window: only a closing date', () => {
    const openEnded = { registrationOpens: null, registrationCloses: '2027-01-31', isActive: true };
    expect(deriveEnrollmentStatus(openEnded, '2026-12-01')).toBe('abiertas');
    expect(deriveEnrollmentStatus(openEnded, '2027-02-01')).toBe('cerradas');
  });

  it('handles a one-sided window: only an opening date', () => {
    const openEnded = { registrationOpens: '2026-11-01', registrationCloses: null, isActive: true };
    expect(deriveEnrollmentStatus(openEnded, '2026-10-01')).toBe('proximamente');
    expect(deriveEnrollmentStatus(openEnded, '2026-11-02')).toBe('abiertas');
  });
});

describe('todayIso', () => {
  it('is a UTC date-only string, matching how the date columns are stored', () => {
    expect(todayIso(new Date('2026-08-08T23:30:00.000Z'))).toBe('2026-08-08');
  });
});
