/**
 * The total-cost arithmetic (PR-48).
 *
 * The claims this module makes, each with a test that fails without it:
 *
 * - a total appears **only** when every component exists;
 * - a gap produces a partial that carries **no figure**;
 * - a stale arancel still totals, and the staleness travels with the result;
 * - a fractional year is a gap, not a rounding;
 * - the comparador ordering puts incomplete rows last and never compares
 *   across currencies.
 */

import { describe, expect, it } from 'vitest';

import type { PriceSummary } from '@/lib/search';

import { partialLabel, totalCostLabel } from './total-cost-display';
import { cheapestTotalIndex, compareTotalCost, totalCost } from './total-cost';

const VERIFIED = new Date('2026-05-01T00:00:00Z');

function price(overrides: Partial<PriceSummary> = {}): PriceSummary {
  return {
    freshness: 'fresh',
    hasAmount: true,
    isFree: false,
    currency: 'PYG',
    matricula: 500_000,
    monthlyFee: 400_000,
    installmentsPerYear: 10,
    admissionFee: 150_000,
    annualCost: 4_500_000,
    verifiedAt: VERIFIED,
    ...overrides,
  };
}

describe('totalCost — the complete case', () => {
  it('composes matrícula, cuotas and derecho de examen over the duration', () => {
    const total = totalCost(price(), 60);

    // 5 years × (500.000 + 400.000 × 10) + 150.000
    expect(total.kind).toBe('complete');
    expect(total.total).toBe(22_650_000);
    expect(total.years).toBe(5);
    expect(total.installments).toBe(50);
    expect(total.annualCost).toBe(4_500_000);
    expect(total.missing).toEqual([]);
  });

  it('agrees with the annual_cost the comparador already sorts on', () => {
    // data-model.md: annual cost = matrícula + cuota × cuotas/año. A total that
    // treated matrícula as a one-off would disagree with that column.
    const p = price();
    expect(totalCost(p, 12).total).toBe(p.annualCost! + p.admissionFee!);
  });

  it('totals a free carrera as its derecho de examen and nothing else', () => {
    const total = totalCost(
      price({ isFree: true, matricula: null, monthlyFee: null, installmentsPerYear: null }),
      48,
    );
    expect(total.kind).toBe('complete');
    expect(total.total).toBe(150_000);
    expect(total.installments).toBe(0);
  });
});

describe('totalCost — every component or no number at all', () => {
  it.each([
    ['matricula', { matricula: null }, 'matricula'],
    ['cuota', { monthlyFee: null }, 'cuota'],
    ['cuotas por año', { installmentsPerYear: null }, 'cuotas_por_ano'],
    ['derecho de examen', { admissionFee: null }, 'derecho_examen'],
  ])('refuses a total with no %s, and names the gap', (_label, overrides, gap) => {
    const total = totalCost(price(overrides as Partial<PriceSummary>), 60);
    expect(total.kind).toBe('partial');
    expect(total.total).toBeNull();
    expect(total.missing).toContain(gap);
  });

  it('refuses a total with no duration', () => {
    const total = totalCost(price(), null);
    expect(total.kind).toBe('partial');
    expect(total.missing).toEqual(['duracion']);
  });

  it('treats a duration that is not whole years as a gap, never a rounding', () => {
    // 30 months bills either three matrículas or two and a half. The data does
    // not say which, so we do not pick one.
    const total = totalCost(price(), 30);
    expect(total.kind).toBe('partial');
    expect(total.missing).toEqual(['duracion_parcial']);
    expect(total.total).toBeNull();
  });

  it('says "sin datos de arancel" when there is no price row at all', () => {
    const total = totalCost(price({ hasAmount: false, currency: null }), 60);
    expect(total.missing).toEqual(['arancel']);
  });

  it('never puts a figure on a partial — not even a lower bound', () => {
    const total = totalCost(price({ admissionFee: null }), 60);
    expect(totalCostLabel(total)).toBe('sin datos de derecho de examen — total incompleto');
    expect(totalCostLabel(total)).not.toMatch(/\d/);
  });

  it('lists several gaps in reading order', () => {
    const total = totalCost(price({ matricula: null, admissionFee: null }), 60);
    expect(partialLabel(total)).toBe(
      'sin datos de matrícula y sin datos de derecho de examen — total incompleto',
    );
  });
});

describe('totalCost — staleness travels, it never hides', () => {
  it('still totals a stale arancel and keeps its date (CLAUDE.md rule 3)', () => {
    const total = totalCost(price({ freshness: 'stale' }), 60);
    expect(total.kind).toBe('complete');
    expect(total.total).toBe(22_650_000);
    expect(total.freshness).toBe('stale');
    expect(total.verifiedAt).toEqual(VERIFIED);
  });

  it('carries an unknown verification date as unknown rather than as fresh', () => {
    const total = totalCost(price({ freshness: 'unknown', verifiedAt: null }), 60);
    expect(total.freshness).toBe('unknown');
    expect(total.verifiedAt).toBeNull();
  });
});

describe('the comparador ordering', () => {
  const cheap = totalCost(price({ monthlyFee: 100_000 }), 60);
  const dear = totalCost(price(), 60);
  const incomplete = totalCost(price({ admissionFee: null }), 60);
  const usd = totalCost(
    price({ currency: 'USD', matricula: 1, monthlyFee: 1, admissionFee: 1 }),
    60,
  );

  it('sorts cheapest first', () => {
    expect(compareTotalCost(cheap, dear)).toBeLessThan(0);
  });

  it('puts incomplete rows last', () => {
    expect(compareTotalCost(incomplete, dear)).toBeGreaterThan(0);
    expect(compareTotalCost(incomplete, cheap)).toBeGreaterThan(0);
    expect([dear, incomplete, cheap].sort(compareTotalCost)).toEqual([cheap, dear, incomplete]);
  });

  it('sorts USD after guaraníes instead of applying an FX rate', () => {
    // USD 3 is cheaper than any guaraní figure by magnitude alone; comparing
    // them would be the conversion data-model.md refuses to make.
    expect(compareTotalCost(usd, cheap)).toBeGreaterThan(0);
  });
});

describe('cheapestTotalIndex', () => {
  const cheap = totalCost(price({ monthlyFee: 100_000 }), 60);
  const dear = totalCost(price(), 60);
  const incomplete = totalCost(price({ admissionFee: null }), 60);

  it('marks the single lowest complete total', () => {
    expect(cheapestTotalIndex([dear, cheap, incomplete])).toBe(1);
  });

  it('marks nothing when the lowest total is tied', () => {
    expect(cheapestTotalIndex([cheap, totalCost(price({ monthlyFee: 100_000 }), 60)])).toBeNull();
  });

  it('marks nothing when only one column has a total to compare', () => {
    expect(cheapestTotalIndex([cheap, incomplete])).toBeNull();
  });

  it('marks nothing across currencies rather than claiming an FX rate', () => {
    const usd = totalCost(
      price({ currency: 'USD', matricula: 1, monthlyFee: 1, admissionFee: 1 }),
      60,
    );
    expect(cheapestTotalIndex([cheap, usd])).toBeNull();
  });
});
