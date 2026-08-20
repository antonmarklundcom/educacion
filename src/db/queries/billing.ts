/**
 * Billing operations: the renewal pipeline, the past-due sweep and the revenue
 * view (PR-29). Rule 5.
 *
 * Two kinds of read live here and they are authorised differently.
 *
 * - **The cron reads** — `listRenewalSubscriptions`, `sentReminderKeys` — take
 *   no `SessionUser` and assert no role: their only callers are the cron
 *   routes, which authenticate with `CRON_SECRET` before the handler runs
 *   (`architecture.md` §10). A page must never call them.
 * - **The admin reads** — `revenueSummary`, `listUpcomingRenewals`,
 *   `listPastDue` — take an actor and call `requireRole(actor, ['admin'])`
 *   themselves. `/admin/facturacion` calling `requireRole` too is defence in
 *   depth, not the guard: rule 4 puts the check server-side, in the query.
 *
 * Mutations assert the role themselves as well, except `markPastDue`, which is
 * the cron's and documents its own reason.
 */

import { and, eq, gt, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions, plans, subscriptionReminders, subscriptions } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { SubscriptionStatusValue } from '@/lib/admin/validation';
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

/** What the sweep found: the id, and the status it is moving away from. */
export interface SweptSubscription {
  id: number;
  status: SubscriptionStatusValue;
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
  swept: readonly SweptSubscription[],
  database: Db = defaultDb,
): Promise<number> {
  if (swept.length === 0) return 0;

  await database.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: 'past_due' })
      .where(
        inArray(
          subscriptions.id,
          swept.map((row) => row.id),
        ),
      );

    for (const row of swept) {
      await logActivity(tx, {
        userId: null,
        entityType: 'subscription',
        entityId: row.id,
        action: 'update',
        // The row's **real** prior status. This used to write the literal
        // `'active_or_trial'` — not a value the enum can hold, and a guess
        // recorded as fact in the one table whose whole purpose is saying what
        // actually happened (CLAUDE.md rule 1). PR-44 gave `activity_log` a
        // reader, so an operator now sees it. The caller already has the row.
        before: { status: row.status },
        after: { status: 'past_due', by: 'cron:subscription-sweep' },
      });
    }
  });

  return swept.length;
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
  /** Counted, never priced: a trial owes nothing (see below). */
  trials: number;
}

/**
 * What is currently sold, by plan.
 *
 * "In force" is `status = 'active'` **and** the dates covering today.
 *
 * ### Why `trial` is not in force, and `gratis` is not contracted
 *
 * Both used to be. The independent review of PR-29 (PR-46) found the
 * consequence: a `trial` row was multiplied by the plan's list price and added
 * to the headline "USD/año contratado" — money nobody has agreed to pay,
 * presented as money that was — and every `gratis` row (price 0) sat
 * permanently in **"Vigentes sin referencia de factura"**, which is a queue of
 * problems to chase, reading as an unpaid invoice forever.
 *
 * Neither is a rounding error on a screen whose entire job is telling the
 * operator what is owed, and inventing a figure the database cannot know is
 * CLAUDE.md rule 1. So the money aggregates count `active`, paid plans only.
 * Trials are still visible — as their own labelled row, counted and never
 * priced.
 *
 * This deliberately no longer matches `resolveEntitlements`, and should not: a
 * trial grants features and owes nothing, which is exactly the difference
 * between what the site honours and what the operator can invoice.
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

  const covering = and(
    lte(subscriptions.startsOn, today),
    sql`(${subscriptions.endsOn} is null or ${subscriptions.endsOn} >= ${today})`,
  );
  /**
   * Contracted: an active subscription to a plan that has a price. The
   * predicate is the **price**, not the rank — "has a price" is the thing
   * being asked, and a future free-but-ranked plan would otherwise be summed
   * into a revenue figure at zero and inflate the institution count.
   */
  const contracted = and(eq(subscriptions.status, 'active'), gt(plans.priceUsdYear, 0), covering);

  const [byPlan, totals, pastDueRows, trialRows] = await Promise.all([
    database
      .select({
        planCode: plans.code,
        planName: plans.name,
        priceUsdYear: plans.priceUsdYear,
        activeCount: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(contracted)
      .groupBy(plans.code, plans.name, plans.priceUsdYear)
      .orderBy(plans.rank, plans.priceUsdYear),
    database
      .select({
        invoiced: sql<number>`coalesce(sum(${subscriptions.invoicedAmountPyg}), 0)`,
        missing: sql<number>`sum(case when ${subscriptions.invoiceRef} is null then 1 else 0 end)`,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(contracted),
    database
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'past_due')),
    database
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'trial'), covering)),
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
    trials: Number(trialRows[0]?.count ?? 0),
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
