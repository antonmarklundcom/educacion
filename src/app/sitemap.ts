import type { MetadataRoute } from 'next';

import { listBecaSlugs } from '@/db/queries/becas';
import { listPublishedPostSlugs } from '@/db/queries/posts';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const staticRoutes = [
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
];

/**
 * Still not the sitemap **index** `seo.md` §6 asks for — that split at 5,000
 * URLs, with careers/institutions/programs as separate children, belongs to
 * PR-16's SEO pack, which has not shipped.
 *
 * What PR-30 adds is the editorial half, because it is the half that would
 * otherwise be undiscoverable: a blog post has no inbound internal link until
 * somebody writes one, whereas every career and programme URL is already
 * reachable from `/carreras`. Posts are few and the query is one indexed read,
 * so this stays cheap; a database that is unreachable at request time degrades
 * to the static list rather than failing the route.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = staticRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  try {
    const [posts, becas] = await Promise.all([listPublishedPostSlugs(), listBecaSlugs()]);
    return [
      ...base,
      ...posts.map((post) => ({
        url: `${siteUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt,
      })),
      // Open becas only: `listBecaSlugs` applies the same deadline predicate the
      // listing does, so a closed convocatoria leaves the sitemap the day it
      // closes rather than inviting a crawl to a page that says "ya cerró".
      ...becas.map((beca) => ({
        url: `${siteUrl}/becas/${beca.slug}`,
        lastModified: beca.updatedAt,
      })),
    ];
  } catch {
    return base;
  }
}
