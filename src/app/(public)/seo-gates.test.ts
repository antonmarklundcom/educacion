/**
 * `seo.md` §1's filtered-view rule, on the four surfaces that were missing it
 * (PR-56).
 *
 * The rule — *a filtered view is `noindex, follow` with the canonical on the
 * clean route* — was implemented on `/carreras` in PR-09 and nowhere else. Every
 * other surface that renders the filter rail, or a search box, shipped a bare
 * self-canonical and an unconditional `index`. On `/universidades/[instSlug]`
 * that is one indexable near-duplicate per filter combination per institution,
 * all of them claiming to *be* the canonical page.
 *
 * These call the real `generateMetadata` exports. The data reads behind them are
 * mocked because the assertion is about `robots` and `alternates`, not about
 * what the page found.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCareerBySlug = vi.fn();
const getCareerStats = vi.fn();
const getCareerCitySupply = vi.fn();
const listRelatedCareers = vi.fn();
const getInstitutionBySlug = vi.fn();

vi.mock('@/lib/careers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/careers')>()),
  getCareerBySlug: (...a: unknown[]) => getCareerBySlug(...a),
  getCareerStats: (...a: unknown[]) => getCareerStats(...a),
  getCareerCitySupply: (...a: unknown[]) => getCareerCitySupply(...a),
  listRelatedCareers: (...a: unknown[]) => listRelatedCareers(...a),
}));
vi.mock('@/lib/institutions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/institutions')>()),
  getInstitutionBySlug: (...a: unknown[]) => getInstitutionBySlug(...a),
}));

const careerHub = await import('./carreras/[carreraSlug]/page');
const institutionPage = await import('./universidades/[instSlug]/page');
const acreditacion = await import('./acreditacion/page');
const becas = await import('./becas/page');

const sp = (params: Record<string, string> = {}) => Promise.resolve(params);

/** `robots` unset means "index" — the default — so absence is the assertion. */
function indexable(meta: { robots?: unknown }): boolean {
  return meta.robots === undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCareerBySlug.mockResolvedValue({
    id: 1,
    slug: 'medicina',
    nameEs: 'Medicina',
    areaId: 2,
    // Long enough to clear MIN_EDITORIAL_WORDS, so the *only* reason this page
    // could go noindex in these cases is the filter.
    descriptionMd: Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(' '),
  });
  getCareerStats.mockResolvedValue({ offeringCount: 9, institutionCount: 4, cityCount: 3 });
  getCareerCitySupply.mockResolvedValue([]);
  listRelatedCareers.mockResolvedValue([]);
  getInstitutionBySlug.mockResolvedValue({
    id: 1,
    slug: 'una',
    nameShort: 'UNA',
    nameOfficial: 'Universidad Nacional de Asunción',
    programCount: 40,
  });
});

describe('/carreras/[carreraSlug]', () => {
  const meta = (params?: Record<string, string>) =>
    careerHub.generateMetadata({
      params: Promise.resolve({ carreraSlug: 'medicina' }),
      searchParams: sp(params),
    });

  it('indexes the clean hub, with the canonical on itself', async () => {
    const result = await meta();
    expect(indexable(result)).toBe(true);
    expect(result.alternates?.canonical).toBe('/carreras/medicina');
  });

  it.each([
    ['a facet', { nivel: 'grado' }],
    ['a city', { ciudad: 'asuncion' }],
    ['free text', { q: 'cardiología' }],
  ])('drops %s out of the index while keeping the canonical', async (_label, params) => {
    const result = await meta(params);
    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates?.canonical).toBe('/carreras/medicina');
  });

  // The editorial gate is the other reason, and it still stands on its own.
  it('stays out of the index with no editorial copy, filtered or not', async () => {
    getCareerBySlug.mockResolvedValue({ id: 1, slug: 'medicina', nameEs: 'Medicina', areaId: 2 });
    expect(indexable(await meta())).toBe(false);
    expect(indexable(await meta({ nivel: 'grado' }))).toBe(false);
  });
});

describe('/universidades/[instSlug]', () => {
  const meta = (params?: Record<string, string>) =>
    institutionPage.generateMetadata({
      params: Promise.resolve({ instSlug: 'una' }),
      searchParams: sp(params),
    });

  it('indexes the clean profile', async () => {
    const result = await meta();
    expect(indexable(result)).toBe(true);
    expect(result.alternates?.canonical).toBe('/universidades/una');
  });

  it('drops a filtered profile out of the index', async () => {
    const result = await meta({ modalidad: 'distancia' });
    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates?.canonical).toBe('/universidades/una');
  });

  // The path already scopes the page to this institution, so the param the body
  // strips must not be mistaken for a filter the visitor applied.
  it('does not treat its own institution scope as a filter', async () => {
    expect(indexable(await meta({ institucion: 'una' }))).toBe(true);
  });

  // `parseSearchFilters` validates every value against its enum, so a junk
  // facet is dropped before it can narrow anything — the property `/becas` was
  // missing and this PR gives it too.
  it('does not treat an unknown facet value as a filter', async () => {
    expect(indexable(await meta({ modalidad: 'holograma' }))).toBe(true);
  });
});

describe('/acreditacion', () => {
  const meta = (params?: Record<string, string>) =>
    acreditacion.generateMetadata({ searchParams: sp(params) });

  it('indexes the explainer', async () => {
    expect(indexable(await meta())).toBe(true);
  });

  it('keeps every checker result out of the index', async () => {
    const result = await meta({ q: 'medicina una' });
    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.alternates?.canonical).toBe('/acreditacion');
  });

  it('treats a blank query as no query', async () => {
    expect(indexable(await meta({ q: '   ' }))).toBe(true);
  });
});

describe('/becas', () => {
  const meta = (params?: Record<string, string>) =>
    becas.generateMetadata({ searchParams: sp(params) });

  it('indexes the whole list', async () => {
    expect(indexable(await meta())).toBe(true);
  });

  it.each([
    ['a type', { tipo: 'estatal' }],
    ['an área', { area: 'salud' }],
    ['full coverage', { cobertura: 'total' }],
  ])('drops %s out of the index', async (_label, params) => {
    expect((await meta(params)).robots).toEqual({ index: false, follow: true });
  });

  // The defect underneath: `?tipo=<anything>` used to be cast straight into the
  // `WHERE`, so every one of infinitely many URLs rendered as a filtered page.
  it('does not treat an unknown tipo as a filter at all', async () => {
    expect(indexable(await meta({ tipo: 'inventado' }))).toBe(true);
    expect(indexable(await meta({ tipo: '' }))).toBe(true);
  });
});
