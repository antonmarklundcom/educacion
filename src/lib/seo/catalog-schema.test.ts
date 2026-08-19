import { describe, expect, it } from 'vitest';

import { PRICE_MAX_AGE_MONTHS } from '@/db/invariants';
import type { InstitutionProfile } from '@/db/queries/institutions';
import type { OfferingSummary, PriceSummary } from '@/lib/search';

import {
  courseSchema,
  institutionSchema,
  itemListSchema,
  organizationSchema,
  websiteSchema,
} from './catalog-schema';

const NOW = new Date('2026-08-19T00:00:00.000Z');

function monthsBefore(months: number): Date {
  const date = new Date(NOW);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

const NO_PRICE: PriceSummary = {
  freshness: 'unknown',
  hasAmount: false,
  isFree: false,
  currency: null,
  matricula: null,
  monthlyFee: null,
  installmentsPerYear: null,
  admissionFee: null,
  annualCost: null,
  verifiedAt: null,
};

function offering(over: Partial<OfferingSummary> = {}): OfferingSummary {
  return {
    offeringId: 1,
    programId: 1,
    institutionId: 1,
    careerId: null,
    campusId: 1,
    cityId: 1,
    departmentId: 1,
    areaId: null,
    institutionSlug: 'institucion-de-prueba',
    programSlug: 'programa-de-prueba',
    careerSlug: null,
    areaSlug: null,
    citySlug: 'ciudad-de-prueba',
    departmentSlug: 'departamento-de-prueba',
    programName: 'Programa de prueba',
    careerName: null,
    titleAwarded: null,
    institutionName: 'Institución de prueba',
    institutionShort: 'IP',
    institutionLogo: null,
    brandColor: null,
    campusName: 'Sede de prueba',
    cityName: 'Ciudad de prueba',
    departmentName: 'Departamento de prueba',
    level: 'grado',
    modality: 'presencial',
    shift: 'manana',
    management: 'privada',
    institutionType: 'universidad',
    durationMonths: 60,
    price: NO_PRICE,
    accreditation: { status: 'sin_datos', agency: null, sourceUrl: null, validTo: null },
    enrollmentStatus: 'sin_datos',
    admissionClosesOn: null,
    planRank: 0,
    ...over,
  };
}

/** An amount with a verification date `months` old. */
function priced(months: number, over: Partial<PriceSummary> = {}): PriceSummary {
  return {
    ...NO_PRICE,
    freshness: 'fresh',
    hasAmount: true,
    currency: 'PYG',
    matricula: 500_000,
    monthlyFee: 1_000_000,
    installmentsPerYear: 10,
    annualCost: 10_500_000,
    verifiedAt: monthsBefore(months),
    ...over,
  };
}

/** Every `offers` object anywhere in the tree. */
function offersIn(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (record['@type'] === 'Offer') found.push(record);
      Object.values(record).forEach(walk);
    }
  };
  walk(value);
  return found;
}

describe('courseSchema — the Offer freshness gate', () => {
  it('emits an Offer for an arancel inside the 12-month window', () => {
    const schema = courseSchema([offering({ price: priced(1) })], NOW);
    const offers = offersIn(schema);

    expect(offers).toHaveLength(1);
    expect(offers[0].price).toBe(10_500_000);
    expect(offers[0].priceCurrency).toBe('PYG');
  });

  it('emits no Offer once the arancel is stale, though the page still shows it', () => {
    const schema = courseSchema([offering({ price: priced(PRICE_MAX_AGE_MONTHS + 1) })], NOW);

    expect(offersIn(schema)).toHaveLength(0);
    // The Course itself still ships — only the price claim is withheld.
    expect(schema).not.toBeNull();
    expect(schema!['@type']).toBe('Course');
  });

  it('emits no Offer for an amount that was never verified', () => {
    const schema = courseSchema(
      [offering({ price: priced(1, { verifiedAt: null, freshness: 'unknown' }) })],
      NOW,
    );

    expect(offersIn(schema)).toHaveLength(0);
  });

  it('emits no Offer when there is no amount at all', () => {
    const schema = courseSchema([offering({ price: NO_PRICE })], NOW);

    expect(offersIn(schema)).toHaveLength(0);
  });

  it('emits no Offer for a partial price with no honest annual figure', () => {
    // A matrícula with no cuota: `computeAnnualCost` returns null rather than a
    // partial sum, and a partial sum must never reach a rich result.
    const schema = courseSchema(
      [offering({ price: priced(1, { monthlyFee: null, annualCost: null }) })],
      NOW,
    );

    expect(offersIn(schema)).toHaveLength(0);
  });

  it('treats a fresh "gratuita" as a zero-price Offer, and a stale one as no Offer', () => {
    const free = { isFree: true, annualCost: 0, matricula: null, monthlyFee: null };

    expect(offersIn(courseSchema([offering({ price: priced(1, free) })], NOW))[0].price).toBe(0);
    expect(
      offersIn(courseSchema([offering({ price: priced(PRICE_MAX_AGE_MONTHS + 1, free) })], NOW)),
    ).toHaveLength(0);
  });

  it('gates each offering independently', () => {
    const schema = courseSchema(
      [
        offering({ offeringId: 1, price: priced(1) }),
        offering({ offeringId: 2, price: priced(PRICE_MAX_AGE_MONTHS + 1) }),
      ],
      NOW,
    );

    expect(schema!.hasCourseInstance).toHaveLength(2);
    expect(offersIn(schema)).toHaveLength(1);
  });
});

describe('courseSchema — shape', () => {
  it('describes one CourseInstance per offering, with its own mode and place', () => {
    const schema = courseSchema(
      [
        offering({ modality: 'presencial', campusName: 'Sede Central' }),
        offering({ offeringId: 2, modality: 'distancia', campusName: 'Sede Virtual' }),
      ],
      NOW,
    );
    const instances = schema!.hasCourseInstance as Record<string, unknown>[];

    expect(instances.map((instance) => instance.courseMode)).toEqual(['onsite', 'online']);
    expect((instances[0].location as Record<string, unknown>).name).toBe('Sede Central');
  });

  it('omits a credential and a duration it does not have', () => {
    const schema = courseSchema([offering({ titleAwarded: null, durationMonths: null })], NOW);

    expect(schema).not.toHaveProperty('educationalCredentialAwarded');
    expect(schema).not.toHaveProperty('timeRequired');
  });

  it('formats a duration as an ISO 8601 period', () => {
    expect(courseSchema([offering({ durationMonths: 60 })], NOW)!.timeRequired).toBe('P60M');
  });

  it('returns null rather than an empty Course when there are no offerings', () => {
    expect(courseSchema([], NOW)).toBeNull();
  });
});

describe('never a rating, never a review', () => {
  const everySchema = [
    courseSchema([offering({ price: priced(1) })], NOW),
    institutionSchema({
      id: 1,
      slug: 'institucion-de-prueba',
      nameOfficial: 'Institución de prueba',
      nameShort: 'IP',
      logoUrl: null,
      brandColor: null,
      management: 'privada',
      type: 'universidad',
      programCount: 0,
      offeringCount: 0,
      foundedYear: null,
      website: null,
      email: null,
      phoneE164: null,
      whatsappE164: null,
      descriptionMd: null,
      isClaimed: false,
      aneaesAccreditedCount: 0,
      cityNames: [],
    } satisfies InstitutionProfile),
    itemListSchema('Lista', [{ name: 'Uno', path: '/uno' }]),
    websiteSchema(),
    organizationSchema(),
  ];

  it.each(['aggregateRating', 'review', 'ratingValue', 'reviewCount'])(
    'no schema anywhere contains %s',
    (banned) => {
      for (const schema of everySchema) {
        expect(JSON.stringify(schema)).not.toContain(banned);
      }
    },
  );
});

describe('the remaining types', () => {
  it('numbers an ItemList from one, in page order', () => {
    const schema = itemListSchema('Medicina en Paraguay', [
      { name: 'Uno', path: '/universidades/a/uno' },
      { name: 'Dos', path: '/universidades/a/dos' },
    ]);
    const items = schema.itemListElement as Record<string, unknown>[];

    expect(schema.numberOfItems).toBe(2);
    expect(items.map((item) => item.position)).toEqual([1, 2]);
    expect(items[0].name).toBe('Uno');
  });

  it('points SearchAction at the real search surface', () => {
    const action = websiteSchema().potentialAction as Record<string, unknown>;
    const target = action.target as Record<string, unknown>;

    expect(target.urlTemplate).toContain('/carreras?q={search_term_string}');
    expect(action['query-input']).toBe('required name=search_term_string');
  });

  it('carries the R-07 independence disclaimer on the Organization', () => {
    expect(organizationSchema().description).toContain('No es un portal oficial');
  });
});
