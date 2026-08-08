/**
 * What an institution can see about itself (PR-21). CLAUDE.md rule 5.
 *
 * Every function here takes the session and derives the institution id from it
 * with `panelInstitutionId` — **there is no overload that accepts an institution
 * id from the caller**, which is the same shape `architecture.md` §6.3 chose for
 * `listLeadsForInstitution`: an unscoped query cannot be written because the
 * signature does not allow one.
 *
 * The counterpart guard is `assertOwns*` in `scope.ts`, for the case a list
 * cannot cover: an id that arrives in a URL.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import {
  admissions,
  campuses,
  careers,
  cities,
  institutions,
  offerings,
  prices,
  programs,
} from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';

import { panelInstitutionId } from './scope';

export interface PanelProgramRow {
  id: number;
  nameOfficial: string;
  slug: string;
  level: (typeof programs.$inferSelect)['level'];
  status: (typeof programs.$inferSelect)['status'];
  careerName: string | null;
  offeringCount: number;
  /** Offerings of this programme with a current price row. */
  offeringsWithPrice: number;
}

export async function listOwnPrograms(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<PanelProgramRow[]> {
  const institutionId = panelInstitutionId(user);

  const rows = await database
    .select({
      id: programs.id,
      nameOfficial: programs.nameOfficial,
      slug: programs.slug,
      level: programs.level,
      status: programs.status,
      careerName: careers.nameEs,
      offeringCount: sql<number>`count(distinct ${offerings.id})`,
      offeringsWithPrice: sql<number>`count(distinct ${prices.offeringId})`,
    })
    .from(programs)
    .leftJoin(careers, eq(careers.id, programs.careerId))
    .leftJoin(offerings, eq(offerings.programId, programs.id))
    .leftJoin(prices, and(eq(prices.offeringId, offerings.id), eq(prices.isCurrent, true)))
    .where(eq(programs.institutionId, institutionId))
    .groupBy(programs.id, careers.nameEs)
    .orderBy(asc(programs.nameOfficial));

  return rows.map((row) => ({
    ...row,
    offeringCount: Number(row.offeringCount),
    offeringsWithPrice: Number(row.offeringsWithPrice),
  }));
}

export async function getOwnProgram(
  user: SessionUser | null | undefined,
  programId: number,
  database: Db = defaultDb,
): Promise<typeof programs.$inferSelect | null> {
  const institutionId = panelInstitutionId(user);
  // The institution id is in the WHERE, so this cannot return another
  // institution's row even before `assertOwnsProgram` runs. Both, on purpose:
  // the filter protects the read, the assert protects the write that follows.
  const [row] = await database
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.institutionId, institutionId)))
    .limit(1);
  return row ?? null;
}

export interface PanelOfferingRow {
  id: number;
  programId: number;
  programName: string;
  campusName: string;
  cityName: string;
  modality: (typeof offerings.$inferSelect)['modality'];
  shift: (typeof offerings.$inferSelect)['shift'];
  durationMonths: number | null;
  enrollmentStatus: (typeof offerings.$inferSelect)['enrollmentStatus'];
  status: (typeof offerings.$inferSelect)['status'];
  priceId: number | null;
  annualCost: number | null;
  isFree: boolean | null;
  priceVerifiedAt: Date | null;
}

export async function listOwnOfferings(
  user: SessionUser | null | undefined,
  options: { programId?: number } = {},
  database: Db = defaultDb,
): Promise<PanelOfferingRow[]> {
  const institutionId = panelInstitutionId(user);

  const conditions = [eq(programs.institutionId, institutionId)];
  if (options.programId) conditions.push(eq(offerings.programId, options.programId));

  const rows = await database
    .select({
      id: offerings.id,
      programId: offerings.programId,
      programName: programs.nameOfficial,
      campusName: campuses.name,
      cityName: cities.nameEs,
      modality: offerings.modality,
      shift: offerings.shift,
      durationMonths: offerings.durationMonths,
      enrollmentStatus: offerings.enrollmentStatus,
      status: offerings.status,
      priceId: prices.id,
      annualCost: prices.annualCost,
      isFree: prices.isFree,
      priceVerifiedAt: prices.verifiedAt,
    })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .innerJoin(campuses, eq(campuses.id, offerings.campusId))
    .innerJoin(cities, eq(cities.id, campuses.cityId))
    .leftJoin(prices, and(eq(prices.offeringId, offerings.id), eq(prices.isCurrent, true)))
    .where(and(...conditions))
    .orderBy(asc(programs.nameOfficial), asc(campuses.name));

  return rows as PanelOfferingRow[];
}

export async function getOwnOffering(
  user: SessionUser | null | undefined,
  offeringId: number,
  database: Db = defaultDb,
): Promise<(typeof offerings.$inferSelect & { programName: string }) | null> {
  const institutionId = panelInstitutionId(user);
  const [row] = await database
    .select({ offering: offerings, programName: programs.nameOfficial })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(and(eq(offerings.id, offeringId), eq(programs.institutionId, institutionId)))
    .limit(1);
  return row ? { ...row.offering, programName: row.programName } : null;
}

export async function getOwnCurrentPrice(
  user: SessionUser | null | undefined,
  offeringId: number,
  database: Db = defaultDb,
): Promise<typeof prices.$inferSelect | null> {
  const institutionId = panelInstitutionId(user);
  const [row] = await database
    .select({ price: prices })
    .from(prices)
    .innerJoin(offerings, eq(offerings.id, prices.offeringId))
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(
      and(
        eq(prices.offeringId, offeringId),
        eq(prices.isCurrent, true),
        eq(programs.institutionId, institutionId),
      ),
    )
    .limit(1);
  return row?.price ?? null;
}

/**
 * The institution's own convocatorias, at any of the three scopes.
 *
 * The programme- and offering-scoped ones are reached through their programme,
 * so an admission attached to another institution's programme is not in this
 * list even if somebody wrote our institution id onto it.
 */
export async function listOwnAdmissions(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<Array<typeof admissions.$inferSelect & { programName: string | null }>> {
  const institutionId = panelInstitutionId(user);

  const ownProgramIds = (
    await database
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.institutionId, institutionId))
  ).map((row) => row.id);

  const ownOfferingIds =
    ownProgramIds.length > 0
      ? (
          await database
            .select({ id: offerings.id })
            .from(offerings)
            .where(inArray(offerings.programId, ownProgramIds))
        ).map((row) => row.id)
      : [];

  const scopes = [eq(admissions.institutionId, institutionId)];
  if (ownProgramIds.length) scopes.push(inArray(admissions.programId, ownProgramIds));
  if (ownOfferingIds.length) scopes.push(inArray(admissions.offeringId, ownOfferingIds));

  const rows = await database
    .select({ row: admissions, programName: programs.nameOfficial })
    .from(admissions)
    .leftJoin(programs, eq(programs.id, admissions.programId))
    .where(sql`(${sql.join(scopes, sql` or `)})`)
    .orderBy(desc(admissions.registrationOpens));

  return rows.map((r) => ({ ...r.row, programName: r.programName }));
}

export interface PanelProfile {
  id: number;
  nameOfficial: string;
  nameShort: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  email: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  status: (typeof institutions.$inferSelect)['status'];
}

export async function getOwnInstitution(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<PanelProfile | null> {
  const institutionId = panelInstitutionId(user);
  const [row] = await database
    .select({
      id: institutions.id,
      nameOfficial: institutions.nameOfficial,
      nameShort: institutions.nameShort,
      slug: institutions.slug,
      logoUrl: institutions.logoUrl,
      website: institutions.website,
      email: institutions.email,
      phoneE164: institutions.phoneE164,
      whatsappE164: institutions.whatsappE164,
      status: institutions.status,
    })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);
  return row ?? null;
}

/** Campuses the institution may attach an offering to. Its own, only. */
export async function listOwnCampuses(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<Array<{ id: number; label: string }>> {
  const institutionId = panelInstitutionId(user);
  const rows = await database
    .select({ id: campuses.id, name: campuses.name, cityName: cities.nameEs })
    .from(campuses)
    .innerJoin(cities, eq(cities.id, campuses.cityId))
    .where(eq(campuses.institutionId, institutionId))
    .orderBy(asc(campuses.name));
  return rows.map((row) => ({ id: row.id, label: `${row.name} · ${row.cityName}` }));
}
