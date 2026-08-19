/**
 * URL enumeration for the sitemap index (PR-40, `seo.md` §6).
 *
 * Every function here answers one question: *which URLs of this family return
 * an indexable 200?* — so the caller never has to re-derive an exclusion rule
 * that already lives somewhere else. That matters because each family is
 * gated differently and the gates are not in this file:
 *
 *   - career and area hubs are `noindex` below `hasEditorialCopy()`, so the
 *     raw `description_md` is returned and `src/app/sitemap.ts` applies the
 *     same predicate the pages' `generateMetadata` applies;
 *   - city pages exist only above `passesCityGate()`, so the counts the gate
 *     reads are returned rather than a pre-filtered list — one implementation
 *     of the threshold, in `@/lib/careers`, exactly as the page uses it;
 *   - programme and institution URLs come from `program_search`, which is
 *     already the published projection, so "in the index" *is* the gate.
 *
 * `lastmod` is always a real row timestamp. `new Date()` in a sitemap tells a
 * crawler every URL changed on every fetch, which trains it to ignore the
 * signal entirely — the acceptance criterion PR-40 states in those words.
 *
 * CLAUDE.md rule 5: all SQL lives here.
 */

import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { areas, careers, programSearch as ps } from '@/db/schema';

export interface SitemapEntry {
  slug: string;
  updatedAt: Date;
}

/** Career hubs, with the copy the `noindex` gate reads. */
export interface SitemapCareer extends SitemapEntry {
  descriptionMd: string | null;
}

/** One city variant of one career hub, with the numbers the gate reads. */
export interface SitemapCareerCity {
  careerSlug: string;
  citySlug: string;
  offeringCount: number;
  institutionCount: number;
  updatedAt: Date;
}

export async function listSitemapCareers(database: Db = defaultDb): Promise<SitemapCareer[]> {
  return database
    .select({
      slug: careers.slug,
      descriptionMd: careers.descriptionMd,
      updatedAt: careers.updatedAt,
    })
    .from(careers)
    .where(eq(careers.status, 'published'))
    .orderBy(asc(careers.slug));
}

/**
 * Areas carry no publication status — the taxonomy is seeded, not authored
 * (`seed:taxonomy`). The editorial gate is the only thing keeping a bare area
 * hub out of the index, same as `areas/[areaSlug]/page.tsx` applies it.
 */
export async function listSitemapAreas(database: Db = defaultDb): Promise<SitemapCareer[]> {
  return database
    .select({
      slug: areas.slug,
      descriptionMd: areas.descriptionMd,
      updatedAt: areas.updatedAt,
    })
    .from(areas)
    .orderBy(asc(areas.slug));
}

/**
 * Institution profiles, from the published index rather than the
 * `institutions` table: an institution whose every offering is unpublished
 * renders an empty profile, and an empty profile is not worth a crawl.
 */
export async function listSitemapInstitutions(database: Db = defaultDb): Promise<SitemapEntry[]> {
  const rows = await database
    .select({
      slug: ps.institutionSlug,
      updatedAt: sql<Date>`max(${ps.updatedAt})`,
    })
    .from(ps)
    .where(eq(ps.isPublished, true))
    .groupBy(ps.institutionSlug)
    .orderBy(asc(ps.institutionSlug));

  return rows.map((row) => ({ slug: row.slug, updatedAt: new Date(row.updatedAt) }));
}

/**
 * Programme pages, keyed exactly as `/universidades/[instSlug]/[programSlug]`
 * is: one URL per (institution, programme) pair, however many offerings sit
 * behind it. `max(updated_at)` across those offerings is the honest `lastmod`
 * — the page renders all of them.
 */
export async function listSitemapPrograms(
  database: Db = defaultDb,
): Promise<{ institutionSlug: string; programSlug: string; updatedAt: Date }[]> {
  const rows = await database
    .select({
      institutionSlug: ps.institutionSlug,
      programSlug: ps.programSlug,
      updatedAt: sql<Date>`max(${ps.updatedAt})`,
    })
    .from(ps)
    .where(eq(ps.isPublished, true))
    .groupBy(ps.institutionSlug, ps.programSlug)
    .orderBy(asc(ps.institutionSlug), asc(ps.programSlug));

  return rows.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) }));
}

/**
 * Every (career, city) pair in the published index, with the two counts
 * `passesCityGate()` reads. Deliberately one grouped query for all careers
 * rather than `getCareerCitySupply()` per career — `architecture.md` §11's
 * "never one query per row", which at ~200 careers is the difference between
 * a sitemap fetch and an outage.
 */
export async function listSitemapCareerCities(
  database: Db = defaultDb,
): Promise<SitemapCareerCity[]> {
  const rows = await database
    .select({
      careerSlug: ps.careerSlug,
      citySlug: ps.citySlug,
      offeringCount: sql<number>`count(*)`,
      institutionCount: sql<number>`count(distinct ${ps.institutionId})`,
      updatedAt: sql<Date>`max(${ps.updatedAt})`,
    })
    .from(ps)
    .where(and(eq(ps.isPublished, true), isNotNull(ps.careerSlug)))
    .groupBy(ps.careerSlug, ps.citySlug)
    .orderBy(asc(ps.careerSlug), asc(ps.citySlug));

  return rows.map((row) => ({
    careerSlug: row.careerSlug as string,
    citySlug: row.citySlug,
    offeringCount: Number(row.offeringCount),
    institutionCount: Number(row.institutionCount),
    updatedAt: new Date(row.updatedAt),
  }));
}
