/**
 * The stale badge on the most-rendered price surface on the site.
 *
 * PR-48b's review found this component had no test at all: deleting the badge
 * outright — the whole `display.isStale && …` branch — left 1231 tests green,
 * on the price that appears on every result card, in both `ResultTable`
 * layouts, in `RelatedPrograms` and in `OfferingsBlock`. Its own doc comment
 * says a visitor "must not be able to read the number without reading that it
 * is old", and nothing held that (`architecture.md` §31.7).
 *
 * What this proves is a string in the emitted HTML, not visibility: CSS is not
 * applied here. See §31.7 for what that does and does not cover.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PriceSummary } from '@/lib/search';

import { priceImageLines } from './price';
import { PriceLabel } from './PriceLabel';

function price(overrides: Partial<PriceSummary> = {}): PriceSummary {
  return {
    freshness: 'fresh',
    hasAmount: true,
    isFree: false,
    currency: 'PYG',
    matricula: 500_000,
    monthlyFee: 1_200_000,
    installmentsPerYear: 10,
    admissionFee: 150_000,
    annualCost: 12_500_000,
    verifiedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
  };
}

function render(p: PriceSummary) {
  return renderToStaticMarkup(createElement(PriceLabel, { price: p }));
}

describe('priceImageLines — what an OG image is allowed to draw', () => {
  // The OG routes return an `ImageResponse`, so nothing in this suite can read
  // what they drew: deleting the staleness branch from both left 1248 tests
  // green. The decision lives here instead, and the routes map over the result
  // (`architecture.md` §31.7).
  it('pairs a stale amount with the warning, always, as one list', () => {
    const lines = priceImageLines(price({ freshness: 'stale' }));
    expect(lines.map((line) => line.kind)).toEqual(['amount', 'warning']);
    expect(lines[0]!.text).toBe('Gs. 1.200.000/mes');
    expect(lines[1]!.text).toBe('Dato desactualizado (mayo de 2026)');
  });

  it('warns on an undated price too', () => {
    const lines = priceImageLines(price({ freshness: 'unknown', verifiedAt: null }));
    expect(lines[1]!.text).toBe('Dato desactualizado (sin fecha de verificación)');
  });

  it('gives a fresh price one line and no warning', () => {
    expect(priceImageLines(price())).toEqual([{ text: 'Gs. 1.200.000/mes', kind: 'amount' }]);
  });

  it('draws the honest gap rather than nothing when there is no number', () => {
    expect(priceImageLines(price({ hasAmount: false, currency: null }))).toEqual([
      { text: 'Consultá el arancel', kind: 'amount' },
    ]);
  });
});

describe('PriceLabel', () => {
  it('renders the cuota with its unit', () => {
    const html = render(price());
    expect(html).toContain('Gs. 1.200.000');
    expect(html).toContain('/mes');
  });

  it('never shows a stale number without the words rule 3 requires', () => {
    const html = render(price({ freshness: 'stale' }));
    expect(html).toContain('Gs. 1.200.000');
    expect(html).toContain('Dato desactualizado');
    expect(html).toContain('mayo de 2026');
  });

  it('warns on an undated price too, rather than only noting the date is missing', () => {
    // `verified_at` is nullable: never having verified a number is a third
    // state, and "Sin fecha de verificación" alone contains no warning.
    const html = render(price({ freshness: 'unknown', verifiedAt: null }));
    expect(html).toContain('Dato desactualizado');
    expect(html).toContain('sin fecha de verificación');
  });

  it('leaves a fresh price unwarned, so the badge still means something', () => {
    expect(render(price())).not.toContain('Dato desactualizado');
  });

  it('shows the honest gap, never an empty cell, when there is no number', () => {
    const html = render(price({ hasAmount: false, currency: null }));
    expect(html).toContain('Consultá el arancel');
    expect(html).not.toContain('Gs.');
  });

  it('says "Gratuita" for a free carrera, and warns when that claim is old', () => {
    // A two-year-old "gratuita" is exactly as wrong as a two-year-old number.
    expect(render(price({ isFree: true }))).toContain('Gratuita');
    expect(render(price({ isFree: true, freshness: 'stale' }))).toContain('Dato desactualizado');
  });
});
