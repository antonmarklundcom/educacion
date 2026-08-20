/**
 * `lib/entitlements` — the single source of truth for feature gating (PR-25).
 *
 * Anything that asks "may this institution have X" asks here, on the server,
 * on the request that renders or writes X. There is deliberately **no** cached
 * "current plan" column, no session field and no client-readable flag: the
 * answer is recomputed from `subscriptions` every time, which is what makes a
 * downgrade take effect on the next request rather than on the next cron.
 *
 * The split in this directory:
 *
 * | File          | What it holds                                              |
 * |---------------|------------------------------------------------------------|
 * | `contract.ts` | Feature vocabulary and the rank → features matrix. No I/O. |
 * | `resolve.ts`  | Subscriptions + today → entitlements. Pure, unit-tested.   |
 * | `bands.ts`    | Which Verificado band a programme count is quoted.         |
 * | `index.ts`    | This file: the async reads and the server-side guard.      |
 *
 * `requireFeature` is the form a mutation calls. It throws `AuthError` like
 * `requireRole` does, and for the same reason (`architecture.md` §7.1): a
 * caller who ignores a returned `false` still ships.
 */

import type { Db } from '@/db';
import { subscriptionFactsFor } from '@/db/queries/plans';
import { AuthError } from '@/lib/auth/roles';
import { billingGraceDays } from '@/lib/billing/config';

import {
  placementFlags,
  type Entitlements,
  type FeatureKey,
  type PlacementFlags,
} from './contract';
import { resolveEntitlements, type ResolveOptions } from './resolve';

export {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURES_BY_RANK,
  NO_FEATURES,
  NO_PLACEMENT,
  PLAN_RANKS,
  can,
  placementFlags,
  freeEntitlements,
  type Entitlements,
  type EntitlementStatus,
  type FeatureKey,
  type FeatureSet,
  type PlacementFlags,
  type PlanRank,
} from './contract';

export {
  dateOnly,
  resolveEntitlements,
  subscriptionStanding,
  type ResolveOptions,
  type SubscriptionFacts,
  type SubscriptionStatus,
} from './resolve';

export {
  bandCovers,
  bandForProgramCount,
  bandLabel,
  bandsOfRank,
  priceIsFrom,
  type PlanBand,
} from './bands';

/**
 * Days a `past_due` subscription keeps its features after its period ends.
 *
 * PR-25 shipped this as a constant `0` and said PR-29 would make it
 * configurable; it now reads `BILLING_GRACE_DAYS` (default 15,
 * `lib/billing/config.ts`). It is a **function**, not a constant, because the
 * value is read per call: changing a grace period on a live site should be an
 * env change and a restart, not a redeploy, and a captured constant would
 * silently keep the old value in a warm process.
 *
 * The window only matters for a subscription that has been marked `past_due`.
 * An `active` row that simply ran out stops granting at `ends_on` — so a
 * missed sweep can only ever under-grant, never extend features nobody paid
 * for.
 */
export function pastDueGraceDays(): number {
  return billingGraceDays();
}

function defaultOptions(options?: ResolveOptions): ResolveOptions {
  // `graceDays` is read off `options` rather than spread over the default: a
  // caller passing an explicit `{ graceDays: undefined }` — type-legal without
  // `exactOptionalPropertyTypes` — would otherwise spread the default away, and
  // `resolve.ts`'s `?? 0` would revoke every `past_due` account instantly.
  return { ...options, graceDays: options?.graceDays ?? billingGraceDays() };
}

/** What this institution may have, right now. */
export async function getEntitlements(
  institutionId: number,
  options?: ResolveOptions,
  database?: Db,
): Promise<Entitlements> {
  const facts = await subscriptionFactsFor([institutionId], database);
  return resolveEntitlements(institutionId, facts, defaultOptions(options));
}

/**
 * The same answer for many institutions in **one** query — the shape a results
 * page needs (PR-27 labels every paid placement, PR-28 reports on one).
 * Modelled on `getWhatsappNumbers` (`architecture.md` §6.2): one extra query
 * per page, never one per row.
 *
 * Every requested id is present in the map; institutions with no subscription
 * get the free baseline rather than being absent, so a caller cannot mistake
 * "not found" for "no answer".
 */
export async function getEntitlementsForInstitutions(
  institutionIds: readonly number[],
  options?: ResolveOptions,
  database?: Db,
): Promise<Map<number, Entitlements>> {
  const unique = [...new Set(institutionIds)];
  const facts = await subscriptionFactsFor(unique, database);
  const resolved = defaultOptions(options);
  return new Map(
    unique.map((id) => [
      id,
      resolveEntitlements(
        id,
        facts.filter((fact) => fact.institutionId === id),
        resolved,
      ),
    ]),
  );
}

/**
 * Assert that this institution's plan includes `feature`, or throw.
 *
 * Call it in the query module that performs the gated read or write — the same
 * placement rule `requireRole` follows (`architecture.md` §13): a server
 * action is reachable on its own, so a check that only guards a component is
 * not a check at all.
 */
export async function requireFeature(
  institutionId: number,
  feature: FeatureKey,
  database?: Db,
): Promise<Entitlements> {
  const entitlements = await getEntitlements(institutionId, undefined, database);
  if (!entitlements.features[feature]) {
    throw new AuthError('Esa función no está incluida en el plan de tu institución.', 'forbidden');
  }
  return entitlements;
}

/**
 * The two plan-derived marks a public page renders, for a set of institutions,
 * in **one** query (PR-27).
 *
 * Pages call this rather than reading `program_search.plan_rank`, which is a
 * derived copy refreshed on writes and nightly: good enough to order rows, not
 * good enough to make a claim about a commercial relationship in front of a
 * student. Every requested id is present in the map, so a caller cannot mistake
 * a missing entry for "no answer".
 */
export async function getPlacementFlags(
  institutionIds: readonly number[],
  database?: Db,
): Promise<Map<number, PlacementFlags>> {
  const entitlements = await getEntitlementsForInstitutions(institutionIds, undefined, database);
  return new Map([...entitlements].map(([id, value]) => [id, placementFlags(value)]));
}

/** The free baseline, for callers that need a value when there is no institution. */
export { freeEntitlements as noEntitlements } from './contract';
