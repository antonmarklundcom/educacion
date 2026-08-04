/**
 * ⚠️ The offerings built here are fixtures, not data. Every name is literally
 * "Programa de prueba NNN" so that nothing in this file could ever be mistaken
 * for a real Paraguayan program (same rule as
 * `src/lib/search/__fixtures__/synthetic.ts`, CLAUDE.md rule 1).
 */

import { describe, expect, it } from 'vitest';

import type { OfferingSummary } from '@/lib/search';

import { NO_DATA, buildCompareRows, countDifferences } from './rows';

function offering(index: number, over: Partial<OfferingSummary> = {}): OfferingSummary {
  const n = String(index).padStart(3, '0');
  return {
    offeringId: index,
    programId: index,
    institutionId: index,
    careerId: null,
    campusId: index,
    cityId: index,
    departmentId: index,
    areaId: null,
    institutionSlug: `institucion-de-prueba-${n}`,
    programSlug: `programa-de-prueba-${n}`,
    careerSlug: null,
    areaSlug: null,
    citySlug: `ciudad-de-prueba-${n}`,
    departmentSlug: `departamento-de-prueba-${n}`,
    programName: `Programa de prueba ${n}`,
    careerName: null,
    titleAwarded: null,
    institutionName: `Institución de prueba ${n}`,
    institutionShort: `IP-${n}`,
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
      isDisplayable: false,
      isFree: false,
      currency: null,
      matricula: null,
      monthlyFee: null,
      installmentsPerYear: null,
      admissionFee: null,
      annualCost: null,
      verifiedAt: null,
    },
    accreditation: { status: 'sin_datos', agency: null, sourceUrl: null, validTo: null },
    enrollmentStatus: 'sin_datos',
    admissionClosesOn: null,
    planRank: 0,
    ...over,
  };
}

function row(rows: ReturnType<typeof buildCompareRows>, key: string) {
  const found = rows.find((entry) => entry.key === key);
  if (!found) throw new Error(`no row ${key}`);
  return found;
}

describe('buildCompareRows', () => {
  it('marks a row as different only when the columns disagree', () => {
    const rows = buildCompareRows([
      offering(1, { durationMonths: 60 }),
      offering(2, { durationMonths: 48 }),
    ]);
    expect(row(rows, 'duration').isDifferent).toBe(true);
    // Both are 'presencial'.
    expect(row(rows, 'modality').isDifferent).toBe(false);
  });

  it('treats two identical honest gaps as agreement, not as a difference', () => {
    const rows = buildCompareRows([offering(1), offering(2)]);
    const duration = row(rows, 'title');
    expect(duration.isDifferent).toBe(false);
    expect(duration.cells.every((cell) => cell.isGap)).toBe(true);
  });

  it('renders a missing duración as "Sin datos", never as zero', () => {
    const rows = buildCompareRows([offering(1, { durationMonths: null })]);
    expect(row(rows, 'duration').cells[0]).toEqual({ text: NO_DATA, isGap: true });
  });

  it('never renders an amount for a price the 12-month rule stripped', () => {
    const rows = buildCompareRows([
      offering(1, {
        price: { ...offering(1).price, isDisplayable: false, verifiedAt: new Date('2021-05-01') },
      }),
    ]);
    const cell = row(rows, 'price').cells[0]!;
    expect(cell.isGap).toBe(true);
    expect(cell.text).toBe('Consultá el arancel');
    expect(cell.text).not.toMatch(/\d/);
  });

  it('renders a displayable arancel with its unit', () => {
    const rows = buildCompareRows([
      offering(1, {
        price: {
          ...offering(1).price,
          isDisplayable: true,
          currency: 'PYG',
          monthlyFee: 1_200_000,
        },
      }),
    ]);
    expect(row(rows, 'price').cells[0]!.text).toBe('Gs. 1.200.000/mes');
  });

  it('says "Sin datos de acreditación" for an unknown status', () => {
    const rows = buildCompareRows([offering(1)]);
    const cell = row(rows, 'accreditation').cells[0]!;
    expect(cell.text).toBe('Sin datos de acreditación');
    expect(cell.isGap).toBe(true);
  });

  it('counts the differing rows for the summary line', () => {
    const rows = buildCompareRows([
      offering(1, { durationMonths: 60, management: 'publica' }),
      offering(2, { durationMonths: 48, management: 'privada' }),
    ]);
    // institución, sede, ciudad, gestión and duración all differ by construction.
    expect(countDifferences(rows)).toBe(5);
  });
});
