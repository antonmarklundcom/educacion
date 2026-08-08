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
  /**
   * Whether somebody has completed the claim flow for this institution (PR-22).
   * A boolean, not the user id: the profile is a public page and *who* runs an
   * institution's account is not public information.
   */
  isClaimed: boolean;
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

/* -------------------------------------------------------------------------- */
/* Contact details (PR-14)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The contact fields the lead pipeline needs, keyed by institution id.
 *
 * ### Why this is not on `OfferingSummary`
 *
 * `whatsapp_e164` is one value per institution and `program_search` is one row
 * per offering, so denormalizing it would mean ~10 000 copies of ~59 values
 * whose invalidation clock becomes the nightly rebuild. A number corrected in
 * the admin at 09:00 would stay wrong on every card until 03:00 the next day,
 * and a wrong number under a WhatsApp CTA sends a student to a stranger — worse
 * than no CTA. §11 already settled that institution contact fields live on
 * `institutions`; this is the same field class, read the same way.
 *
 * ### Why it is bounded
 *
 * One query for every institution on the page, keyed by the ids that are
 * already on the rows the index returned. One extra query per render, never one
 * per row.
 */
export interface InstitutionContact {
  id: number;
  nameShort: string;
  nameOfficial: string;
  email: string | null;
  whatsappE164: string | null;
}

export async function getInstitutionContacts(
  institutionIds: number[],
  database: Db = defaultDb,
): Promise<Map<number, InstitutionContact>> {
  const unique = [...new Set(institutionIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return new Map();

  const rows = await database
    .select({
      id: institutions.id,
      nameShort: institutions.nameShort,
      nameOfficial: institutions.nameOfficial,
      email: institutions.email,
      whatsappE164: institutions.whatsappE164,
    })
    .from(institutions)
    .where(and(eq(institutions.status, 'published'), inArray(institutions.id, unique)));

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Just the short names, for a page that has ids and needs labels — the admin
 * stats view. Deliberately not `getInstitutionContacts`: a page that only
 * renders names has no business holding email addresses in memory.
 */
export async function getInstitutionNames(
  institutionIds: number[],
  database: Db = defaultDb,
): Promise<Map<number, string>> {
  const unique = [...new Set(institutionIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return new Map();

  const rows = await database
    .select({ id: institutions.id, nameShort: institutions.nameShort })
    .from(institutions)
    .where(inArray(institutions.id, unique));

  return new Map(rows.map((row) => [row.id, row.nameShort]));
}

/**
 * Just the WhatsApp numbers, for pages that render a CTA and have no business
 * seeing an institution's email address. An institution that published no
 * number is simply absent from the map, and the CTA is not rendered.
 */
export async function getWhatsappNumbers(
  institutionIds: number[],
  database: Db = defaultDb,
): Promise<Map<number, string>> {
  const contacts = await getInstitutionContacts(institutionIds, database);
  const numbers = new Map<number, string>();
  for (const [id, contact] of contacts) {
    if (contact.whatsappE164) numbers.set(id, contact.whatsappE164);
  }
  return numbers;
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
      claimedByUserId: institutions.claimedByUserId,
    })
    .from(institutions)
    .where(and(eq(institutions.slug, slug), eq(institutions.status, 'published')))
    .limit(1);

  if (!row) return null;

  const { claimedByUserId, ...profile } = row;
  const counts = await countsByInstitution(database, [row.id]);
  return {
    ...profile,
    isClaimed: claimedByUserId != null,
    foundedYear: row.foundedYear ?? null,
    ...(counts.get(row.id) ?? EMPTY_COUNTS),
  };
}
