/**
 * Plans and subscriptions — all the SQL, per CLAUDE.md rule 5.
 *
 * **`subscriptions` is the only source of truth for what an institution has
 * bought.** `institutions.plan_id` used to be a second one; PR-25 drops it
 * (migration `0004`). A column that says "this institution is on Verificado"
 * with no start date, no end date and no invoice cannot express the one thing
 * billing is about — *until when* — so it could only ever agree with the
 * subscription rows by accident, and the day it disagreed the site would show
 * a badge nobody was paying for.
 *
 * **Billing is `admin`, never `editor`.** `architecture.md` §7 says so in the
 * role table: an editor curates the national dataset and does not touch money.
 * As with PR-19, `requireRole` is called inside every mutation here rather
 * than only in the server action, because a server action is reachable without
 * the `/admin` layout ever running (CLAUDE.md rule 4).
 *
 * **Every write rebuilds `program_search`.** `plan_rank` is denormalized into
 * the index, so activating, renewing or cancelling a subscription is a write
 * to the index too. It runs after the transaction commits, exactly as PR-19's
 * mutations do.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions, plans, subscriptions } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { assertClaimed, getInstitutionClaimState } from '@/db/queries/claims';
import { AuthError, requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { SubscriptionStatus } from '@/lib/entitlements/resolve';

import { rebuildProgramSearch } from './rebuild-search';

export type SubscriptionRow = typeof subscriptions.$inferSelect;

const PAGE_SIZE = 25;

/* -------------------------------------------------------------------------- */
/* Admin: activating, renewing and cancelling                                 */
/* -------------------------------------------------------------------------- */

export interface SubscriptionInput {
  institutionId: number;
  planId: number;
  status: SubscriptionStatus;
  startsOn: string;
  endsOn: string | null;
  invoiceRef: string | null;
  /** What was actually invoiced, in guaraníes (`monetization.md` §5). */
  invoicedAmountPyg: number | null;
  notes: string | null;
}

export interface AdminSubscriptionRow extends SubscriptionRow {
  institutionName: string;
  institutionSlug: string;
  planCode: string;
  planName: string;
  planRank: number;
}

export interface AdminListPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Reading the billing list is `admin` too — an invoice reference is not curation data. */
export async function listSubscriptionsAdmin(
  actor: SessionUser | null | undefined,
  options: { status?: SubscriptionStatus; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<AdminSubscriptionRow>> {
  requireRole(actor, ['admin']);

  const page = Math.max(1, options.page ?? 1);
  const where = options.status ? eq(subscriptions.status, options.status) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select({
        subscription: subscriptions,
        institutionName: institutions.nameShort,
        institutionSlug: institutions.slug,
        planCode: plans.code,
        planName: plans.name,
        planRank: plans.rank,
      })
      .from(subscriptions)
      .innerJoin(institutions, eq(institutions.id, subscriptions.institutionId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(where)
      .orderBy(desc(subscriptions.startsOn), desc(subscriptions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row.subscription,
      institutionName: row.institutionName,
      institutionSlug: row.institutionSlug,
      planCode: row.planCode,
      planName: row.planName,
      planRank: row.planRank,
    })),
    total: Number(count),
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getSubscriptionForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<AdminSubscriptionRow | null> {
  requireRole(actor, ['admin']);

  const [row] = await database
    .select({
      subscription: subscriptions,
      institutionName: institutions.nameShort,
      institutionSlug: institutions.slug,
      planCode: plans.code,
      planName: plans.name,
      planRank: plans.rank,
    })
    .from(subscriptions)
    .innerJoin(institutions, eq(institutions.id, subscriptions.institutionId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, id))
    .limit(1);

  if (!row) return null;
  return {
    ...row.subscription,
    institutionName: row.institutionName,
    institutionSlug: row.institutionSlug,
    planCode: row.planCode,
    planName: row.planName,
    planRank: row.planRank,
  };
}

/**
 * A plan may only be activated for a **claimed** institution
 * (`architecture.md` §16.5): a subscription hands somebody a badge, a lead
 * inbox and a panel, and an unclaimed institution has nobody to hand them to.
 * `cancelled` is exempt — recording that a sale ended must never be blocked.
 */
async function assertActivatable(
  input: Pick<SubscriptionInput, 'institutionId' | 'status'>,
  database: Db,
): Promise<void> {
  if (input.status === 'cancelled') return;
  assertClaimed(await getInstitutionClaimState(input.institutionId, database));
}

function assertDateOrder(input: Pick<SubscriptionInput, 'startsOn' | 'endsOn'>): void {
  if (input.endsOn != null && input.endsOn < input.startsOn) {
    throw new AuthError('La fecha de fin no puede ser anterior a la de inicio.', 'forbidden');
  }
}

export async function createSubscription(
  actor: SessionUser | null | undefined,
  input: SubscriptionInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['admin']);
  assertDateOrder(input);
  await assertActivatable(input, database);

  const row: typeof subscriptions.$inferInsert = {
    institutionId: input.institutionId,
    planId: input.planId,
    status: input.status,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    invoiceRef: input.invoiceRef,
    invoicedAmountPyg: input.invoicedAmountPyg,
    notes: input.notes,
  };

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(subscriptions).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'subscription',
      entityId: insertId,
      action: 'create',
      before: null,
      after: { ...row },
    });
    return insertId;
  });

  await rebuildProgramSearch({ db: database });
  return id;
}

/**
 * Renewal and correction are the same write, and the `activity_log` entry is
 * what distinguishes them afterwards — a renewal moves `ends_on` forward and
 * carries a new `invoice_ref`, a correction does not. Unlike an arancel
 * (§14: superseded, never edited) a subscription period is not a public fact
 * anyone reads a history of; the invoice in FacturaPY is that record.
 */
export async function updateSubscription(
  actor: SessionUser | null | undefined,
  id: number,
  input: SubscriptionInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['admin']);
  assertDateOrder(input);
  await assertActivatable(input, database);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!before) throw new Error('Suscripción no encontrada.');

    const row: Partial<typeof subscriptions.$inferInsert> = {
      // `institution_id` is deliberately not updatable: moving a subscription
      // between institutions would move a badge and a lead inbox with it, and
      // leave the activity log describing something that never happened.
      planId: input.planId,
      status: input.status,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      invoiceRef: input.invoiceRef,
      invoicedAmountPyg: input.invoicedAmountPyg,
      notes: input.notes,
    };

    await tx.update(subscriptions).set(row).where(eq(subscriptions.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'subscription',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/**
 * Cancelling is a status change, not a delete: what was sold, to whom, for
 * which period and against which invoice stays readable forever. The features
 * are gone on the next request either way — `resolveEntitlements` never counts
 * a `cancelled` row, not even inside its paid period.
 */
export async function setSubscriptionStatus(
  actor: SessionUser | null | undefined,
  id: number,
  status: SubscriptionStatus,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['admin']);

  const [existing] = await database
    .select({ institutionId: subscriptions.institutionId })
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);
  if (!existing) throw new Error('Suscripción no encontrada.');
  await assertActivatable({ institutionId: existing.institutionId, status }, database);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!before) throw new Error('Suscripción no encontrada.');

    await tx.update(subscriptions).set({ status }).where(eq(subscriptions.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'subscription',
      entityId: id,
      action: 'update',
      before: { status: before.status },
      after: { status },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/** Institutions an admin can pick from when activating a plan — claimed ones first. */
export async function listInstitutionsForBilling(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<Array<{ id: number; nameShort: string; claimed: boolean }>> {
  requireRole(actor, ['admin']);
  const rows = await database
    .select({
      id: institutions.id,
      nameShort: institutions.nameShort,
      claimedByUserId: institutions.claimedByUserId,
    })
    .from(institutions)
    .where(and(sql`${institutions.status} <> 'archived'`))
    .orderBy(asc(institutions.nameShort));

  return rows.map((row) => ({
    id: row.id,
    nameShort: row.nameShort,
    claimed: row.claimedByUserId != null,
  }));
}
