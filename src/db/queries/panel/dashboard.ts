/**
 * The panel's dashboard numbers (PR-21). Rule 5.
 *
 * Every figure is a fact about **this institution's own rows**, derived from the
 * session's scope — there is no parameter that could widen it. Two of them are
 * the ones that make the panel worth logging into:
 *
 * - **Carreras sin arancel publicado.** The gap the institution can close in
 *   five minutes and nobody else can (`risks.md` §R-03).
 * - **Aranceles vencidos.** A statement of what their own pages are *currently
 *   hedging on*: a price past 12 months is shown with a visible "dato
 *   desactualizado" beside it (`data-model.md` §2, PR-33) and withheld from
 *   `Offer` JSON-LD. This is the sentence that gets a price updated. It counts
 *   never-verified rows too — those are not "old", they carry no date at all,
 *   and they render the same warning — and it does **not** filter by
 *   publication, so it includes drafts, which are not indexed and are shown
 *   nowhere. The copy on `/panel` says both of those in as many words rather
 *   than telling an institution its unpublished prices are live (PR-48b).
 *
 * The engagement counts come from `events` through the same aggregate PR-17
 * fixed with an optional `institutionId` (`architecture.md` §12), so PR-28's
 * dashboard will be these same questions and no second set of queries.
 */

import { and, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { PRICE_MAX_AGE_MONTHS } from '@/db/invariants';
import { admissions, curationConflicts, leads, offerings, prices, programs } from '@/db/schema';
import { countEventsByType } from '@/db/queries/events';
import type { SessionUser } from '@/lib/auth/session';
import { slaCutoff } from '@/lib/leads/sla';

import { panelInstitutionId } from './scope';

export interface PanelDashboard {
  programCount: number;
  offeringCount: number;
  publishedOfferings: number;
  offeringsWithoutPrice: number;
  pricesExpired: number;
  activeAdmissions: number;
  newLeads: number;
  /** Of `newLeads`, those past the 48 h SLA (PR-49). Derived, never stored. */
  overdueLeads: number;
  leadsLast30: number;
  offeringViewsLast30: number;
  whatsappClicksLast30: number;
  openReviewRequests: number;
}

function monthsAgo(months: number, now: Date): Date {
  const date = new Date(now.getTime());
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

export async function panelDashboard(
  user: SessionUser | null | undefined,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<PanelDashboard> {
  const institutionId = panelInstitutionId(user);
  const priceCutoff = monthsAgo(PRICE_MAX_AGE_MONTHS, now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const one = async (query: Promise<Array<{ count: number }>>) =>
    Number((await query)[0]?.count ?? 0);

  const ownProgramIds = (
    await database
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.institutionId, institutionId))
  ).map((row) => row.id);

  const [
    offeringCount,
    publishedOfferings,
    offeringsWithoutPrice,
    pricesExpired,
    newLeads,
    overdueLeads,
    leadsLast30,
    events,
    openReviewRequests,
    activeAdmissions,
  ] = await Promise.all([
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(offerings)
        .innerJoin(programs, eq(programs.id, offerings.programId))
        .where(eq(programs.institutionId, institutionId)),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(offerings)
        .innerJoin(programs, eq(programs.id, offerings.programId))
        .where(and(eq(programs.institutionId, institutionId), eq(offerings.status, 'published'))),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(offerings)
        .innerJoin(programs, eq(programs.id, offerings.programId))
        .leftJoin(prices, and(eq(prices.offeringId, offerings.id), eq(prices.isCurrent, true)))
        .where(
          and(
            eq(programs.institutionId, institutionId),
            eq(offerings.status, 'published'),
            isNull(prices.id),
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(prices)
        .innerJoin(offerings, eq(offerings.id, prices.offeringId))
        .innerJoin(programs, eq(programs.id, offerings.programId))
        .where(
          and(
            eq(programs.institutionId, institutionId),
            eq(prices.isCurrent, true),
            or(isNull(prices.verifiedAt), lt(prices.verifiedAt, priceCutoff)),
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(and(eq(leads.institutionId, institutionId), eq(leads.status, 'new'))),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(
          and(
            eq(leads.institutionId, institutionId),
            eq(leads.status, 'new'),
            lte(leads.createdAt, slaCutoff(now)),
          ),
        ),
    ),
    one(
      database
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(and(eq(leads.institutionId, institutionId), gte(leads.createdAt, thirtyDaysAgo))),
    ),
    countEventsByType({ since: thirtyDaysAgo, until: now }, institutionId, database),
    ownProgramIds.length === 0
      ? Promise.resolve(0)
      : one(
          database
            .select({ count: sql<number>`count(*)` })
            .from(curationConflicts)
            .where(
              and(
                eq(curationConflicts.status, 'open'),
                eq(curationConflicts.entityType, 'program'),
                inArray(curationConflicts.entityId, ownProgramIds),
              ),
            ),
        ),
    // Convocatorias the institution owns that are currently active. Scoped
    // through its own programmes as well as directly, so an institution-wide
    // row and a programme-scoped one both count once.
    one(
      database
        .select({ count: sql<number>`count(distinct ${admissions.id})` })
        .from(admissions)
        .leftJoin(programs, eq(programs.id, admissions.programId))
        .where(
          and(
            eq(admissions.isActive, true),
            or(
              eq(admissions.institutionId, institutionId),
              eq(programs.institutionId, institutionId),
            ),
          ),
        ),
    ),
  ]);

  const byType = new Map(events.map((row) => [row.type, row.events]));

  return {
    programCount: ownProgramIds.length,
    offeringCount,
    publishedOfferings,
    offeringsWithoutPrice,
    pricesExpired,
    activeAdmissions,
    newLeads,
    overdueLeads,
    leadsLast30,
    offeringViewsLast30: byType.get('offering_view') ?? 0,
    whatsappClicksLast30: byType.get('whatsapp_click') ?? 0,
    openReviewRequests,
  };
}
