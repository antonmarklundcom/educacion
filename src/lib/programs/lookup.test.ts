/**
 * ⚠️ Fixtures, not data — every name is literally "Programa de prueba NNN"
 * (same rule as `src/lib/search/__fixtures__/synthetic.ts`, CLAUDE.md rule 1).
 *
 * `searchPrograms` is mocked because these tests are about the lookup's own
 * behaviour: that it pages until it has everything, that it stops, that it
 * never substitutes a near match for a miss, and that "related" means a
 * different institution.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OfferingSummary, SearchFilters, SearchResponse } from '@/lib/search';

const searchPrograms = vi.fn<(filters: SearchFilters) => Promise<SearchResponse>>();

vi.mock('@/lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search')>();
  return { ...actual, searchPrograms: (filters: SearchFilters) => searchPrograms(filters) };
});

const { findProgramOfferings, findRelatedOfferings } = await import('./lookup');

function offering(id: number, over: Partial<OfferingSummary> = {}): OfferingSummary {
  const n = String(id).padStart(3, '0');
  return {
    offeringId: id,
    programId: id,
    institutionId: id,
    careerId: null,
    campusId: id,
    cityId: id,
    departmentId: id,
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

function response(results: OfferingSummary[], total = results.length): SearchResponse {
  return {
    results,
    facets: {
      areas: [],
      levels: [],
      managements: [],
      modalities: [],
      shifts: [],
      cities: [],
      accreditationStatuses: [],
      enrollmentStatuses: [],
    },
    total,
    page: 1,
    pageSize: 100,
    sort: 'nombre_asc',
  };
}

beforeEach(() => {
  searchPrograms.mockReset();
});

describe('findProgramOfferings', () => {
  it('returns every offering of the program — sedes and turnos, not just the first', () => {
    const rows = [
      offering(1, { programSlug: 'programa-de-prueba-001', campusName: 'Sede A' }),
      offering(2, { programSlug: 'programa-de-prueba-001', campusName: 'Sede B' }),
      offering(3, { programSlug: 'programa-de-prueba-002' }),
    ];
    searchPrograms.mockResolvedValue(response(rows));

    return expect(
      findProgramOfferings('institucion-de-prueba-001', 'programa-de-prueba-001'),
    ).resolves.toHaveLength(2);
  });

  it('returns nothing for a slug we do not have, rather than something close', async () => {
    searchPrograms.mockResolvedValue(response([offering(1)]));
    await expect(findProgramOfferings('institucion-de-prueba-001', 'no-existe')).resolves.toEqual(
      [],
    );
  });

  it('stops paging once the total has been covered', async () => {
    searchPrograms.mockResolvedValue(response([offering(1)], 1));
    await findProgramOfferings('institucion-de-prueba-001', 'programa-de-prueba-001');
    expect(searchPrograms).toHaveBeenCalledTimes(1);
  });

  it('keeps paging while the institution has more rows than one page', async () => {
    const page = Array.from({ length: 100 }, (_, index) => offering(index + 1));
    searchPrograms
      .mockResolvedValueOnce(response(page, 150))
      .mockResolvedValueOnce(response([offering(101, { programSlug: 'buscado' })], 150));

    const found = await findProgramOfferings('institucion-de-prueba-001', 'buscado');
    expect(searchPrograms).toHaveBeenCalledTimes(2);
    expect(found).toHaveLength(1);
  });

  it('scopes every query to the institution', async () => {
    searchPrograms.mockResolvedValue(response([]));
    await findProgramOfferings('institucion-de-prueba-001', 'x');
    expect(searchPrograms.mock.calls[0]![0]).toMatchObject({
      institutionSlug: 'institucion-de-prueba-001',
    });
  });
});

describe('findRelatedOfferings', () => {
  it('excludes the program\'s own institution — "related" means somewhere else', async () => {
    const source = offering(1, { careerSlug: 'carrera-de-prueba-001' });
    searchPrograms.mockResolvedValue(
      response([
        offering(2, { institutionSlug: 'institucion-de-prueba-001' }),
        offering(3, { institutionSlug: 'institucion-de-prueba-002' }),
      ]),
    );

    const related = await findRelatedOfferings(source);
    expect(related).toHaveLength(1);
    expect(related[0]!.institutionSlug).toBe('institucion-de-prueba-002');
  });

  it('does not pad the list with unrelated programs to reach the limit', async () => {
    const source = offering(1, { careerSlug: 'carrera-de-prueba-001' });
    searchPrograms.mockResolvedValue(
      response([offering(2, { institutionSlug: 'institucion-de-prueba-002' })]),
    );
    await expect(findRelatedOfferings(source, 3)).resolves.toHaveLength(1);
  });

  it('queries nothing at all when the row has neither carrera nor área', async () => {
    await expect(findRelatedOfferings(offering(1))).resolves.toEqual([]);
    expect(searchPrograms).not.toHaveBeenCalled();
  });

  it('falls back from carrera to área', async () => {
    const source = offering(1, { careerSlug: null, areaSlug: 'area-de-prueba-001' });
    searchPrograms.mockResolvedValue(
      response([offering(2, { institutionSlug: 'institucion-de-prueba-002' })]),
    );

    await findRelatedOfferings(source);
    expect(searchPrograms.mock.calls[0]![0]).toMatchObject({ areaSlugs: ['area-de-prueba-001'] });
  });
});
