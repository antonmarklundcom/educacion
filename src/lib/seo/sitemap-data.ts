/**
 * The one loader both sitemap routes share (PR-40).
 *
 * Kept out of `sitemap.ts` so that file stays free of database imports and
 * unit-testable without a `DATABASE_URL`, and out of the route handlers so
 * the index and its children can never disagree about what is indexable —
 * they compute the same `SitemapChild[]` from the same rows.
 */

import {
  listSitemapAreas,
  listSitemapCareerCities,
  listSitemapCareers,
  listSitemapInstitutions,
  listSitemapPrograms,
} from '@/db/queries/sitemap';
import { listBecaSlugs } from '@/db/queries/becas';
import { listPublishedPostSlugs } from '@/db/queries/posts';

import { buildSitemapChildren, type SitemapChild, type SitemapInput } from './sitemap';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

/**
 * A database that is unreachable at request time degrades to the static
 * routes rather than failing — the behaviour the file this replaces had, and
 * the one that matters most here: a 500 on `/sitemap.xml` during an outage
 * teaches Search Console the sitemap is broken, while a short file teaches it
 * nothing at all.
 */
export async function loadSitemapChildren(): Promise<SitemapChild[]> {
  const empty: SitemapInput = {
    careers: [],
    areas: [],
    careerCities: [],
    institutions: [],
    programs: [],
    posts: [],
    becas: [],
  };

  try {
    const [careers, areas, careerCities, institutions, programs, posts, becas] = await Promise.all([
      listSitemapCareers(),
      listSitemapAreas(),
      listSitemapCareerCities(),
      listSitemapInstitutions(),
      listSitemapPrograms(),
      listPublishedPostSlugs(),
      listBecaSlugs(),
    ]);

    return buildSitemapChildren({
      careers,
      areas,
      careerCities,
      institutions,
      programs,
      posts,
      becas,
    });
  } catch {
    return buildSitemapChildren(empty);
  }
}
