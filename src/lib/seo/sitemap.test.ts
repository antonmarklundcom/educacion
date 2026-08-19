import { describe, expect, it } from 'vitest';

import { MIN_EDITORIAL_WORDS } from '@/lib/careers/copy';
import { CITY_GATE_MIN_INSTITUTIONS, CITY_GATE_MIN_OFFERINGS } from '@/lib/careers';

import {
  buildSitemapChildren,
  renderSitemapIndex,
  renderUrlSet,
  STATIC_PATHS,
  URLS_PER_CHILD,
  type SitemapInput,
} from './sitemap';

const editorial = Array.from({ length: MIN_EDITORIAL_WORDS }, () => 'palabra').join(' ');
const tooShort = Array.from({ length: MIN_EDITORIAL_WORDS - 1 }, () => 'palabra').join(' ');
const STAMP = new Date('2026-03-04T10:00:00.000Z');

function input(overrides: Partial<SitemapInput> = {}): SitemapInput {
  return {
    careers: [],
    areas: [],
    careerCities: [],
    institutions: [],
    programs: [],
    posts: [],
    becas: [],
    ...overrides,
  };
}

/** Every path in every child, which is what the "exactly once" rule is about. */
function allPaths(built: ReturnType<typeof buildSitemapChildren>): string[] {
  return built.flatMap((child) => child.urls.map((url) => url.path));
}

describe('buildSitemapChildren — what is allowed in', () => {
  it('always lists the static routes, and never the noindex ones', () => {
    const paths = allPaths(buildSitemapChildren(input()));

    for (const path of STATIC_PATHS) expect(paths).toContain(path);
    // `/comparar` is noindex (seo.md §2) and disallowed in robots.ts.
    expect(paths).not.toContain('/comparar');
    expect(paths.some((path) => path.includes('/reclamar'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/panel'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/admin'))).toBe(false);
  });

  it('omits a career hub whose copy is below the editorial gate', () => {
    const paths = allPaths(
      buildSitemapChildren(
        input({
          careers: [
            { slug: 'medicina', descriptionMd: editorial, updatedAt: STAMP },
            { slug: 'enfermeria', descriptionMd: tooShort, updatedAt: STAMP },
            { slug: 'derecho', descriptionMd: null, updatedAt: STAMP },
          ],
        }),
      ),
    );

    expect(paths).toContain('/carreras/medicina');
    expect(paths).not.toContain('/carreras/enfermeria');
    expect(paths).not.toContain('/carreras/derecho');
  });

  it('omits an area hub below the same gate', () => {
    const paths = allPaths(
      buildSitemapChildren(
        input({
          areas: [
            { slug: 'salud', descriptionMd: editorial, updatedAt: STAMP },
            { slug: 'artes', descriptionMd: tooShort, updatedAt: STAMP },
          ],
        }),
      ),
    );

    expect(paths).toContain('/areas/salud');
    expect(paths).not.toContain('/areas/artes');
  });

  it('applies the anti-doorway city gate at exactly the page thresholds', () => {
    const careers = [{ slug: 'medicina', descriptionMd: editorial, updatedAt: STAMP }];
    const paths = allPaths(
      buildSitemapChildren(
        input({
          careers,
          careerCities: [
            {
              careerSlug: 'medicina',
              citySlug: 'asuncion',
              offeringCount: CITY_GATE_MIN_OFFERINGS,
              institutionCount: CITY_GATE_MIN_INSTITUTIONS,
              updatedAt: STAMP,
            },
            {
              careerSlug: 'medicina',
              citySlug: 'encarnacion',
              offeringCount: CITY_GATE_MIN_OFFERINGS - 1,
              institutionCount: CITY_GATE_MIN_INSTITUTIONS,
              updatedAt: STAMP,
            },
            {
              careerSlug: 'medicina',
              citySlug: 'ciudad-del-este',
              offeringCount: CITY_GATE_MIN_OFFERINGS,
              institutionCount: CITY_GATE_MIN_INSTITUTIONS - 1,
              updatedAt: STAMP,
            },
          ],
        }),
      ),
    );

    expect(paths).toContain('/carreras/medicina/asuncion');
    expect(paths).not.toContain('/carreras/medicina/encarnacion');
    expect(paths).not.toContain('/carreras/medicina/ciudad-del-este');
  });

  it('never lists a city page whose parent hub is itself noindex', () => {
    const paths = allPaths(
      buildSitemapChildren(
        input({
          careers: [{ slug: 'enfermeria', descriptionMd: tooShort, updatedAt: STAMP }],
          careerCities: [
            {
              careerSlug: 'enfermeria',
              citySlug: 'asuncion',
              offeringCount: CITY_GATE_MIN_OFFERINGS,
              institutionCount: CITY_GATE_MIN_INSTITUTIONS,
              updatedAt: STAMP,
            },
          ],
        }),
      ),
    );

    expect(paths).not.toContain('/carreras/enfermeria/asuncion');
  });

  it('lists each programme URL once, however many offerings sit behind it', () => {
    const paths = allPaths(
      buildSitemapChildren(
        input({
          programs: [
            { institutionSlug: 'una', programSlug: 'medicina', updatedAt: STAMP },
            { institutionSlug: 'una', programSlug: 'odontologia', updatedAt: STAMP },
          ],
        }),
      ),
    );

    expect(paths.filter((path) => path === '/universidades/una/medicina')).toHaveLength(1);
    expect(paths).toContain('/universidades/una/odontologia');
  });

  it('emits every path at most once across all children', () => {
    const built = buildSitemapChildren(
      input({
        careers: [{ slug: 'medicina', descriptionMd: editorial, updatedAt: STAMP }],
        areas: [{ slug: 'salud', descriptionMd: editorial, updatedAt: STAMP }],
        institutions: [{ slug: 'una', updatedAt: STAMP }],
        programs: [{ institutionSlug: 'una', programSlug: 'medicina', updatedAt: STAMP }],
        posts: [{ slug: 'como-elegir-carrera', updatedAt: STAMP }],
        becas: [{ slug: 'becal', updatedAt: STAMP }],
      }),
    );

    const paths = allPaths(built);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('buildSitemapChildren — splitting', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      institutionSlug: 'una',
      programSlug: `programa-${i}`,
      updatedAt: STAMP,
    }));

  it('keeps a family in one unsuffixed file while it fits', () => {
    const built = buildSitemapChildren(input({ programs: many(URLS_PER_CHILD) }));
    const ids = built.map((child) => child.id);

    expect(ids).toContain('programas');
    expect(ids).not.toContain('programas-1');
  });

  it('splits at URLS_PER_CHILD and loses nothing', () => {
    const total = URLS_PER_CHILD + 1;
    const built = buildSitemapChildren(input({ programs: many(total) }));
    const parts = built.filter((child) => child.id.startsWith('programas'));

    expect(parts.map((child) => child.id)).toEqual(['programas-1', 'programas-2']);
    expect(parts[0].urls).toHaveLength(URLS_PER_CHILD);
    expect(parts[1].urls).toHaveLength(1);
    expect(parts.flatMap((child) => child.urls)).toHaveLength(total);
  });

  it('produces no child at all for an empty family', () => {
    const ids = buildSitemapChildren(input()).map((child) => child.id);
    expect(ids).not.toContain('programas');
    expect(ids).toContain('paginas');
  });
});

describe('serialization', () => {
  const built = buildSitemapChildren(input({ institutions: [{ slug: 'una', updatedAt: STAMP }] }));

  it('renders an index that points at every child', () => {
    const xml = renderSitemapIndex('https://educacion.com.py', built);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    for (const child of built) {
      expect(xml).toContain(`<loc>https://educacion.com.py/sitemap/${child.id}.xml</loc>`);
    }
    expect(xml.trimEnd().endsWith('</sitemapindex>')).toBe(true);
  });

  it('carries real row timestamps and never a generation time', () => {
    const xml = renderUrlSet(
      'https://educacion.com.py',
      built.find((child) => child.id === 'universidades')!.urls,
    );

    expect(xml).toContain('<lastmod>2026-03-04T10:00:00.000Z</lastmod>');
    expect(xml).not.toContain(new Date().toISOString().slice(0, 10));
  });

  it('omits lastmod for routes with no row behind them', () => {
    const paginas = built.find((child) => child.id === 'paginas')!;
    const xml = renderUrlSet('https://educacion.com.py', paginas.urls);

    expect(xml).toContain('<loc>https://educacion.com.py/carreras</loc>');
    expect(xml).not.toContain('<lastmod>');
  });

  it('escapes XML metacharacters in a path', () => {
    const xml = renderUrlSet('https://educacion.com.py', [{ path: '/blog/a&b' }]);

    expect(xml).toContain('<loc>https://educacion.com.py/blog/a&amp;b</loc>');
    expect(xml).not.toContain('/blog/a&b<');
  });
});
