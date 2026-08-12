/**
 * Careers and areas — the taxonomy the browser filters by, and the two hub
 * page families PR-12 adds on top of it (CLAUDE.md rule 5, all SQL here).
 *
 * `searchPrograms()` stays the only way to read `program_search`. This module
 * only reads `careers` and `areas` themselves, plus small grouped aggregates
 * over `program_search` for counts — the same shape `institutions.ts` settled
 * in PR-11 (architecture.md §11): never one query per row, never a second
 * implementation of a rule that must have exactly one (the 12-month arancel
 * rule, the accreditation precedence rule) — this module returns no price and
 * no accreditation status, both still come from `searchPrograms()`.
 */

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { areas, careers, programSearch as ps } from '@/db/schema';
import type { Level } from '@/lib/search/contract';

export interface CareerRecord {
  id: number;
  slug: string;
  nameEs: string;
  levelDefault: Level;
  descriptionMd: string | null;
  /** Qualitative only — never salary or employability figures (risks.md R-11). */
  salidaLaboralMd: string | null;
  areaId: number | null;
  areaSlug: string | null;
  areaName: string | null;
}

export interface AreaRecord {
  id: number;
  slug: string;
  nameEs: string;
  descriptionMd: string | null;
  icon: string | null;
}

/** Facts about what we published, never about what a career "has". */
export interface CareerStats {
  offeringCount: number;
  institutionCount: number;
  cityCount: number;
}

export interface CareerCityStat {
  citySlug: string;
  cityName: string;
  offeringCount: number;
  institutionCount: number;
}

export interface CareerWithStats extends CareerRecord {
  stats: CareerStats;
}

const EMPTY_STATS: CareerStats = { offeringCount: 0, institutionCount: 0, cityCount: 0 };

/** One published career by slug, or `null` — the route turns that into a 404. */
export async function getCareerBySlug(
  slug: string,
  database: Db = defaultDb,
): Promise<CareerRecord | null> {
  const [row] = await database
    .select({
      id: careers.id,
      slug: careers.slug,
      nameEs: careers.nameEs,
      levelDefault: careers.levelDefault,
      descriptionMd: careers.descriptionMd,
      salidaLaboralMd: careers.salidaLaboralMd,
      areaId: careers.areaId,
      areaSlug: areas.slug,
      areaName: areas.nameEs,
    })
    .from(careers)
    .leftJoin(areas, eq(areas.id, careers.areaId))
    .where(and(eq(careers.slug, slug), eq(careers.status, 'published')))
    .limit(1);

  return row ?? null;
}

/** One area by slug, or `null`. Areas have no `status` — the taxonomy is fixed at seed time. */
export async function getAreaBySlug(
  slug: string,
  database: Db = defaultDb,
): Promise<AreaRecord | null> {
  const [row] = await database
    .select({
      id: areas.id,
      slug: areas.slug,
      nameEs: areas.nameEs,
      descriptionMd: areas.descriptionMd,
      icon: areas.icon,
    })
    .from(areas)
    .where(eq(areas.slug, slug))
    .limit(1);

  return row ?? null;
}

/**
 * Facts about one career's published index footprint: how many offerings, at
 * how many distinct institutions, in how many distinct cities. One grouped
 * aggregate, never a count derived by paging through `searchPrograms()`.
 */
export async function getCareerStats(
  careerId: number,
  database: Db = defaultDb,
): Promise<CareerStats> {
  const [row] = await database
    .select({
      offeringCount: sql<number>`count(*)`,
      institutionCount: sql<number>`count(distinct ${ps.institutionId})`,
      cityCount: sql<number>`count(distinct ${ps.cityId})`,
    })
    .from(ps)
    .where(and(eq(ps.isPublished, true), eq(ps.careerId, careerId)));

  if (!row) return EMPTY_STATS;
  return {
    offeringCount: Number(row.offeringCount),
    institutionCount: Number(row.institutionCount),
    cityCount: Number(row.cityCount),
  };
}

/**
 * One career's published supply, broken down by city. Serves two callers with
 * one query shape: the career hub links to every city that clears the gate,
 * and the city page itself reads the same row for its own city to decide
 * whether it may exist at all (seo.md §4) — so the gate is checked with the
 * same numbers it is advertised with, never a looser or stricter re-count.
 */
export async function getCareerCitySupply(
  careerId: number,
  database: Db = defaultDb,
): Promise<CareerCityStat[]> {
  const rows = await database
    .select({
      citySlug: ps.citySlug,
      cityName: ps.cityName,
      offeringCount: sql<number>`count(*)`,
      institutionCount: sql<number>`count(distinct ${ps.institutionId})`,
    })
    .from(ps)
    .where(and(eq(ps.isPublished, true), eq(ps.careerId, careerId)))
    .groupBy(ps.citySlug, ps.cityName)
    .orderBy(asc(ps.cityName));

  return rows.map((row) => ({
    citySlug: row.citySlug,
    cityName: row.cityName,
    offeringCount: Number(row.offeringCount),
    institutionCount: Number(row.institutionCount),
  }));
}

/**
 * Published careers in one area, with their published-index stats, for the
 * area hub. Two queries, merged in JS — the same "never one per row" rule as
 * `countsByInstitution` in `institutions.ts`.
 */
export async function listCareersByArea(
  areaId: number,
  database: Db = defaultDb,
): Promise<CareerWithStats[]> {
  const rows = await database
    .select({
      id: careers.id,
      slug: careers.slug,
      nameEs: careers.nameEs,
      levelDefault: careers.levelDefault,
      descriptionMd: careers.descriptionMd,
      areaId: careers.areaId,
    })
    .from(careers)
    .where(and(eq(careers.areaId, areaId), eq(careers.status, 'published')))
    .orderBy(asc(careers.nameEs));

  if (rows.length === 0) return [];

  const careerIds = rows.map((row) => row.id);
  const statRows = await database
    .select({
      careerId: ps.careerId,
      offeringCount: sql<number>`count(*)`,
      institutionCount: sql<number>`count(distinct ${ps.institutionId})`,
      cityCount: sql<number>`count(distinct ${ps.cityId})`,
    })
    .from(ps)
    .where(and(eq(ps.isPublished, true), inArray(ps.careerId, careerIds)))
    .groupBy(ps.careerId);

  const statsById = new Map<number, CareerStats>(
    statRows
      .filter((row): row is typeof row & { careerId: number } => row.careerId != null)
      .map((row) => [
        row.careerId,
        {
          offeringCount: Number(row.offeringCount),
          institutionCount: Number(row.institutionCount),
          cityCount: Number(row.cityCount),
        },
      ]),
  );

  return rows.map((row) => ({
    ...row,
    // This list feeds the área hub, which renders names and counts only —
    // `salida_laboral_md` is a detail-page field and is not selected here.
    salidaLaboralMd: null,
    areaSlug: null,
    areaName: null,
    stats: statsById.get(row.id) ?? EMPTY_STATS,
  }));
}

/**
 * Other published careers in the same area, for the career hub's internal
 * link (seo.md §7 — "related careers in the same area"). No stats: this is a
 * link list, not another count to keep consistent with `getCareerStats`.
 */
export async function listRelatedCareers(
  areaId: number,
  excludeCareerId: number,
  limit: number,
  database: Db = defaultDb,
): Promise<Array<{ slug: string; nameEs: string }>> {
  return database
    .select({ slug: careers.slug, nameEs: careers.nameEs })
    .from(careers)
    .where(
      and(
        eq(careers.areaId, areaId),
        eq(careers.status, 'published'),
        ne(careers.id, excludeCareerId),
      ),
    )
    .orderBy(asc(careers.nameEs))
    .limit(limit);
}
