/**
 * The two claims `TotalCostBlock` makes, asserted against its rendered HTML.
 *
 * The independent review of PR-48 found the first version of this component
 * had **no test at all**: replacing the stale-warning condition with `false`
 * left the whole 1190-test suite green, on the highest-stakes new surface in
 * the PR. A pure-function test cannot catch that, because the defect lives in
 * the JSX.
 *
 * `renderToStaticMarkup` needs no new dependency and no DOM — `react-dom` is
 * already here and the block is a synchronous server component, so rendering
 * it to a string in Node is the whole harness.
 *
 * The file is `.ts` and builds its element with `createElement` rather than
 * JSX: vitest's include list and transform pipeline are unchanged by this PR,
 * which is one fewer thing between a failing assertion and a red CI run.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PriceSummary } from '@/lib/search';

import { TotalCostBlock } from './TotalCostBlock';

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

function render(p: PriceSummary, durationMonths: number | null, campusName?: string) {
  return renderToStaticMarkup(
    createElement(TotalCostBlock, { price: p, durationMonths, campusName }),
  );
}

describe('TotalCostBlock', () => {
  it('renders the composed total', () => {
    expect(render(price(), 60)).toContain('Gs. 22.650.000');
  });

  it('never shows a stale figure without the words rule 3 requires', () => {
    const html = render(price({ freshness: 'stale' }), 60);
    expect(html).toContain('Gs. 22.650.000');
    expect(html).toContain('Dato desactualizado');
    expect(html).toContain('mayo de 2026');
  });

  it('says so when a stale figure has no verification date at all', () => {
    const html = render(price({ freshness: 'unknown', verifiedAt: null }), 60);
    expect(html).toContain('Dato desactualizado');
    expect(html).toContain('sin fecha de verificación');
  });

  it('leaves a fresh total unwarned, so the warning still means something', () => {
    expect(render(price(), 60)).not.toContain('Dato desactualizado');
  });

  it('shows no figure at all on a partial', () => {
    const html = render(price({ admissionFee: null }), 60);
    expect(html).toContain('sin datos de derecho de examen');
    expect(html).toContain('total incompleto');
    // No guaraní amount anywhere in the card — not the matrícula, not a floor.
    expect(html).not.toContain('Gs.');
  });

  it('leaks no component amount on a partial either — not the derecho de examen it does have', () => {
    // The gap is the matrícula; the exam fee is present and must still not be
    // rendered, or the card shows a guaraní figure under a heading that says
    // "Costo total de la carrera".
    const html = render(price({ matricula: null }), 60);
    expect(html).toContain('sin datos de matrícula');
    expect(html).not.toContain('Gs.');
  });

  it('does not warn about staleness on a partial, because there is no figure to warn about', () => {
    expect(render(price({ freshness: 'stale', admissionFee: null }), 60)).not.toContain(
      'Dato desactualizado',
    );
  });

  it('frames a free carrera as free rather than as a cheap one', () => {
    const html = render(
      price({ isFree: true, matricula: null, monthlyFee: null, installmentsPerYear: null }),
      48,
    );
    expect(html).toContain('Gs. 150.000');
    expect(html).toContain('La carrera es gratuita');
  });

  it('explains a zero total that is not flagged free, instead of stating Gs. 0 bare', () => {
    const html = render(price({ matricula: 0, monthlyFee: 0, admissionFee: 0 }), 60);
    expect(html).toContain('Gs. 0');
    expect(html).toContain('Todos los montos cargados son cero');
  });

  it('names the sede when it is given one, since two sedes can cost different amounts', () => {
    expect(render(price(), 60, 'Central')).toContain('Sede Central');
    expect(render(price(), 60)).not.toContain('Sede ');
  });

  it('always states what the total covers', () => {
    for (const html of [render(price(), 60), render(price({ admissionFee: null }), 60)]) {
      expect(html).toContain('No incluye materiales ni traslados');
    }
  });
});
