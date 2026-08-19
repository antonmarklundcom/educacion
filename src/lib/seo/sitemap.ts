/**
 * The sitemap index's rules, with no database and no framework in them
 * (PR-40, `seo.md` §6).
 *
 * Everything that decides *whether a URL is indexable* and *which child file
 * it lands in* lives here as pure functions over plain rows, so the two
 * acceptance criteria that are easy to get quietly wrong — "every indexable
 * public 200 appears exactly once" and "nothing `noindex` appears at all" —
 * are unit-testable without a `DATABASE_URL`, which CI does not have
 * (`architecture.md` §3).
 *
 * The gates are imported, never re-implemented: `hasEditorialCopy()` is the
 * same predicate the career and area hubs' `generateMetadata` calls, and
 * `passesCityGate()` is the same one `[ciudad]/page.tsx` calls before it
 * `notFound()`s. If a threshold moves, it moves in one place and the sitemap
 * follows automatically.
 */

import { passesCityGate } from '@/lib/careers';
import { hasEditorialCopy } from '@/lib/careers/copy';

/** `seo.md` §6. The protocol's own ceiling is 50,000; 5,000 keeps files small. */
export const URLS_PER_CHILD = 5000;

export interface SitemapUrl {
  /** Root-relative; the origin is prepended when the XML is serialized. */
  path: string;
  /**
   * Optional by design. A static route has no row behind it, and inventing a
   * timestamp for it would be the same lie as `new Date()` — better to omit
   * the tag than to emit one that is always "today".
   */
  lastmod?: Date;
}

export interface SitemapChild {
  /** File name without extension, e.g. `programas-2`. */
  id: string;
  urls: SitemapUrl[];
}

/**
 * The routes with no row behind them. `/comparar` is absent on purpose — it is
 * `noindex` (`seo.md` §2) and `robots.ts` disallows it; so is
 * `/universidades/[instSlug]/reclamar`, which is `noindex` per page.
 */
export const STATIC_PATHS = [
  '',
  '/blog',
  '/carreras',
  '/universidades',
  '/becas',
  '/acreditacion',
  '/para-instituciones',
  '/legal/privacidad',
  '/legal/terminos',
  '/legal/fuentes',
  '/legal/contacto',
] as const;

export interface SitemapInput {
  careers: { slug: string; descriptionMd: string | null; updatedAt: Date }[];
  areas: { slug: string; descriptionMd: string | null; updatedAt: Date }[];
  careerCities: {
    careerSlug: string;
    citySlug: string;
    offeringCount: number;
    institutionCount: number;
    updatedAt: Date;
  }[];
  institutions: { slug: string; updatedAt: Date }[];
  programs: { institutionSlug: string; programSlug: string; updatedAt: Date }[];
  posts: { slug: string; updatedAt: Date }[];
  becas: { slug: string; updatedAt: Date }[];
}

/**
 * One family per crawl-diagnosis unit: when Search Console reports "excluded"
 * against a child, the child name alone says which page type regressed.
 */
function families(input: SitemapInput): { name: string; urls: SitemapUrl[] }[] {
  const indexableCareers = input.careers.filter((c) => hasEditorialCopy(c.descriptionMd));
  // A city variant of a hub the hub itself hides would be an orphan doorway:
  // the gate passes, but the parent is `noindex`. Require both.
  const indexableCareerSlugs = new Set(indexableCareers.map((c) => c.slug));

  return [
    {
      name: 'paginas',
      urls: STATIC_PATHS.map((path) => ({ path })),
    },
    {
      name: 'carreras',
      urls: indexableCareers.flatMap((career) => [
        { path: `/carreras/${career.slug}`, lastmod: career.updatedAt },
        // `empleos` is a child of the hub with a self-canonical and no
        // `noindex`, so it is indexable and belongs here. PR-40's brief lists
        // four children and does not mention it; see the PR body.
        { path: `/carreras/${career.slug}/empleos`, lastmod: career.updatedAt },
      ]),
    },
    {
      name: 'areas',
      urls: input.areas
        .filter((area) => hasEditorialCopy(area.descriptionMd))
        .map((area) => ({ path: `/areas/${area.slug}`, lastmod: area.updatedAt })),
    },
    {
      name: 'ciudades',
      urls: input.careerCities
        .filter((city) => indexableCareerSlugs.has(city.careerSlug) && passesCityGate(city))
        .map((city) => ({
          path: `/carreras/${city.careerSlug}/${city.citySlug}`,
          lastmod: city.updatedAt,
        })),
    },
    {
      name: 'universidades',
      urls: input.institutions.map((inst) => ({
        path: `/universidades/${inst.slug}`,
        lastmod: inst.updatedAt,
      })),
    },
    {
      name: 'programas',
      urls: input.programs.map((program) => ({
        path: `/universidades/${program.institutionSlug}/${program.programSlug}`,
        lastmod: program.updatedAt,
      })),
    },
    {
      name: 'editorial',
      urls: [
        ...input.posts.map((post) => ({ path: `/blog/${post.slug}`, lastmod: post.updatedAt })),
        // Open convocatorias only — a closed beca is `noindex` and
        // `listBecaSlugs()` has already applied that same predicate.
        ...input.becas.map((beca) => ({ path: `/becas/${beca.slug}`, lastmod: beca.updatedAt })),
      ],
    },
  ];
}

/**
 * Families, in stable order, split into files of at most `URLS_PER_CHILD`.
 * An empty family produces no child at all rather than an empty file, so the
 * index never points a crawler at nothing.
 */
export function buildSitemapChildren(input: SitemapInput): SitemapChild[] {
  const children: SitemapChild[] = [];

  for (const family of families(input)) {
    // Deduplicate within a family: a career reachable through two rows must
    // still appear exactly once.
    const seen = new Set<string>();
    const urls = family.urls.filter((url) => {
      if (seen.has(url.path)) return false;
      seen.add(url.path);
      return true;
    });

    for (let offset = 0; offset < urls.length; offset += URLS_PER_CHILD) {
      const page = urls.slice(offset, offset + URLS_PER_CHILD);
      const partNumber = offset / URLS_PER_CHILD + 1;
      // A single-file family keeps its bare name; only a split adds a suffix,
      // so `/sitemap/programas.xml` does not churn into `programas-1.xml` the
      // day the catalog crosses 5,000.
      const id = urls.length > URLS_PER_CHILD ? `${family.name}-${partNumber}` : family.name;
      children.push({ id, urls: page });
    }
  }

  return children;
}

/* -------------------------------------------------------------------------- */
/* Serialization                                                              */
/* -------------------------------------------------------------------------- */

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * Slugs are lowercase ASCII by contract (`seo.md` §6), but the sitemap is
 * XML served to third parties: escaping is not optional just because today's
 * data happens not to need it.
 */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/** W3C datetime, which is what `lastmod` accepts. */
function lastmodValue(date: Date): string {
  return date.toISOString();
}

export function renderSitemapIndex(siteUrl: string, children: SitemapChild[]): string {
  const entries = children
    .map((child) => {
      const loc = escapeXml(`${siteUrl}/sitemap/${child.id}.xml`);
      // The index's own `lastmod` is the newest thing inside the child, so a
      // crawler can skip a file whose contents have not moved.
      const newest = child.urls
        .map((url) => url.lastmod)
        .filter((date): date is Date => date != null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const lastmod = newest ? `\n    <lastmod>${lastmodValue(newest)}</lastmod>` : '';
      return `  <sitemap>\n    <loc>${loc}</loc>${lastmod}\n  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

export function renderUrlSet(siteUrl: string, urls: SitemapUrl[]): string {
  const entries = urls
    .map((url) => {
      const loc = escapeXml(`${siteUrl}${url.path}`);
      const lastmod = url.lastmod ? `\n    <lastmod>${lastmodValue(url.lastmod)}</lastmod>` : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
