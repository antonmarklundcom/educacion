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

import { computeAnnualCost } from '@/db/invariants';
import type { PriceSummary } from '@/lib/search';

import { compareCellLabel, partialLabel, totalCostLabel } from './total-cost-display';
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

  it('refuses a total whose units it cannot name', () => {
    // `program_search.price_currency` is nullable while `matricula_gs` is
    // written independently, so amounts without a currency are representable.
    // Without this the function returns `complete` with `currency: null`, and
    // the comparador cell emits a bare "total incompleto" as a **non-gap** —
    // eligible for the "el más barato" marker with no number in it.
    const total = totalCost(price({ currency: null }), 60);
    expect(total.kind).toBe('partial');
    expect(total.missing).toEqual(['arancel']);
  });

  it('treats a zero duration as no duration', () => {
    // `offerings.duration_months` has a CHECK for this; the denormalized
    // `program_search.duration_months` this module reads does not. 0 % 12 is 0,
    // so without the `<= 0` guard a zero-length carrera totals to its exam fee
    // and presents it as the cost of the whole degree.
    const total = totalCost(price(), 0);
    expect(total.kind).toBe('partial');
    expect(total.missing).toEqual(['duracion']);
  });

  it.each([0, 25, 1.5])(
    'refuses an impossible cuotas-per-year of %s instead of multiplying by it',
    (installmentsPerYear) => {
      // The money bug PR-48 shipped. `prices_installments_range` caps this at
      // 1–24 but `program_search` carries no CHECK, and `computeAnnualCost`
      // multiplies by `coalesce(installments_per_year, 0)` — so a 0 does not
      // fail, it deletes every cuota. Gs. 22.650.000 rendered as Gs. 2.650.000:
      // `complete`, no gap, no warning, eligible for "el más barato".
      const total = totalCost(price({ installmentsPerYear }), 60);
      expect(total.kind).toBe('partial');
      expect(total.total).toBeNull();
      expect(total.missing).toEqual(['cuotas_invalidas']);
      expect(totalCostLabel(total)).toContain('no es un número posible');
      expect(totalCostLabel(total)).not.toMatch(/Gs\./);
    },
  );

  it('reports an impossible cuotas-per-year as undetermined, not as absent data', () => {
    // There is a number on file; "sin datos de cuotas" would be false about the
    // institution's record. Same split as `duracion_parcial`.
    const label = totalCostLabel(totalCost(price({ installmentsPerYear: 0 }), 60));
    expect(label).not.toContain('sin datos');
  });

  it('accepts the ends of the allowed range', () => {
    for (const installmentsPerYear of [1, 24]) {
      expect(totalCost(price({ installmentsPerYear }), 60).kind).toBe('complete');
    }
  });

  it('refuses a row that is free and priced at the same time, rather than dropping the fee', () => {
    // `prices_free_has_no_fees` forbids this on `prices`; `program_search`
    // carries no such CHECK. Trusting the flag would turn a Gs. 22.650.000
    // carrera into a Gs. 150.000 one.
    const total = totalCost(price({ isFree: true }), 60);
    expect(total.kind).toBe('partial');
    expect(total.missing).toEqual(['incoherente']);
    expect(totalCostLabel(total)).toContain('gratuito y a la vez tiene montos cargados');
  });

  it('names an undetermined case as undetermined, never as missing data', () => {
    // The institution's record is complete here. Saying "sin datos de duración"
    // about a row that has a duration is a false statement about them.
    const label = totalCostLabel(totalCost(price(), 30));
    expect(label).toContain('no dura un número entero de años');
    expect(label).not.toContain('sin datos');
  });

  it('orders the gaps the same way however the checks happen to run', () => {
    const total = totalCost(price({ matricula: null, admissionFee: null }), null);
    expect(total.missing).toEqual(['matricula', 'derecho_examen', 'duracion']);
  });

  it('carries staleness onto a partial too, so a later consumer cannot read it as fresh', () => {
    const total = totalCost(price({ freshness: 'stale', admissionFee: null }), 60);
    expect(total.freshness).toBe('stale');
    expect(total.verifiedAt).toEqual(VERIFIED);
  });

  it('never puts a figure on a partial — not even a lower bound', () => {
    const total = totalCost(price({ admissionFee: null }), 60);
    expect(totalCostLabel(total)).toBe('sin datos de derecho de examen — total incompleto');
    expect(totalCostLabel(total)).not.toMatch(/\d/);
  });

  it('lists several gaps in reading order, saying "sin datos de" once', () => {
    const total = totalCost(price({ matricula: null, admissionFee: null }), 60);
    expect(partialLabel(total)).toBe(
      'sin datos de matrícula y derecho de examen — total incompleto',
    );
  });

  it('keeps the list a list of nouns when the cuotas gap is in it', () => {
    // Every gap has to read as a noun phrase after one "sin datos de".
    // `cuotas_por_ano` was a clause until PR-48b, which produced "sin datos de
    // matrícula y cuántas cuotas se pagan por año".
    const total = totalCost(price({ matricula: null, installmentsPerYear: null }), 60);
    expect(partialLabel(total)).toBe(
      'sin datos de matrícula y cantidad de cuotas por año — total incompleto',
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

describe('the comparador cell — CLAUDE.md rule 3', () => {
  it('attaches the words "Dato desactualizado" to a stale total, not just a date', () => {
    // "dato de mayo de 2026" reads as provenance; a reader cannot tell it from
    // a fresh date. Rule 3 asks for the warning.
    const cell = compareCellLabel(totalCost(price({ freshness: 'stale' }), 60));
    expect(cell).toBe('Gs. 22.650.000 · Dato desactualizado (mayo de 2026)');
  });

  it('says the date is unknown rather than implying there is one', () => {
    const cell = compareCellLabel(totalCost(price({ freshness: 'unknown', verifiedAt: null }), 60));
    expect(cell).toBe('Gs. 22.650.000 · Dato desactualizado (sin fecha de verificación)');
  });

  it('leaves a fresh total unadorned', () => {
    expect(compareCellLabel(totalCost(price(), 60))).toBe('Gs. 22.650.000');
  });
});

describe('the annual figure has one definition', () => {
  /**
   * The first version of this compared `totalCost(p).annualCost` against
   * `computeAnnualCost(p)` — both sides of which are the same call, so it held
   * nothing and passed for any implementation of either. The import above is
   * what actually protects the lockstep `data-model.md` requires; what a test
   * can add is the arithmetic itself, against literals, so a drift in the
   * formula is caught here rather than only in the database.
   */
  it.each([
    [price(), 4_500_000],
    [price({ matricula: 0 }), 4_000_000],
    [price({ installmentsPerYear: 1 }), 900_000],
    [price({ isFree: true, matricula: null, monthlyFee: null, installmentsPerYear: null }), 0],
  ])('is matrícula + cuota × cuotas/año, stated as a number', (p, expected) => {
    expect(totalCost(p, 60).annualCost).toBe(expected);
    // And it is the same number `@/db/invariants` produces, which is the one
    // the `annual_cost` generated column stores and the comparador sorts on.
    expect(computeAnnualCost(p)).toBe(expected);
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
