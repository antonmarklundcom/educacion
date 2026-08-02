import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const staticRoutes = [
  '',
  '/carreras',
  '/universidades',
  '/becas',
  '/acreditacion',
  '/para-instituciones',
  '/legal/privacidad',
  '/legal/terminos',
  '/legal/fuentes',
];

/**
 * Stub only — becomes a sitemap index split at 5,000 URLs (careers, institutions,
 * programs, editorial as separate children) once the data pipeline exists. See
 * docs/seo.md §6 and PR-16.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return staticRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));
}
