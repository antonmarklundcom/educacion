/**
 * The institution directory (CLAUDE.md rule 5 — all SQL lives here).
 *
 * ### Why this file exists at all
 *
 * `searchPrograms()` is the only way to read the *index*, and PR-08 through
 * PR-10 needed nothing else. `/universidades` is the first page that is not a
 * list of offerings: it is a list of **institutions**, and the search contract
 * has no institution facet — `institutionSlug` narrows, it is not counted. The
 * alternatives were to page through every offering in the country to derive
 * ~59 institutions (about 100 queries), or to add a ninth facet group to a
 * layer PR-07 deliberately closed. Neither is better than two small reads here.
 *
 * The institution *profile* fields (website, email, teléfono, descripción,
 * año de fundación) are a second reason: they live on `institutions` and are
 * not, and should not be, denormalized into `program_search`, which is one row
 * per offering.
 *
 * ### What it does not do
 *
 * It does not re-implement any search semantics. Program lists on an
 * institution page still go through `searchPrograms({ institutionSlug })`, so
 * filtering, faceting, sorting, paging and — critically — the 12-month arancel
 * rule stay in exactly one place. Nothing here returns a price.
 *
 * ### Query count
 *
 * Two, always: one for the institutions, one for the per-institution
 * aggregates over `program_search`, merged in JS. Never one query per row.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions, programSearch as ps } from '@/db/schema';
import type { InstitutionType, Management } from '@/lib/search/contract';

/** Counts derived from the published index. Every one of them is a fact. */
export interface InstitutionCounts {
  /** Distinct programs with at least one published offering. */
  programCount: number;
  offeringCount: number;
  /** Programs whose winning accreditation row is a current ANEAES one. */
  aneaesAccreditedCount: number;
  /** Where the institution actually teaches, from its published offerings. */
  cityNames: string[];
}

export interface InstitutionSummary extends InstitutionCounts {
  id: number;
  slug: string;
  nameOfficial: string;
  nameShort: string;
  logoUrl: string | null;
  brandColor: string | null;
  management: Management;
  type: InstitutionType;
}

export interface InstitutionProfile extends InstitutionSummary {
  foundedYear: number | null;
  website: string | null;
  email: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  descriptionMd: string | null;
}

const EMPTY_COUNTS: InstitutionCounts = {
  programCount: 0,
  offeringCount: 0,
  aneaesAccreditedCount: 0,
  cityNames: [],
};

/**
 * `GROUP_CONCAT` is capped by `group_concat_max_len` (1 KB by default), which
 * is plenty for the handful of cities one institution teaches in and is a hard
 * bound on how much this column can return.
 */
async function countsByInstitution(
  database: Db,
  institutionIds: number[],
): Promise<Map<number, InstitutionCounts>> {
  if (institutionIds.length === 0) return new Map();

  const rows = await database
    .select({
      institutionId: ps.institutionId,
      programCount: sql<number>`count(distinct ${ps.programId})`,
      offeringCount: sql<number>`count(*)`,
      aneaesAccreditedCount: sql<number>`count(distinct case when ${ps.accreditationStatus} = 'vigente' and ${ps.accreditationAgency} = 'ANEAES' then ${ps.programId} end)`,
      cityNames: sql<
        string | null
      >`group_concat(distinct ${ps.cityName} order by ${ps.cityName} separator '|')`,
    })
    .from(ps)
    .where(and(eq(ps.isPublished, true), inArray(ps.institutionId, institutionIds)))
    .groupBy(ps.institutionId);

  return new Map(
    rows.map((row) => [
      Number(row.institutionId),
      {
        programCount: Number(row.programCount),
        offeringCount: Number(row.offeringCount),
        aneaesAccreditedCount: Number(row.aneaesAccreditedCount),
        cityNames: row.cityNames ? row.cityNames.split('|').filter(Boolean) : [],
      },
    ]),
  );
}

const SUMMARY_COLUMNS = {
  id: institutions.id,
  slug: institutions.slug,
  nameOfficial: institutions.nameOfficial,
  nameShort: institutions.nameShort,
  logoUrl: institutions.logoUrl,
  brandColor: institutions.brandColor,
  management: institutions.management,
  type: institutions.type,
} as const;

/**
 * Every published institution, alphabetically by short name.
 *
 * Institutions with no published offerings are included with a zero count —
 * they exist in the CONES register, and dropping them would misrepresent the
 * register as smaller than it is. The page says "sin carreras publicadas"
 * rather than pretending the institution is not there.
 */
export async function listInstitutions(database: Db = defaultDb): Promise<InstitutionSummary[]> {
  const rows = await database
    .select(SUMMARY_COLUMNS)
    .from(institutions)
    .where(eq(institutions.status, 'published'))
    .orderBy(asc(institutions.nameShort));

  const counts = await countsByInstitution(
    database,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({ ...row, ...(counts.get(row.id) ?? EMPTY_COUNTS) }));
}

/** One institution's full profile, or `null` — which the route turns into a 404. */
export async function getInstitutionBySlug(
  slug: string,
  database: Db = defaultDb,
): Promise<InstitutionProfile | null> {
  const [row] = await database
    .select({
      ...SUMMARY_COLUMNS,
      foundedYear: institutions.foundedYear,
      website: institutions.website,
      email: institutions.email,
      phoneE164: institutions.phoneE164,
      whatsappE164: institutions.whatsappE164,
      descriptionMd: institutions.descriptionMd,
    })
    .from(institutions)
    .where(and(eq(institutions.slug, slug), eq(institutions.status, 'published')))
    .limit(1);

  if (!row) return null;

  const counts = await countsByInstitution(database, [row.id]);
  return {
    ...row,
    foundedYear: row.foundedYear ?? null,
    ...(counts.get(row.id) ?? EMPTY_COUNTS),
  };
}
