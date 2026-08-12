/**
 * Plans and the subscription facts the entitlements layer resolves — reads
 * only (CLAUDE.md rule 5).
 *
 * Split from `subscriptions.ts` for one mechanical reason: every mutation
 * there rebuilds `program_search`, so that module imports
 * `rebuild-search.ts` — and `rebuild-search.ts` needs these reads to compute
 * `plan_rank`. Keeping the reads here is what stops that from being an import
 * cycle. The rule of thumb it leaves behind: this file never writes, and
 * nothing here takes a `SessionUser`, because plan *prices* are public
 * (`/para-instituciones` renders them) even though subscription *rows* are not.
 */

import { asc, eq, inArray } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { plans, subscriptions } from '@/db/schema';
import type { PlanBand } from '@/lib/entitlements/bands';
import type { PlanRank } from '@/lib/entitlements/contract';
import type { SubscriptionFacts, SubscriptionStatus } from '@/lib/entitlements/resolve';

/* -------------------------------------------------------------------------- */
/* Plans — a public read: the sales page renders the price table from this     */
/* -------------------------------------------------------------------------- */

function toPlanBand(row: typeof plans.$inferSelect): PlanBand {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    priceUsdYear: row.priceUsdYear,
    programBandMin: row.programBandMin,
    programBandMax: row.programBandMax ?? null,
    rank: (row.rank as PlanRank) ?? 0,
    includedLeadsMonth: row.includedLeadsMonth ?? null,
    featuresJson: row.featuresJson ?? null,
  };
}

/**
 * Every plan we sell, cheapest first. No role check: PR-26's `/para-instituciones`
 * is a public page and its price table is rendered from these rows rather than
 * hardcoded, which is that PR's acceptance criterion.
 */
export async function listPlans(database: Db = defaultDb): Promise<PlanBand[]> {
  const rows = await database
    .select()
    .from(plans)
    .orderBy(asc(plans.rank), asc(plans.priceUsdYear));
  return rows.map(toPlanBand);
}

export async function getPlanById(id: number, database: Db = defaultDb): Promise<PlanBand | null> {
  const [row] = await database.select().from(plans).where(eq(plans.id, id)).limit(1);
  return row ? toPlanBand(row) : null;
}

/* -------------------------------------------------------------------------- */
/* The read the entitlements layer is built on                                */
/* -------------------------------------------------------------------------- */

/**
 * Every subscription of these institutions, joined to its plan.
 *
 * Deliberately unfiltered by status or date: the decision about which rows
 * count today is `resolveEntitlements`'s, and it is a pure function precisely
 * so that decision is not spread between a WHERE clause and a resolver. The
 * row count per institution is single digits.
 */
export async function subscriptionFactsFor(
  institutionIds: readonly number[],
  database: Db = defaultDb,
): Promise<SubscriptionFacts[]> {
  if (institutionIds.length === 0) return [];

  const rows = await database
    .select({
      id: subscriptions.id,
      institutionId: subscriptions.institutionId,
      status: subscriptions.status,
      startsOn: subscriptions.startsOn,
      endsOn: subscriptions.endsOn,
      planCode: plans.code,
      planName: plans.name,
      planRank: plans.rank,
      includedLeadsMonth: plans.includedLeadsMonth,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(inArray(subscriptions.institutionId, [...institutionIds]));

  return rows.map((row) => ({
    id: row.id,
    institutionId: row.institutionId,
    status: row.status as SubscriptionStatus,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    planCode: row.planCode,
    planName: row.planName,
    planRank: (row.planRank as PlanRank) ?? 0,
    includedLeadsMonth: row.includedLeadsMonth ?? null,
  }));
}

/** Every subscription in the database, joined to its plan — the nightly rebuild's read. */
export async function allSubscriptionFacts(database: Db = defaultDb): Promise<SubscriptionFacts[]> {
  const rows = await database
    .select({
      id: subscriptions.id,
      institutionId: subscriptions.institutionId,
      status: subscriptions.status,
      startsOn: subscriptions.startsOn,
      endsOn: subscriptions.endsOn,
      planCode: plans.code,
      planName: plans.name,
      planRank: plans.rank,
      includedLeadsMonth: plans.includedLeadsMonth,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId));

  return rows.map((row) => ({
    id: row.id,
    institutionId: row.institutionId,
    status: row.status as SubscriptionStatus,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    planCode: row.planCode,
    planName: row.planName,
    planRank: (row.planRank as PlanRank) ?? 0,
    includedLeadsMonth: row.includedLeadsMonth ?? null,
  }));
}
