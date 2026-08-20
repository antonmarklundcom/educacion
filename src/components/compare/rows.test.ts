/**
 * ⚠️ The offerings built here are fixtures, not data. Every name is literally
 * "Programa de prueba NNN" so that nothing in this file could ever be mistaken
 * for a real Paraguayan program (same rule as
 * `src/lib/search/__fixtures__/synthetic.ts`, CLAUDE.md rule 1).
 */

import { describe, expect, it } from 'vitest';

import type { OfferingSummary } from '@/lib/search';

import { NO_DATA, buildCompareRows, differenceSummary } from './rows';

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
      freshness: 'fresh',
      hasAmount: false,
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

  it('renders the honest gap when there is no arancel at all', () => {
    const rows = buildCompareRows([
      offering(1, {
        price: { ...offering(1).price, hasAmount: false, verifiedAt: new Date('2021-05-01') },
      }),
    ]);
    const cell = row(rows, 'price').cells[0]!;
    expect(cell.isGap).toBe(true);
    expect(cell.text).toBe('Consultá el arancel');
    expect(cell.text).not.toMatch(/\d/);
  });

  it('renders an arancel with its unit', () => {
    const rows = buildCompareRows([
      offering(1, {
        price: {
          ...offering(1).price,
          hasAmount: true,
          currency: 'PYG',
          monthlyFee: 1_200_000,
        },
      }),
    ]);
    expect(row(rows, 'price').cells[0]!.text).toBe('Gs. 1.200.000/mes');
  });

  /**
   * PR-33: comparing a stale number against a fresh one is the case the
   * comparador exists for, so the cell carries the date — a column quoting a
   * 2024 price next to one quoting this year's must not look equally current.
   */
  it('dates a stale arancel inside the cell it is compared in', () => {
    const rows = buildCompareRows([
      offering(1, {
        price: {
          ...offering(1).price,
          freshness: 'stale',
          hasAmount: true,
          currency: 'PYG',
          monthlyFee: 1_200_000,
          verifiedAt: new Date('2024-03-01T00:00:00Z'),
        },
      }),
    ]);
    const text = row(rows, 'price').cells[0]!.text;
    expect(text).toContain('Gs. 1.200.000/mes');
    expect(text).toMatch(/2024/);
    // PR-48: a date alone reads as provenance. Rule 3 asks for the words, and
    // the arancel cell and the total cell below must not warn differently.
    expect(text).toContain('Dato desactualizado');
  });

  /**
   * The undated branch of the same cell, which PR-48 left emitting only "Sin
   * fecha de verificación" — a price shown with no warning on it at all, which
   * is precisely what rule 3 forbids. `freshness: 'unknown'` with no
   * `verified_at` is a real row: `prices.verified_at` is nullable and never
   * having verified a number is a third state, not a synonym for fresh.
   */
  it('warns on an undated stale arancel, not merely that the date is missing', () => {
    const rows = buildCompareRows([
      offering(1, {
        price: {
          ...offering(1).price,
          freshness: 'unknown',
          hasAmount: true,
          currency: 'PYG',
          monthlyFee: 1_200_000,
          verifiedAt: null,
        },
      }),
    ]);
    expect(row(rows, 'price').cells[0]!.text).toBe(
      'Gs. 1.200.000/mes · Dato desactualizado (sin fecha de verificación)',
    );
  });

  /* ---- PR-48: the total-cost row ------------------------------------- */

  function priced(over: Partial<OfferingSummary['price']> = {}) {
    return {
      freshness: 'fresh' as const,
      hasAmount: true,
      isFree: false,
      currency: 'PYG' as const,
      matricula: 500_000,
      monthlyFee: 400_000,
      installmentsPerYear: 10,
      admissionFee: 150_000,
      annualCost: 4_500_000,
      verifiedAt: new Date('2026-05-01T00:00:00Z'),
      ...over,
    };
  }

  it('shows the composed total in the comparador', () => {
    const rows = buildCompareRows([offering(1, { price: priced(), durationMonths: 60 })]);
    expect(row(rows, 'totalCost').cells[0]).toEqual({ text: 'Gs. 22.650.000', isGap: false });
  });

  it('dates a stale total inside the cell, like the arancel row does', () => {
    const rows = buildCompareRows([
      offering(1, { price: priced({ freshness: 'stale' }), durationMonths: 60 }),
    ]);
    expect(row(rows, 'totalCost').cells[0]!.text).toBe(
      'Gs. 22.650.000 · Dato desactualizado (mayo de 2026)',
    );
  });

  it('renders an incomplete total as the honest gap, with no figure in it', () => {
    const rows = buildCompareRows([
      offering(1, { price: priced({ admissionFee: null }), durationMonths: 60 }),
    ]);
    const cell = row(rows, 'totalCost').cells[0]!;
    expect(cell.isGap).toBe(true);
    expect(cell.text).toBe('sin datos de derecho de examen — total incompleto');
    expect(cell.text).not.toMatch(/\d/);
  });

  it('marks the cheapest column, and only that one', () => {
    const rows = buildCompareRows([
      offering(1, { price: priced(), durationMonths: 60 }),
      offering(2, { price: priced({ monthlyFee: 100_000 }), durationMonths: 60 }),
      offering(3, { price: priced({ admissionFee: null }), durationMonths: 60 }),
    ]);
    const cells = row(rows, 'totalCost').cells;
    expect(cells.map((cell) => cell.note)).toEqual([undefined, 'el más barato', undefined]);
  });

  it('marks no cheapest column when an incomplete total would be the winner', () => {
    // The incomplete column might well be the cheapest; we do not know, and
    // guessing is the extrapolation PR-48 refuses to make.
    const rows = buildCompareRows([
      offering(1, { price: priced(), durationMonths: 60 }),
      offering(2, { price: priced({ admissionFee: null }), durationMonths: 60 }),
    ]);
    expect(row(rows, 'totalCost').cells.every((cell) => cell.note === undefined)).toBe(true);
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
    const { differing, counted } = differenceSummary(rows);
    expect(differing).toBe(5);
    expect(counted).toBe(rows.length - 1);
  });

  it('does not count a differing arancel twice by counting its total as well', () => {
    const rows = buildCompareRows([
      offering(1, { price: priced(), durationMonths: 60 }),
      offering(2, { price: priced({ monthlyFee: 900_000 }), durationMonths: 60 }),
    ]);
    // Both the arancel row and the total-cost row differ; they are one fact.
    expect(row(rows, 'price').isDifferent).toBe(true);
    expect(row(rows, 'totalCost').isDifferent).toBe(true);
    // institución, sede, ciudad and arancel — the total does not vote.
    expect(differenceSummary(rows).differing).toBe(4);
  });
});
