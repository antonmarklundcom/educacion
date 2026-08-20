/**
 * Subscriptions → entitlements, as a pure function.
 *
 * Everything expensive to get wrong about money lives here, and it is testable
 * without a database on purpose: "does a cancelled plan still show the badge"
 * is a question that must be answerable in a unit test, not by clicking around
 * a staging site with a fake invoice.
 *
 * ### The rules
 *
 * A subscription **counts** when its dates cover today and its status says
 * money is (or was recently) good for it:
 *
 * - `active` / `trial` — counts while `starts_on <= today <= ends_on`
 *   (`ends_on` null means open-ended, which is how a trial with no agreed end
 *   or a comped plan is represented).
 * - `past_due` — counts only inside the grace window, `today <= ends_on +
 *   graceDays`. With `graceDays = 0` (PR-25's default) a past-due subscription
 *   grants nothing the day after its period ends. **PR-29 owns making the
 *   window configurable**; it changes the argument, not this rule.
 * - `cancelled` — never counts. Not on its last day, not during grace.
 *
 * A `past_due` row with **no** `ends_on` grants nothing regardless of grace:
 * there is no window to compute from, and "unpaid and open-ended" must not
 * resolve to "keep everything forever".
 *
 * ### Why the result is a union rather than the top plan's features
 *
 * Destacado is an add-on (`monetization.md` §3), so an institution can hold a
 * Verificado subscription *and* a Destacado one at the same time. Taking only
 * the highest-ranked plan's feature set would work today because Destacado's
 * set is a superset — and would quietly break the first time a plan is defined
 * that is high-ranked and narrow. The union is what the customer was actually
 * sold.
 *
 * ### Why expiry needs no cron
 *
 * Nothing here reads a "revoked" flag; entitlements are recomputed from dates
 * on every request. A subscription that ends tonight is gone from tomorrow's
 * first request whether or not any job ran, which is what makes "downgrading
 * immediately revokes gated features" (PR-25's acceptance criterion) a
 * property of the model rather than of an operator remembering to do
 * something. The one derived copy — `program_search.plan_rank` — is refreshed
 * by every subscription write and again by the nightly rebuild.
 */

import {
  FEATURES_BY_RANK,
  FEATURE_KEYS,
  PLAN_RANKS,
  freeEntitlements,
  type Entitlements,
  type EntitlementStatus,
  type FeatureKey,
  type FeatureSet,
  type PlanRank,
} from './contract';

import { asuncionToday } from '@/lib/format';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';

/** One subscription joined to its plan — exactly what the resolver needs, no more. */
export interface SubscriptionFacts {
  id: number;
  institutionId: number;
  status: SubscriptionStatus;
  /** `YYYY-MM-DD`, as stored. */
  startsOn: string;
  endsOn: string | null;
  planCode: string;
  planName: string;
  planRank: PlanRank;
  includedLeadsMonth: number | null;
}

export interface ResolveOptions {
  now?: Date;
  /** Days a `past_due` subscription keeps its features after `ends_on`. PR-29. */
  graceDays?: number;
}

/**
 * `YYYY-MM-DD` **in Asunción**. Dates are compared as strings — the same rule
 * `program_search` uses.
 *
 * Asunción and not UTC, since PR-46. `subscriptions.start_on`/`ends_on` are
 * `date` columns holding a Paraguayan calendar day, and comparing them against
 * the UTC day meant that between 21:00 and midnight local a subscription
 * ending *today* already resolved to nothing: a paying institution lost its
 * badge, its lead contacts and its placement three hours early on its last day.
 * The independent review of PR-29 measured it. The error was always an
 * under-grant, never an over-grant, which is why it survived this long.
 */
export function dateOnly(date: Date): string {
  return asuncionToday(date);
}

/**
 * Calendar arithmetic on a `YYYY-MM-DD` string.
 *
 * Formats with `toISOString()` rather than `dateOnly()`, and the difference
 * matters: `dateOnly` converts an *instant* to the day it is in Asunción, while
 * this builds a UTC midnight it chose itself and only wants the date back out
 * of it. Routing it through `dateOnly` shifts every grace window a day earlier —
 * which is exactly what happened when `dateOnly` moved to Asunción, and what
 * `resolve.test.ts`'s grace-boundary case caught.
 */
function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Whether one subscription grants anything today, and under which status.
 * Null means it grants nothing.
 */
export function subscriptionStanding(
  subscription: SubscriptionFacts,
  today: string,
  graceDays: number,
): Exclude<EntitlementStatus, 'gratis'> | null {
  if (subscription.status === 'cancelled') return null;
  if (subscription.startsOn > today) return null;

  if (subscription.status === 'past_due') {
    if (subscription.endsOn == null) return null;
    return today <= addDays(subscription.endsOn, graceDays) ? 'past_due_grace' : null;
  }

  if (subscription.endsOn != null && subscription.endsOn < today) return null;
  return subscription.status === 'trial' ? 'trial' : 'active';
}

function unionFeatures(sets: readonly FeatureSet[]): FeatureSet {
  return Object.freeze(
    Object.fromEntries(
      FEATURE_KEYS.map((key: FeatureKey) => [key, sets.some((set) => set[key])]),
    ) as Record<FeatureKey, boolean>,
  );
}

/** Worst standing wins: one unpaid add-on makes the account past-due-in-grace. */
const STATUS_PRECEDENCE: Exclude<EntitlementStatus, 'gratis'>[] = [
  'past_due_grace',
  'trial',
  'active',
];

export function resolveEntitlements(
  institutionId: number,
  subscriptions: readonly SubscriptionFacts[],
  options: ResolveOptions = {},
): Entitlements {
  const today = dateOnly(options.now ?? new Date());
  const graceDays = Math.max(0, options.graceDays ?? 0);

  const counting = subscriptions
    .filter((subscription) => subscription.institutionId === institutionId)
    .map((subscription) => ({
      subscription,
      standing: subscriptionStanding(subscription, today, graceDays),
    }))
    .filter(
      (
        entry,
      ): entry is {
        subscription: SubscriptionFacts;
        standing: Exclude<EntitlementStatus, 'gratis'>;
      } => entry.standing !== null,
    );

  if (counting.length === 0) return freeEntitlements(institutionId);

  const planRank = counting.reduce<PlanRank>(
    (rank, entry) => (entry.subscription.planRank > rank ? entry.subscription.planRank : rank),
    PLAN_RANKS.gratis,
  );

  // The plan that names the account is the highest-ranked one; ties break on
  // the newest subscription so a renewal names itself rather than its
  // predecessor.
  const leading = counting
    .filter((entry) => entry.subscription.planRank === planRank)
    .sort((a, b) => b.subscription.id - a.subscription.id)[0]!.subscription;

  const status =
    STATUS_PRECEDENCE.find((candidate) => counting.some((entry) => entry.standing === candidate)) ??
    'active';

  const endDates = counting
    .map((entry) => entry.subscription.endsOn)
    .filter((date): date is string => date != null)
    .sort();

  const quotas = counting
    .map((entry) => entry.subscription.includedLeadsMonth)
    .filter((quota): quota is number => quota != null);

  return {
    institutionId,
    planRank,
    planCode: leading.planCode,
    planName: leading.planName,
    features: unionFeatures(counting.map((entry) => FEATURES_BY_RANK[entry.subscription.planRank])),
    status,
    includedLeadsMonth: quotas.length > 0 ? Math.max(...quotas) : null,
    subscriptionIds: counting.map((entry) => entry.subscription.id).sort((a, b) => a - b),
    currentPeriodEndsOn: endDates[0] ?? null,
  };
}
