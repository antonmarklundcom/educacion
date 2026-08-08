/**
 * Admin CRUD for `offerings` (PR-19). Same shape as `institutions.ts`.
 *
 * `enrollment_status` is not a field in `OfferingInput` and never written
 * here: data-model.md §2 says it is "derived from the active admission
 * window by the daily cron — not hand-maintained", and admissions are
 * PR-20's. A new offering keeps the column's default (`sin_datos`).
 *
 * The `(programId, campusId, modality, shift)` unique key is the same one
 * `offerings_uq` enforces in MySQL — a duplicate here fails the insert/update
 * with a clear message instead of a raw driver error reaching the form.
 */

import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { campuses, institutions, offerings, programs } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { OfferingInput } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export interface OfferingRow {
  id: number;
  programId: number;
  programName: string;
  institutionName: string;
  campusId: number;
  campusName: string;
  modality: (typeof offerings.$inferSelect)['modality'];
  shift: (typeof offerings.$inferSelect)['shift'];
  durationMonths: number | null;
  status: (typeof offerings.$inferSelect)['status'];
}

const PAGE_SIZE = 25;

const SELECT_COLUMNS = {
  id: offerings.id,
  programId: offerings.programId,
  programName: programs.nameOfficial,
  institutionName: institutions.nameShort,
  campusId: offerings.campusId,
  campusName: campuses.name,
  modality: offerings.modality,
  shift: offerings.shift,
  durationMonths: offerings.durationMonths,
  status: offerings.status,
} as const;

export async function listOfferingsAdmin(
  actor: SessionUser | null | undefined,
  options: { page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<OfferingRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);

  const base = () =>
    database
      .select(SELECT_COLUMNS)
      .from(offerings)
      .innerJoin(programs, eq(offerings.programId, programs.id))
      .innerJoin(institutions, eq(programs.institutionId, institutions.id))
      .innerJoin(campuses, eq(offerings.campusId, campuses.id));

  const [rows, [{ count }]] = await Promise.all([
    base()
      .orderBy(asc(institutions.nameShort), asc(programs.nameOfficial))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database.select({ count: sql<number>`count(*)` }).from(offerings),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getOfferingForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<typeof offerings.$inferSelect | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(offerings).where(eq(offerings.id, id)).limit(1);
  return row ?? null;
}

export async function isOfferingDuplicate(
  input: Pick<OfferingInput, 'programId' | 'campusId' | 'modality' | 'shift'>,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = and(
    eq(offerings.programId, input.programId),
    eq(offerings.campusId, input.campusId),
    eq(offerings.modality, input.modality),
    eq(offerings.shift, input.shift),
    excludeId ? ne(offerings.id, excludeId) : undefined,
  );
  const [row] = await database.select({ id: offerings.id }).from(offerings).where(where).limit(1);
  return Boolean(row);
}

export async function createOffering(
  actor: SessionUser | null | undefined,
  input: OfferingInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);

  if (await isOfferingDuplicate(input, null, database)) {
    throw new Error('Ya existe una oferta para ese programa, sede, modalidad y turno.');
  }

  const row: typeof offerings.$inferInsert = {
    programId: input.programId,
    campusId: input.campusId,
    modality: input.modality,
    shift: input.shift,
    durationMonths: input.durationMonths,
    credits: input.credits,
    planUrl: input.planUrl,
    status: input.status,
  };

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(offerings).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'offering',
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

export async function updateOffering(
  actor: SessionUser | null | undefined,
  id: number,
  input: OfferingInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  if (await isOfferingDuplicate(input, id, database)) {
    throw new Error('Ya existe una oferta para ese programa, sede, modalidad y turno.');
  }

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(offerings).where(eq(offerings.id, id)).limit(1);
    if (!before) throw new Error('Oferta no encontrada.');

    const row: Partial<typeof offerings.$inferInsert> = {
      programId: input.programId,
      campusId: input.campusId,
      modality: input.modality,
      shift: input.shift,
      durationMonths: input.durationMonths,
      credits: input.credits,
      planUrl: input.planUrl,
      status: input.status,
    };

    await tx.update(offerings).set(row).where(eq(offerings.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'offering',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

export async function archiveOffering(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(offerings).where(eq(offerings.id, id)).limit(1);
    if (!before) throw new Error('Oferta no encontrada.');

    await tx.update(offerings).set({ status: 'archived' }).where(eq(offerings.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'offering',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  await rebuildProgramSearch({ db: database });
}
