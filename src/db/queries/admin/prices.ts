/**
 * Admin CRUD for `prices` (PR-20). CLAUDE.md rule 5: all SQL lives here.
 *
 * Same shape as PR-19's five modules — `requireRole` inside every mutation,
 * `activity_log` inside the same transaction, `rebuildProgramSearch` after it
 * commits — plus two rules this table has and those did not.
 *
 * ### An arancel is never edited in place. It is superseded.
 *
 * `data-model.md` §2 says "one current row per offering + history", enforced by
 * the generated `current_offering_id` and its UNIQUE index. So saving a new
 * price **flips the previous current row to `is_current = false` and inserts a
 * new one**, in one transaction. Editing the existing row would destroy the
 * only record of what we used to publish and what we told a student last year,
 * which is exactly the thing an institution disputing a price will ask about
 * (`risks.md` §R-14).
 *
 * `updatePrice` therefore exists only for **corrections** — fixing a typo in a
 * row that should never have said what it says — and is logged as `update`
 * rather than `create`, so the two are distinguishable in `activity_log`
 * forever.
 *
 * ### `verified_at` is set by a human saying so
 *
 * It is not `now()` on every write for its own sake: it is the moment somebody
 * asserted the number is still true, and the 12-month display rule is measured
 * from it (`invariants.ts`, `PRICE_MAX_AGE_MONTHS`). Creating or correcting a
 * price is such a moment — you just read the source — so both stamp it, with
 * `verified_by_user_id` naming who.
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { assertPriceIsCoherent } from '@/db/invariants';
import { campuses, institutions, offerings, prices, programs } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { PriceInputData } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export type PriceRow = typeof prices.$inferSelect;

export interface PriceListRow {
  id: number;
  offeringId: number;
  institutionShort: string;
  programName: string;
  campusName: string;
  modality: string;
  shift: string;
  currency: string;
  monthlyFee: number | null;
  annualCost: number | null;
  isFree: boolean;
  verifiedAt: Date | null;
  isCurrent: boolean;
}

const PAGE_SIZE = 25;

/** One row per *current* price, named the way a human reads an offering. */
export async function listPricesAdmin(
  actor: SessionUser | null | undefined,
  options: { institutionId?: number | null; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<PriceListRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const conditions = [eq(prices.isCurrent, true)];
  if (options.institutionId) {
    conditions.push(eq(programs.institutionId, options.institutionId));
  }
  const where = and(...conditions);

  const selection = {
    id: prices.id,
    offeringId: prices.offeringId,
    institutionShort: institutions.nameShort,
    programName: programs.nameOfficial,
    campusName: campuses.name,
    modality: offerings.modality,
    shift: offerings.shift,
    currency: prices.currency,
    monthlyFee: prices.monthlyFee,
    annualCost: prices.annualCost,
    isFree: prices.isFree,
    verifiedAt: prices.verifiedAt,
    isCurrent: prices.isCurrent,
  };

  const [rows, [{ count }]] = await Promise.all([
    database
      .select(selection)
      .from(prices)
      .innerJoin(offerings, eq(offerings.id, prices.offeringId))
      .innerJoin(programs, eq(programs.id, offerings.programId))
      .innerJoin(campuses, eq(campuses.id, offerings.campusId))
      .innerJoin(institutions, eq(institutions.id, programs.institutionId))
      .where(where)
      .orderBy(institutions.nameShort, programs.nameOfficial)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(prices)
      .innerJoin(offerings, eq(offerings.id, prices.offeringId))
      .innerJoin(programs, eq(programs.id, offerings.programId))
      .where(where),
  ]);

  return { rows: rows as PriceListRow[], total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getPriceForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<PriceRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(prices).where(eq(prices.id, id)).limit(1);
  return row ?? null;
}

/** The history behind one offering's current arancel, newest first. */
export async function listPriceHistory(
  actor: SessionUser | null | undefined,
  offeringId: number,
  database: Db = defaultDb,
): Promise<PriceRow[]> {
  requireRole(actor, ['editor']);
  return database
    .select()
    .from(prices)
    .where(eq(prices.offeringId, offeringId))
    .orderBy(desc(prices.id))
    .limit(50);
}

function toRow(input: PriceInputData, userId: number): typeof prices.$inferInsert {
  return {
    offeringId: input.offeringId,
    currency: input.currency,
    matricula: input.matricula,
    monthlyFee: input.monthlyFee,
    installmentsPerYear: input.installmentsPerYear,
    admissionFee: input.admissionFee,
    isFree: input.isFree,
    notesMd: input.notesMd,
    source: input.source,
    sourceUrl: input.sourceUrl,
    validFrom: input.validFrom,
    validTo: input.validTo,
    isCurrent: true,
    verifiedAt: new Date(),
    verifiedByUserId: userId,
  };
}

/**
 * Supersede: the previous current row for this offering becomes history and a
 * new current row is inserted. One transaction, because for the moment between
 * them the UNIQUE on `current_offering_id` would otherwise be violated — and
 * more importantly because an offering with two current prices, or none, is a
 * state the comparador cannot render honestly.
 */
export async function createPrice(
  actor: SessionUser | null | undefined,
  input: PriceInputData,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);
  assertPriceIsCoherent(input);

  const row = toRow(input, user.id);

  const id = await database.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(prices)
      .where(and(eq(prices.offeringId, input.offeringId), eq(prices.isCurrent, true)))
      .limit(1);

    if (previous) {
      await tx.update(prices).set({ isCurrent: false }).where(eq(prices.id, previous.id));
    }

    const [result] = await tx.insert(prices).values(row);
    const insertId = Number(result.insertId);

    await logActivity(tx, {
      userId: user.id,
      entityType: 'price',
      entityId: insertId,
      action: 'create',
      // The superseded row is the `before`: that is what the site was showing
      // until this save, and it is the question an institution disputing an
      // arancel actually asks.
      before: previous ? { ...previous, supersededPriceId: previous.id } : null,
      after: { ...row },
    });

    return insertId;
  });

  await rebuildProgramSearch({ db: database });
  return id;
}

/**
 * Correct a row in place. Not the way a new arancel is recorded — see the
 * module header — and logged as `update` so the two never blur.
 */
export async function updatePrice(
  actor: SessionUser | null | undefined,
  id: number,
  input: PriceInputData,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);
  assertPriceIsCoherent(input);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(prices).where(eq(prices.id, id)).limit(1);
    if (!before) throw new Error('Arancel no encontrado.');

    const row = { ...toRow(input, user.id), isCurrent: before.isCurrent };
    await tx.update(prices).set(row).where(eq(prices.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'price',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/**
 * Retire an arancel without replacing it.
 *
 * `prices` has no `status` column, so there is nothing to archive: the honest
 * operation is to stop calling it current. The row stays as history, the
 * offering falls back to "Consultá el arancel", and no number we no longer
 * stand behind is on the page. Nothing is deleted (data-model.md §3).
 */
export async function retirePrice(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(prices).where(eq(prices.id, id)).limit(1);
    if (!before) throw new Error('Arancel no encontrado.');

    await tx.update(prices).set({ isCurrent: false }).where(eq(prices.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'price',
      entityId: id,
      action: 'archive',
      before: { isCurrent: before.isCurrent },
      after: { isCurrent: false },
    });
  });

  await rebuildProgramSearch({ db: database });
}
