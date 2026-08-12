/**
 * Billing operations: the renewal pipeline, the past-due sweep and the revenue
 * view (PR-29). Rule 5.
 *
 * The reads here have **no `requireRole`**, on purpose and with one condition:
 * their only callers are the cron jobs, which authenticate with `CRON_SECRET`
 * before the route reaches them (`architecture.md` §10), and
 * `/admin/facturacion`, which calls `requireRole(user, ['admin'])` itself and
 * then reads through `revenueSummary` — the one function here that a page
 * calls. Mutations still assert the role themselves, as everywhere else.
 */

import { and, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions, plans, subscriptionReminders, subscriptions } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import { reminderKey, type RenewalSubscription } from '@/lib/billing/renewals';

/** Every subscription with an end date, joined to what a notice needs to name. */
export async function listRenewalSubscriptions(
  database: Db = defaultDb,
): Promise<RenewalSubscription[]> {
  const rows = await database
    .select({
      id: subscriptions.id,
      institutionId: subscriptions.institutionId,
      institutionName: institutions.nameShort,
      planName: plans.name,
      status: subscriptions.status,
      startsOn: subscriptions.startsOn,
      endsOn: subscriptions.endsOn,
      invoiceRef: subscriptions.invoiceRef,
    })
    .from(subscriptions)
    .innerJoin(institutions, eq(institutions.id, subscriptions.institutionId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(isNotNull(subscriptions.endsOn), ne(subscriptions.status, 'cancelled')));

  return rows.map((row) => ({
    id: row.id,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    planName: row.planName,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    invoiceRef: row.invoiceRef ?? null,
  }));
}

/** The `${id}:${endsOn}:${threshold}` keys already sent, for `dueReminders`. */
export async function sentReminderKeys(database: Db = defaultDb): Promise<Set<string>> {
  const rows = await database
    .select({
      subscriptionId: subscriptionReminders.subscriptionId,
      periodEndsOn: subscriptionReminders.periodEndsOn,
      thresholdDays: subscriptionReminders.thresholdDays,
    })
    .from(subscriptionReminders);

  return new Set(
    rows.map((row) => reminderKey(row.subscriptionId, row.periodEndsOn, row.thresholdDays)),
  );
}

/**
 * Records that a reminder went out. The UNIQUE key is the idempotency, so a
 * duplicate is an `ON DUPLICATE KEY UPDATE` that changes nothing rather than
 * an error the cron has to interpret.
 *
 * Written **after** the send succeeds. The other order would mark a notice
 * sent that never left, and a renewal notice nobody received is exactly the
 * failure this table exists to prevent; a duplicate email is the cheaper
 * mistake.
 */
export async function recordReminderSent(
  subscriptionId: number,
  periodEndsOn: string,
  thresholdDays: number,
  database: Db = defaultDb,
): Promise<void> {
  await database
    .insert(subscriptionReminders)
    .values({ subscriptionId, periodEndsOn, thresholdDays })
    .onDuplicateKeyUpdate({ set: { subscriptionId: sql`subscription_id` } });
}

/**
 * Moves ended `active`/`trial` subscriptions to `past_due`, which is what
 * starts the grace window (`lib/billing/renewals.ts`).
 *
 * No `SessionUser`: the caller is the cron, already authenticated by
 * `CRON_SECRET`. It is logged to `activity_log` with a null user, which is how
 * an automated write is distinguishable from a person's forever.
 */
export async function markPastDue(
  subscriptionIds: readonly number[],
  database: Db = defaultDb,
): Promise<number> {
  if (subscriptionIds.length === 0) return 0;

  await database.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: 'past_due' })
      .where(inArray(subscriptions.id, [...subscriptionIds]));

    for (const id of subscriptionIds) {
      await logActivity(tx, {
        userId: null,
        entityType: 'subscription',
        entityId: id,
        action: 'update',
        before: { status: 'active_or_trial' },
        after: { status: 'past_due', by: 'cron:subscription-sweep' },
      });
    }
  });

  return subscriptionIds.length;
}

/* -------------------------------------------------------------------------- */
/* The revenue view                                                           */
/* -------------------------------------------------------------------------- */

export interface RevenueRow {
  planCode: string;
  planName: string;
  priceUsdYear: number;
  activeCount: number;
  /** `active_count × price_usd_year`. Contracted, not collected. */
  contractedUsdYear: number;
}

export interface RevenueSummary {
  /** Today, UTC — the date every "vigente" below is evaluated against. */
  today: string;
  rows: RevenueRow[];
  totalUsdYear: number;
  /** Guaraníes actually invoiced on the subscriptions currently in force. */
  invoicedPyg: number;
  /** Subscriptions in force with no invoice reference recorded yet. */
  missingInvoiceRef: number;
  pastDue: number;
}

/**
 * What is currently sold, by plan.
 *
 * "In force" here is `status in (active, trial)` **and** the dates covering
 * today — the same predicate `resolveEntitlements` applies, expressed in SQL.
 * A number on a revenue page that counts a subscription the site is no longer
 * honouring would be the worst kind of wrong: right in the spreadsheet and
 * wrong on the site.
 *
 * `contracted_usd_year` is the plan's list price × count. It is **not**
 * collected revenue and the page says so: what was actually invoiced is
 * `invoiced_amount_pyg`, in guaraníes, on each subscription.
 */
export async function revenueSummary(
  actor: SessionUser | null | undefined,
  today: string,
  database: Db = defaultDb,
): Promise<RevenueSummary> {
  requireRole(actor, ['admin']);

  const inForce = and(
    inArray(subscriptions.status, ['active', 'trial']),
    lte(subscriptions.startsOn, today),
    sql`(${subscriptions.endsOn} is null or ${subscriptions.endsOn} >= ${today})`,
  );

  const [byPlan, totals, pastDueRows] = await Promise.all([
    database
      .select({
        planCode: plans.code,
        planName: plans.name,
        priceUsdYear: plans.priceUsdYear,
        activeCount: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(inForce)
      .groupBy(plans.code, plans.name, plans.priceUsdYear)
      .orderBy(plans.rank, plans.priceUsdYear),
    database
      .select({
        invoiced: sql<number>`coalesce(sum(${subscriptions.invoicedAmountPyg}), 0)`,
        missing: sql<number>`sum(case when ${subscriptions.invoiceRef} is null then 1 else 0 end)`,
      })
      .from(subscriptions)
      .where(inForce),
    database
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'past_due')),
  ]);

  const rows: RevenueRow[] = byPlan.map((row) => ({
    planCode: row.planCode,
    planName: row.planName,
    priceUsdYear: row.priceUsdYear,
    activeCount: Number(row.activeCount),
    contractedUsdYear: Number(row.activeCount) * row.priceUsdYear,
  }));

  return {
    today,
    rows,
    totalUsdYear: rows.reduce((total, row) => total + row.contractedUsdYear, 0),
    invoicedPyg: Number(totals[0]?.invoiced ?? 0),
    missingInvoiceRef: Number(totals[0]?.missing ?? 0),
    pastDue: Number(pastDueRows[0]?.count ?? 0),
  };
}

/** Subscriptions ending within `days`, soonest first — the renewal pipeline. */
export async function listUpcomingRenewals(
  actor: SessionUser | null | undefined,
  today: string,
  days: number,
  database: Db = defaultDb,
): Promise<RenewalSubscription[]> {
  requireRole(actor, ['admin']);

  const horizon = new Date(Date.parse(`${today}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const rows = await database
    .select({
      id: subscriptions.id,
      institutionId: subscriptions.institutionId,
      institutionName: institutions.nameShort,
      planName: plans.name,
      status: subscriptions.status,
      startsOn: subscriptions.startsOn,
      endsOn: subscriptions.endsOn,
      invoiceRef: subscriptions.invoiceRef,
    })
    .from(subscriptions)
    .innerJoin(institutions, eq(institutions.id, subscriptions.institutionId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        ne(subscriptions.status, 'cancelled'),
        isNotNull(subscriptions.endsOn),
        gte(subscriptions.endsOn, today),
        lte(subscriptions.endsOn, horizon),
      ),
    )
    .orderBy(subscriptions.endsOn);

  return rows.map((row) => ({
    id: row.id,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    planName: row.planName,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    invoiceRef: row.invoiceRef ?? null,
  }));
}

/** Every `past_due` subscription, for the admin list. */
export async function listPastDue(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<RenewalSubscription[]> {
  requireRole(actor, ['admin']);

  const rows = await database
    .select({
      id: subscriptions.id,
      institutionId: subscriptions.institutionId,
      institutionName: institutions.nameShort,
      planName: plans.name,
      status: subscriptions.status,
      startsOn: subscriptions.startsOn,
      endsOn: subscriptions.endsOn,
      invoiceRef: subscriptions.invoiceRef,
    })
    .from(subscriptions)
    .innerJoin(institutions, eq(institutions.id, subscriptions.institutionId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.status, 'past_due'))
    .orderBy(subscriptions.endsOn);

  return rows.map((row) => ({
    id: row.id,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    planName: row.planName,
    status: row.status,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    invoiceRef: row.invoiceRef ?? null,
  }));
}
