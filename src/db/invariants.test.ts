import { describe, expect, it } from 'vitest';

import {
  InvariantError,
  assertAccreditationCitation,
  assertAccreditationStatusIsSafe,
  assertPriceIsCoherent,
  assertScopeTarget,
  computeAnnualCost,
  hasRequiredCitation,
  isPriceDisplayable,
  priceExpiresOn,
} from './invariants';

describe('accreditation citation rule', () => {
  it('rejects a vigente row with no citation at all', () => {
    expect(() => assertAccreditationCitation({ status: 'vigente' })).toThrow(InvariantError);
    expect(() =>
      assertAccreditationCitation({ status: 'vigente', sourceUrl: null, resolutionNumber: null }),
    ).toThrow(/requires source_url or resolution_number/);
  });

  it('rejects an en_proceso row with no citation', () => {
    expect(() => assertAccreditationCitation({ status: 'en_proceso' })).toThrow(InvariantError);
  });

  it('accepts a vigente row cited by source_url alone', () => {
    expect(() =>
      assertAccreditationCitation({
        status: 'vigente',
        sourceUrl: 'https://www.aneaes.gov.py/resoluciones/123',
      }),
    ).not.toThrow();
  });

  it('accepts a vigente row cited by resolution_number alone', () => {
    expect(() =>
      assertAccreditationCitation({ status: 'vigente', resolutionNumber: 'Res. 123/2025' }),
    ).not.toThrow();
  });

  it('accepts an en_proceso row cited by resolution_number alone', () => {
    expect(() =>
      assertAccreditationCitation({ status: 'en_proceso', resolutionNumber: 'Res. 44/2026' }),
    ).not.toThrow();
  });

  it('treats whitespace-only citations as missing', () => {
    expect(() =>
      assertAccreditationCitation({ status: 'vigente', sourceUrl: '   ', resolutionNumber: '' }),
    ).toThrow(InvariantError);
  });

  it('reports the constraint name so a DB failure and a code failure match', () => {
    try {
      assertAccreditationCitation({ status: 'vigente' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InvariantError).rule).toBe('accreditations_citation_required');
    }
  });

  it.each(['vencida', 'no_acreditada', 'sin_datos'] as const)(
    'does not require a citation for %s at the base rule',
    (status) => {
      expect(hasRequiredCitation({ status })).toBe(true);
    },
  );

  it('still refuses to assert a negative without a source', () => {
    expect(() => assertAccreditationStatusIsSafe({ status: 'no_acreditada' })).toThrow(
      /Use 'sin_datos' when unknown/,
    );
    expect(() => assertAccreditationStatusIsSafe({ status: 'sin_datos' })).not.toThrow();
    expect(() =>
      assertAccreditationStatusIsSafe({
        status: 'no_acreditada',
        sourceUrl: 'https://www.aneaes.gov.py/no-acreditada/123',
      }),
    ).not.toThrow();
  });
});

describe('polymorphic scope rule', () => {
  it('requires the matching target id', () => {
    expect(() => assertScopeTarget({ scope: 'program' }, 'accreditations')).toThrow(
      /requires programId/,
    );
    expect(() =>
      assertScopeTarget({ scope: 'program', programId: 7 }, 'accreditations'),
    ).not.toThrow();
  });

  it('rejects a row that targets more than one entity', () => {
    expect(() =>
      assertScopeTarget({ scope: 'institution', institutionId: 1, programId: 2 }, 'accreditations'),
    ).toThrow(/must not also set/);
    expect(() =>
      assertScopeTarget({ scope: 'program', programId: 2, offeringId: 3 }, 'admissions'),
    ).toThrow(/must not also set offering_id/);
  });
});

describe('annual cost', () => {
  it('is matrícula + cuota × cuotas, the number the comparador sorts on', () => {
    expect(
      computeAnnualCost({ matricula: 1_450_000, monthlyFee: 1_200_000, installmentsPerYear: 10 }),
    ).toBe(13_450_000);
  });

  it('ranks 10 large cuotas above 12 small ones correctly', () => {
    const ten = computeAnnualCost({ matricula: 0, monthlyFee: 1_200_000, installmentsPerYear: 10 });
    const twelve = computeAnnualCost({
      matricula: 0,
      monthlyFee: 1_050_000,
      installmentsPerYear: 12,
    });
    expect(ten).toBe(12_000_000);
    expect(twelve).toBe(12_600_000);
    expect(twelve!).toBeGreaterThan(ten!);
  });

  it('is 0 for a genuinely free program', () => {
    expect(computeAnnualCost({ isFree: true })).toBe(0);
  });

  it('is null — not 0 — when nothing was captured', () => {
    expect(computeAnnualCost({})).toBeNull();
    expect(computeAnnualCost({ admissionFee: 250_000 })).toBeNull();
  });

  it('is null when a cuota has no known number of installments', () => {
    expect(computeAnnualCost({ monthlyFee: 900_000 })).toBeNull();
  });

  it('works with a matrícula and no cuota', () => {
    expect(computeAnnualCost({ matricula: 500_000 })).toBe(500_000);
  });
});

describe('price coherence', () => {
  it('rejects a free price that also charges tuition', () => {
    expect(() => assertPriceIsCoherent({ isFree: true, monthlyFee: 100_000 })).toThrow(
      /must not carry a matrícula or a cuota/,
    );
  });

  it('allows a free program to charge an admission fee', () => {
    expect(() => assertPriceIsCoherent({ isFree: true, admissionFee: 150_000 })).not.toThrow();
  });

  it('rejects an impossible installment count', () => {
    expect(() => assertPriceIsCoherent({ installmentsPerYear: 0 })).toThrow(/between 1 and 24/);
    expect(() => assertPriceIsCoherent({ installmentsPerYear: 36 })).toThrow(/between 1 and 24/);
  });

  it('rejects negative and non-integer money', () => {
    expect(() => assertPriceIsCoherent({ matricula: -1 })).toThrow(/must not be negative/);
    expect(() => assertPriceIsCoherent({ monthlyFee: 1_200_000.5 })).toThrow(/must be an integer/);
  });
});

describe('price staleness', () => {
  const verified = new Date('2026-01-15T00:00:00Z');

  it('expires exactly 12 months after verification', () => {
    expect(priceExpiresOn(verified)?.toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });

  it('displays a price verified 11 months ago', () => {
    expect(isPriceDisplayable(verified, new Date('2026-12-15T00:00:00Z'))).toBe(true);
  });

  it('hides a price verified 13 months ago', () => {
    expect(isPriceDisplayable(verified, new Date('2027-02-15T00:00:00Z'))).toBe(false);
  });

  it('hides a price that was never verified', () => {
    expect(isPriceDisplayable(null)).toBe(false);
    expect(isPriceDisplayable(undefined)).toBe(false);
    expect(priceExpiresOn(null)).toBeNull();
  });
});
