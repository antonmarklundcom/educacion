import { describe, expect, it } from 'vitest';

import { priceExpiresOn } from '@/db/invariants';

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
    expect(price.freshness).toBe('fresh');
    expect(price.hasAmount).toBe(true);
    expect(price.annualCost).toBe(4_500_000);
    expect(price.monthlyFee).toBe(400_000);
    expect(price.currency).toBe('PYG');
  });

  /**
   * PR-33 reversed the rule this test used to assert. The old version checked
   * that every amount was `null` past twelve months; the new one checks the
   * opposite, plus the thing that makes it honest — the row is *marked* stale
   * and keeps the date the UI needs to say so.
   */
  it('keeps the amounts past 12 months and marks them stale', () => {
    const price = toPriceSummary(rowWithPriceVerifiedAt(new Date('2025-01-01T00:00:00Z')), NOW);
    expect(price.freshness).toBe('stale');
    expect(price.annualCost).toBe(4_500_000);
    expect(price.monthlyFee).toBe(400_000);
    expect(price.currency).toBe('PYG');
    expect(price.verifiedAt).toEqual(new Date('2025-01-01T00:00:00Z'));
  });

  it('marks a stale "gratuita" too — it is a claim like any other', () => {
    const stale = rowWithPriceVerifiedAt(new Date('2024-06-01T00:00:00Z'));
    const price = toPriceSummary({ ...stale, isFree: true }, NOW);
    expect(price.freshness).toBe('stale');
    expect(price.isFree).toBe(true);
    expect(price.hasAmount).toBe(true);
  });

  it('separates "never verified" from "verified long ago"', () => {
    const price = toPriceSummary(rowWithPriceVerifiedAt(null), NOW);
    expect(price.freshness).toBe('unknown');
    expect(price.verifiedAt).toBeNull();
    // The amounts are still there: what is missing is the date, not the number.
    expect(price.annualCost).toBe(4_500_000);
  });

  it('is the honest gap when there is no number at all', () => {
    const empty = rowWithPriceVerifiedAt(new Date('2026-05-01T00:00:00Z'));
    const price = toPriceSummary(
      { ...empty, annualCostGs: null, monthlyFeeGs: null, matriculaGs: null, isFree: false },
      NOW,
    );
    expect(price.hasAmount).toBe(false);
    expect(price.annualCost).toBeNull();
  });
});

describe('isPriceFilterable', () => {
  /**
   * **The property this file used to assert is gone, and its replacement is
   * the point of PR-33.**
   *
   * The old rule: filtering was never more permissive than rendering, so a row
   * could drop out of an arancel range on its last day while still showing its
   * price. That mattered only because a stale price was *hidden* — you cannot
   * filter on a number the reader is not allowed to see.
   *
   * Now the number is shown with a warning, so the honest rule is the
   * consistent one: **anything a reader can see, they can filter and sort on**,
   * whatever its age. A carrera visibly quoting Gs. 1.200.000 that vanished
   * from "hasta Gs. 1.500.000" would read as a bug and would hide exactly the
   * cheap options a family is looking for.
   */
  it('filters a stale arancel exactly like a fresh one', () => {
    const fresh = rowWithPriceVerifiedAt(new Date('2026-07-01T00:00:00Z'));
    const stale = rowWithPriceVerifiedAt(new Date('2024-07-01T00:00:00Z'));
    const never = rowWithPriceVerifiedAt(null);
    expect(isPriceFilterable(fresh)).toBe(true);
    expect(isPriceFilterable(stale)).toBe(true);
    expect(isPriceFilterable(never)).toBe(true);
  });

  it('never filters on a row with no number, at any age', () => {
    const fresh = rowWithPriceVerifiedAt(new Date('2026-07-01T00:00:00Z'));
    const empty = { ...fresh, priceCurrency: null, annualCostGs: null, isFree: false } as const;
    expect(isPriceFilterable(empty)).toBe(false);
  });

  it('is stable across the 12-month boundary, in both directions', () => {
    for (let days = 300; days <= 400; days += 1) {
      const verifiedAt = new Date(NOW.getTime() - days * 86_400_000);
      const row = rowWithPriceVerifiedAt(verifiedAt);
      expect(isPriceFilterable(row)).toBe(true);
    }
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
