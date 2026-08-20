/**
 * ⚠️ Fixtures, not data — every name is literally "Institución de prueba NNN"
 * (CLAUDE.md rule 1, same convention as `src/lib/programs/lookup.test.ts`).
 */

import { describe, expect, it } from 'vitest';

import type { OfferingSummary } from '@/lib/search';

import {
  buildAreaIntro,
  buildCareerCityIntro,
  buildCareerIntro,
  hasEditorialCopy,
  MIN_EDITORIAL_WORDS,
  wordCount,
} from './copy';

function offering(id: number, overrides: Partial<OfferingSummary> = {}): OfferingSummary {
  const n = String(id).padStart(3, '0');
  return {
    offeringId: id,
    programId: id,
    institutionId: id,
    careerId: 1,
    campusId: id,
    cityId: 1,
    departmentId: 1,
    areaId: 1,
    institutionSlug: `institucion-de-prueba-${n}`,
    programSlug: `programa-de-prueba-${n}`,
    careerSlug: 'carrera-de-prueba',
    areaSlug: 'area-de-prueba',
    citySlug: 'ciudad-de-prueba',
    departmentSlug: 'departamento-de-prueba',
    programName: `Programa de prueba ${n}`,
    careerName: 'Carrera de prueba',
    titleAwarded: null,
    institutionName: `Institución de prueba ${n}`,
    institutionShort: `IP-${n}`,
    institutionLogo: null,
    brandColor: null,
    campusName: `Sede de prueba ${n}`,
    cityName: 'Ciudad de prueba',
    departmentName: 'Departamento de prueba',
    level: 'grado',
    modality: 'presencial',
    shift: 'manana',
    management: 'privada',
    institutionType: 'universidad',
    durationMonths: 60,
    price: {
      freshness: 'fresh' as const,
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
    ...overrides,
  };
}

describe('wordCount / hasEditorialCopy', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCount('uno dos tres')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
    expect(wordCount(undefined)).toBe(0);
  });

  it('requires MIN_EDITORIAL_WORDS to count as real copy', () => {
    const short = Array.from({ length: MIN_EDITORIAL_WORDS - 1 }, () => 'palabra').join(' ');
    const long = Array.from({ length: MIN_EDITORIAL_WORDS }, () => 'palabra').join(' ');
    expect(hasEditorialCopy(short)).toBe(false);
    expect(hasEditorialCopy(long)).toBe(true);
    expect(hasEditorialCopy(null)).toBe(false);
  });
});

describe('buildCareerIntro', () => {
  const stats = { offeringCount: 12, institutionCount: 5, cityCount: 3 };

  it('uses the editorial description when it clears the word threshold', () => {
    const long = Array.from({ length: MIN_EDITORIAL_WORDS }, () => 'palabra').join(' ');
    const paragraphs = buildCareerIntro(
      { nameEs: 'Medicina', areaName: 'Salud', descriptionMd: long },
      stats,
    );
    expect(paragraphs).toEqual([{ text: long, isEditorial: true }]);
  });

  it('splits editorial copy on blank lines into separate paragraphs', () => {
    const para = Array.from({ length: MIN_EDITORIAL_WORDS }, () => 'palabra').join(' ');
    const md = `${para}\n\nSegundo párrafo.`;
    const paragraphs = buildCareerIntro(
      { nameEs: 'Medicina', areaName: 'Salud', descriptionMd: md },
      stats,
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.every((p) => p.isEditorial)).toBe(true);
  });

  it('falls back to a real, non-fabricated summary when there is no editorial copy', () => {
    const paragraphs = buildCareerIntro(
      { nameEs: 'Medicina', areaName: 'Salud', descriptionMd: null },
      stats,
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].isEditorial).toBe(false);
    expect(paragraphs[0].text).toContain('12');
    expect(paragraphs[0].text).toContain('5');
    expect(paragraphs[0].text).toContain('3');
    expect(paragraphs[0].text).toContain('Medicina');
  });

  it('says so honestly when there is no published supply at all', () => {
    const paragraphs = buildCareerIntro(
      { nameEs: 'Medicina', areaName: null, descriptionMd: null },
      { offeringCount: 0, institutionCount: 0, cityCount: 0 },
    );
    expect(paragraphs[0].text).toMatch(/Todavía no publicamos/);
  });
});

describe('buildAreaIntro', () => {
  it('falls back to a real career count when there is no editorial copy', () => {
    const paragraphs = buildAreaIntro({ nameEs: 'Salud', descriptionMd: null }, 8);
    expect(paragraphs[0].isEditorial).toBe(false);
    expect(paragraphs[0].text).toContain('8');
    expect(paragraphs[0].text).toContain('Salud');
  });
});

describe('buildCareerCityIntro', () => {
  const career = { nameEs: 'Medicina' };

  it('composes distinguishing content only from the offerings it is given', () => {
    const offerings = [
      offering(1, {
        institutionShort: 'UNA',
        modality: 'presencial',
        durationMonths: 60,
        accreditation: {
          status: 'vigente',
          agency: 'ANEAES',
          sourceUrl: 'https://x.test',
          validTo: null,
        },
        price: {
          freshness: 'fresh' as const,
          hasAmount: true,
          isFree: false,
          currency: 'PYG',
          matricula: 500_000,
          monthlyFee: 800_000,
          installmentsPerYear: 10,
          admissionFee: null,
          annualCost: 8_500_000,
          verifiedAt: new Date('2026-06-01T00:00:00Z'),
        },
      }),
      offering(2, {
        institutionShort: 'UC',
        modality: 'semipresencial',
        durationMonths: 66,
        price: {
          freshness: 'fresh' as const,
          hasAmount: true,
          isFree: false,
          currency: 'PYG',
          matricula: 400_000,
          monthlyFee: 900_000,
          installmentsPerYear: 10,
          admissionFee: null,
          annualCost: 9_400_000,
          verifiedAt: new Date('2026-05-01T00:00:00Z'),
        },
      }),
      offering(3, { institutionShort: 'UNI', modality: 'presencial', durationMonths: 60 }),
    ];

    const [paragraph] = buildCareerCityIntro(career, 'Encarnación', offerings);

    expect(paragraph.isEditorial).toBe(false);
    expect(paragraph.text).toContain('Encarnación');
    expect(paragraph.text).toContain('UNA');
    expect(paragraph.text).toContain('UC');
    expect(paragraph.text).toContain('UNI');
    expect(paragraph.text).toContain('presencial');
    expect(paragraph.text).toContain('semipresencial');
    expect(paragraph.text).toContain('60 a 66 meses');
    // Price range drawn only from the two priced offerings; the third has no
    // number at all. Age is not a filter here — PR-33 shows stale aranceles.
    expect(paragraph.text).toMatch(/Gs\. 8\.500\.000 a Gs\. 9\.400\.000/);
    expect(paragraph.text).toContain('1 de 3');
  });

  it("never prints a price range built from a stale number without rule 3's warning", () => {
    // The range has no single date to name, so the warning covers the range and
    // points at the per-carrera pages, which do carry each date. Before PR-48b
    // this sentence printed the figures bare.
    const offerings = [
      offering(1, {
        price: {
          freshness: 'stale' as const,
          hasAmount: true,
          isFree: false,
          currency: 'PYG' as const,
          matricula: 500_000,
          monthlyFee: 800_000,
          installmentsPerYear: 10,
          admissionFee: null,
          annualCost: 8_500_000,
          verifiedAt: new Date('2024-03-01T00:00:00Z'),
        },
      }),
    ];
    const [paragraph] = buildCareerCityIntro(career, 'Encarnación', offerings);
    expect(paragraph.text).toContain('Gs. 8.500.000');
    expect(paragraph.text).toContain('desactualizados');
  });

  it('leaves a fresh range unqualified, so the warning still means something', () => {
    const fresh = {
      freshness: 'fresh' as const,
      hasAmount: true,
      isFree: false,
      currency: 'PYG' as const,
      matricula: 500_000,
      monthlyFee: 800_000,
      installmentsPerYear: 10,
      admissionFee: null,
      annualCost: 8_500_000,
      verifiedAt: new Date('2026-05-01T00:00:00Z'),
    };
    const [paragraph] = buildCareerCityIntro(career, 'Encarnación', [
      offering(1, { price: fresh }),
    ]);
    expect(paragraph.text).toContain('Gs. 8.500.000');
    expect(paragraph.text).not.toContain('desactualizados');
  });

  it('is honest about a missing price and a missing accreditation', () => {
    const offerings = [offering(1), offering(2)];
    const [paragraph] = buildCareerCityIntro(career, 'Villarrica', offerings);
    expect(paragraph.text).toContain('tiene, por ahora, un arancel en guaraníes');
    expect(paragraph.text).toContain('no registramos acreditación vigente');
  });

  it('says so honestly when there are no offerings at all', () => {
    const [paragraph] = buildCareerCityIntro(career, 'Pilar', []);
    expect(paragraph.text).toBe('Todavía no publicamos ofertas de Medicina en Pilar.');
  });
});
