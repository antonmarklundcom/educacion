/**
 * The per-sede total, asserted against the rendered HTML.
 *
 * PR-48 added a total to each row of this block precisely because one aside
 * figure for `offerings[0]` states the cost of an arbitrary sede as the cost of
 * the carrera — and then shipped it with nothing holding it: deleting the whole
 * `<p>` left all 1212 tests green. A pure-function test cannot catch that, for
 * the same reason `TotalCostBlock.test.ts` exists (`architecture.md` §31.7).
 *
 * ⚠️ The offerings built here are fixtures, not data. Every name is literally
 * "Programa de prueba NNN" so nothing in this file could be mistaken for a real
 * Paraguayan program (CLAUDE.md rule 1).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { OfferingSummary } from '@/lib/search';

import { OfferingsBlock } from './OfferingsBlock';

function offering(index: number, over: Partial<OfferingSummary> = {}): OfferingSummary {
  const n = String(index).padStart(3, '0');
  return {
    offeringId: index,
    programId: index,
    institutionId: 1,
    careerId: null,
    campusId: index,
    cityId: index,
    departmentId: index,
    areaId: null,
    institutionSlug: 'institucion-de-prueba-001',
    programSlug: `programa-de-prueba-${n}`,
    careerSlug: null,
    areaSlug: null,
    citySlug: `ciudad-de-prueba-${n}`,
    departmentSlug: `departamento-de-prueba-${n}`,
    programName: `Programa de prueba ${n}`,
    careerName: null,
    titleAwarded: null,
    institutionName: 'Institución de prueba 001',
    institutionShort: 'IP-001',
    institutionLogo: null,
    brandColor: null,
    campusName: `Sede de prueba ${n}`,
    cityName: `Ciudad de prueba ${n}`,
    departmentName: `Departamento de prueba ${n}`,
    level: 'grado',
    modality: 'presencial',
    shift: 'manana',
    management: 'privada',
    institutionType: 'universidad',
    durationMonths: 60,
    price: {
      freshness: 'fresh',
      hasAmount: true,
      isFree: false,
      currency: 'PYG',
      matricula: 500_000,
      monthlyFee: 400_000,
      installmentsPerYear: 10,
      admissionFee: 150_000,
      annualCost: 4_500_000,
      verifiedAt: new Date('2026-05-01T00:00:00Z'),
    },
    accreditation: { status: 'sin_datos', agency: null, sourceUrl: null, validTo: null },
    enrollmentStatus: 'sin_datos',
    admissionClosesOn: null,
    planRank: 0,
    ...over,
  };
}

function render(offerings: readonly OfferingSummary[]) {
  return renderToStaticMarkup(createElement(OfferingsBlock, { offerings }));
}

describe('OfferingsBlock', () => {
  it('gives every sede its own total, not one total for the carrera', () => {
    const html = render([
      offering(1),
      offering(2, { price: { ...offering(2).price, monthlyFee: 900_000 } }),
    ]);
    // 5 × (500.000 + 400.000 × 10) + 150.000 and 5 × (500.000 + 900.000 × 10) + 150.000.
    expect(html).toContain('Gs. 22.650.000');
    expect(html).toContain('Gs. 47.650.000');
  });

  it('labels the figure, so a number under a sede name is not read as its arancel', () => {
    expect(render([offering(1)])).toContain('Costo total');
  });

  it('never shows a stale total without the words rule 3 requires', () => {
    const html = render([offering(1, { price: { ...offering(1).price, freshness: 'stale' } })]);
    expect(html).toContain('Gs. 22.650.000');
    expect(html).toContain('Dato desactualizado');
    expect(html).toContain('mayo de 2026');
  });

  it('shows the honest gap instead of a figure when the total is incomplete', () => {
    const html = render([offering(1, { price: { ...offering(1).price, admissionFee: null } })]);
    expect(html).toContain('sin datos de derecho de examen');
    expect(html).toContain('total incompleto');
    // The arancel label above it is a cuota, not a total — no total figure.
    expect(html).not.toContain('Gs. 22.650.000');
  });

  it('leaves a fresh total unwarned, so the warning still means something', () => {
    expect(render([offering(1)])).not.toContain('Dato desactualizado');
  });
});
