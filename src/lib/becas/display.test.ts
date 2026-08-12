/**
 * The two things a beca page can get dishonestly wrong: what it covers, and
 * whether it is still open.
 */

import { describe, expect, it } from 'vitest';

import { coverageLabel, daysToDeadline, deadlineLabel } from './display';

const NOW = new Date('2026-08-12T10:00:00.000Z');

describe('coverageLabel', () => {
  it('says what a full scholarship covers', () => {
    expect(coverageLabel({ coverage: 'total', amountPyg: null, percentage: null })).toBe(
      'Cubre el 100% del arancel',
    );
  });

  it('never renders an unknown coverage as nothing', () => {
    // A blank here is the field a reader fills in optimistically.
    expect(coverageLabel({ coverage: 'sin_datos', amountPyg: null, percentage: null })).toBe(
      'No sabemos cuánto cubre',
    );
  });

  it('says "no sabemos cuánto" when a partial beca has no percentage', () => {
    expect(coverageLabel({ coverage: 'parcial', amountPyg: null, percentage: null })).toMatch(
      /no sabemos cuánto/i,
    );
  });

  it('formats a fixed amount in guaraníes', () => {
    expect(coverageLabel({ coverage: 'monto_fijo', amountPyg: 2_500_000, percentage: null })).toBe(
      'Gs. 2.500.000 en total',
    );
  });
});

describe('deadlines', () => {
  it('counts whole days', () => {
    expect(daysToDeadline('2026-08-19', '2026-08-12')).toBe(7);
    expect(daysToDeadline(null, '2026-08-12')).toBeNull();
  });

  it('reads like a person would say it', () => {
    expect(deadlineLabel('2026-08-12', NOW)).toBe('Cierra hoy');
    expect(deadlineLabel('2026-08-13', NOW)).toBe('Cierra mañana');
    expect(deadlineLabel('2026-08-20', NOW)).toBe('Cierra en 8 días');
    expect(deadlineLabel('2026-12-01', NOW)).toBe('Cierra el 2026-12-01');
    expect(deadlineLabel(null, NOW)).toBe('Convocatoria permanente');
  });

  it('says "cerrada" once the date has passed', () => {
    expect(deadlineLabel('2026-08-11', NOW)).toBe('Cerrada');
  });
});
