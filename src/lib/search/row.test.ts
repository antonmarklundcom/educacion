import { describe, expect, it } from 'vitest';

import { isPriceDisplayable, priceExpiresOn } from '@/db/invariants';

import { makeSyntheticRows } from './__fixtures__/synthetic';
import { toDateOnly } from './accreditation';
import { isPriceFilterable } from './engine';
import { toOfferingSummary, toPriceSummary, type ProgramSearchRow } from './row';

const NOW = new Date('2026-08-02T12:00:00Z');

function rowWithPriceVerifiedAt(verifiedAt: Date | null): ProgramSearchRow {
  const [row] = makeSyntheticRows(1, { now: NOW });
  const expiry = priceExpiresOn(verifiedAt);
  return {
    ...row,
    priceCurrency: 'PYG',
    matriculaGs: 500_000,
    monthlyFeeGs: 400_000,
    installmentsPerYear: 10,
    admissionFeeGs: 150_000,
    annualCostGs: 4_500_000,
    isFree: false,
    priceVerifiedAt: verifiedAt,
    priceExpiresOn: expiry ? toDateOnly(expiry) : null,
  };
}

describe('toPriceSummary', () => {
  it('shows a fresh arancel in full', () => {
    const price = toPriceSummary(rowWithPriceVerifiedAt(new Date('2026-05-01T00:00:00Z')), NOW);
    expect(price.isDisplayable).toBe(true);
    expect(price.annualCost).toBe(4_500_000);
    expect(price.monthlyFee).toBe(400_000);
    expect(price.currency).toBe('PYG');
  });

  it('strips every amount once the arancel is over 12 months old', () => {
    const price = toPriceSummary(rowWithPriceVerifiedAt(new Date('2025-01-01T00:00:00Z')), NOW);
    expect(price.isDisplayable).toBe(false);
    expect(price.annualCost).toBeNull();
    expect(price.monthlyFee).toBeNull();
    expect(price.matricula).toBeNull();
    expect(price.installmentsPerYear).toBeNull();
    expect(price.admissionFee).toBeNull();
    expect(price.currency).toBeNull();
    // Provenance survives, so the UI can explain the gap instead of hiding it.
    expect(price.verifiedAt).toEqual(new Date('2025-01-01T00:00:00Z'));
  });

  it('does not assert "gratuita" from a stale capture either', () => {
    const stale = rowWithPriceVerifiedAt(new Date('2024-06-01T00:00:00Z'));
    const price = toPriceSummary({ ...stale, isFree: true }, NOW);
    expect(price.isDisplayable).toBe(false);
    expect(price.isFree).toBe(false);
  });

  it('treats an unverified price as not displayable', () => {
    const price = toPriceSummary(rowWithPriceVerifiedAt(null), NOW);
    expect(price.isDisplayable).toBe(false);
    expect(price.annualCost).toBeNull();
  });
});

describe('isPriceFilterable', () => {
  /**
   * The SQL engine filters on `price_expires_on > :today`; the renderer decides
   * with `isPriceDisplayable()` at timestamp precision. They may disagree by at
   * most one day, and only ever in the safe direction: a row can drop out of an
   * arancel range while still showing its price, never the reverse.
   */
  it('is never more permissive than isPriceDisplayable', () => {
    for (let days = 300; days <= 400; days += 1) {
      for (const hour of [0, 11, 23]) {
        const verifiedAt = new Date(NOW.getTime() - days * 86_400_000);
        verifiedAt.setUTCHours(hour, 30, 0, 0);
        const row = rowWithPriceVerifiedAt(verifiedAt);
        if (isPriceFilterable(row, NOW)) {
          expect(isPriceDisplayable(row.priceVerifiedAt, NOW)).toBe(true);
        }
      }
    }
  });

  it('agrees with isPriceDisplayable away from the boundary', () => {
    const fresh = rowWithPriceVerifiedAt(new Date('2026-07-01T00:00:00Z'));
    const stale = rowWithPriceVerifiedAt(new Date('2024-07-01T00:00:00Z'));
    expect(isPriceFilterable(fresh, NOW)).toBe(true);
    expect(isPriceFilterable(stale, NOW)).toBe(false);
  });
});

describe('toOfferingSummary', () => {
  it('carries everything a card needs to render and link without a second query', () => {
    const [row] = makeSyntheticRows(1, { now: NOW });
    const summary = toOfferingSummary(row, NOW);
    expect(summary.institutionSlug).toBe(row.institutionSlug);
    expect(summary.programSlug).toBe(row.programSlug);
    expect(summary.citySlug).toBe(row.citySlug);
    expect(summary.accreditation.status).toBe(row.accreditationStatus);
    expect(summary.durationMonths).toBe(row.durationMonths);
    expect(summary.planRank).toBe(row.planRank);
  });
});
