/**
 * Admin CRUD for `admissions` (PR-20). CLAUDE.md rule 5.
 *
 * The one thing worth saying about this table: **`offerings.enrollment_status`
 * is derived from it, not typed alongside it** (`data-model.md` §2). The daily
 * cron reads the active window and sets abiertas / próximamente / cerradas, so
 * an admission saved here changes what the badge says without anyone touching
 * the badge. `deriveEnrollmentStatus` below is that rule, exported and pure, so
 * PR-33's cron and this module cannot disagree about it — and so saving a
 * convocatoria updates the affected offerings immediately rather than leaving
 * the site a day stale.
 */

import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { assertScopeTarget } from '@/db/invariants';
import { admissions, institutions, offerings, programs } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { AdmissionInputData } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export type AdmissionRow = typeof admissions.$inferSelect;

export interface AdmissionListRow extends AdmissionRow {
  institutionShort: string | null;
  programName: string | null;
}

const PAGE_SIZE = 25;

/**
 * The enrolment badge, as a function of one admission window and today.
 *
 * Pure and exported because three things need the same answer: this module
 * (when a convocatoria is saved), PR-33's daily cron (when a date passes with
 * nobody saving anything) and any test that wants to assert the boundaries
 * without a clock. `sin_datos` is the honest answer for a period with no dates
 * at all — not `cerradas`, which would claim we know something we do not.
 */
export function deriveEnrollmentStatus(
  window: {
    registrationOpens: string | null;
    registrationCloses: string | null;
    isActive: boolean;
  },
  today: string,
): 'abiertas' | 'proximamente' | 'cerradas' | 'sin_datos' {
  if (!window.isActive) return 'sin_datos';
  const { registrationOpens: opens, registrationCloses: closes } = window;
  if (!opens && !closes) return 'sin_datos';
  if (opens && today < opens) return 'proximamente';
  if (closes && today > closes) return 'cerradas';
  // Inside a window with at least one known boundary, and past any known
  // opening date.
  return 'abiertas';
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function listAdmissionsAdmin(
  actor: SessionUser | null | undefined,
  options: { institutionId?: number | null; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<AdmissionListRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const where = options.institutionId
    ? sql`(${admissions.institutionId} = ${options.institutionId} or ${programs.institutionId} = ${options.institutionId})`
    : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select({
        row: admissions,
        programName: programs.nameOfficial,
        institutionShort: institutions.nameShort,
      })
      .from(admissions)
      .leftJoin(programs, eq(programs.id, admissions.programId))
      .leftJoin(
        institutions,
        sql`${institutions.id} = coalesce(${admissions.institutionId}, ${programs.institutionId})`,
      )
      .where(where)
      .orderBy(desc(admissions.registrationOpens))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(admissions)
      .leftJoin(programs, eq(programs.id, admissions.programId))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r.row,
      programName: r.programName,
      institutionShort: r.institutionShort,
    })),
    total: Number(count),
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getAdmissionForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<AdmissionRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(admissions).where(eq(admissions.id, id)).limit(1);
  return row ?? null;
}

function toRow(input: AdmissionInputData, userId: number): typeof admissions.$inferInsert {
  assertScopeTarget(input, 'admissions');
  return {
    scope: input.scope,
    institutionId: input.institutionId,
    programId: input.programId,
    offeringId: input.offeringId,
    periodLabel: input.periodLabel,
    registrationOpens: input.registrationOpens,
    registrationCloses: input.registrationCloses,
    examDate: input.examDate,
    classesStart: input.classesStart,
    requirementsMd: input.requirementsMd,
    processMd: input.processMd,
    url: input.url,
    isActive: input.isActive,
    verifiedAt: new Date(),
    verifiedByUserId: userId,
  };
}

/** Every offering an admission at this scope covers. */
async function offeringsInScope(
  tx: Db,
  input: Pick<AdmissionInputData, 'scope' | 'institutionId' | 'programId' | 'offeringId'>,
): Promise<number[]> {
  if (input.scope === 'offering') return input.offeringId ? [input.offeringId] : [];

  if (input.scope === 'program') {
    if (!input.programId) return [];
    const rows = await tx
      .select({ id: offerings.id })
      .from(offerings)
      .where(eq(offerings.programId, input.programId));
    return rows.map((r) => r.id);
  }

  if (!input.institutionId) return [];
  const rows = await tx
    .select({ id: offerings.id })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .where(eq(programs.institutionId, input.institutionId));
  return rows.map((r) => r.id);
}

/**
 * Push the derived badge onto the offerings this window covers.
 *
 * A narrower scope wins: an offering with its own convocatoria is not
 * overwritten by the institution-wide one, because the specific window is the
 * one that is actually true for that student. That is the same precedence rule
 * the accreditation badge uses (`architecture.md` §4.1) applied to admissions.
 */
async function applyEnrollmentStatus(
  tx: Db,
  input: AdmissionInputData,
  now: Date,
): Promise<number> {
  const ids = await offeringsInScope(tx, input);
  if (ids.length === 0) return 0;

  const status = deriveEnrollmentStatus(input, todayIso(now));

  // Offerings covered by a *more specific* active admission keep theirs.
  const moreSpecific =
    input.scope === 'offering'
      ? []
      : (
          await tx
            .select({ offeringId: admissions.offeringId })
            .from(admissions)
            .where(
              and(
                eq(admissions.isActive, true),
                inArray(admissions.offeringId, ids),
                input.scope === 'institution'
                  ? or(eq(admissions.scope, 'offering'), eq(admissions.scope, 'program'))
                  : eq(admissions.scope, 'offering'),
              ),
            )
        )
          .map((r) => r.offeringId)
          .filter((id): id is number => id != null);

  const targets = ids.filter((id) => !moreSpecific.includes(id));
  if (targets.length === 0) return 0;

  await tx
    .update(offerings)
    .set({ enrollmentStatus: status })
    .where(inArray(offerings.id, targets));

  return targets.length;
}

export async function createAdmission(
  actor: SessionUser | null | undefined,
  input: AdmissionInputData,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);
  const row = toRow(input, user.id);

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(admissions).values(row);
    const insertId = Number(result.insertId);
    const touched = await applyEnrollmentStatus(tx as unknown as Db, input, new Date());

    await logActivity(tx, {
      userId: user.id,
      entityType: 'admission',
      entityId: insertId,
      action: 'create',
      before: null,
      after: { ...row, offeringsRestated: touched },
    });
    return insertId;
  });

  await rebuildProgramSearch({ db: database });
  return id;
}

export async function updateAdmission(
  actor: SessionUser | null | undefined,
  id: number,
  input: AdmissionInputData,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);
  const row = toRow(input, user.id);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(admissions).where(eq(admissions.id, id)).limit(1);
    if (!before) throw new Error('Convocatoria no encontrada.');

    await tx.update(admissions).set(row).where(eq(admissions.id, id));
    const touched = await applyEnrollmentStatus(tx as unknown as Db, input, new Date());

    await logActivity(tx, {
      userId: user.id,
      entityType: 'admission',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row, offeringsRestated: touched },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/**
 * Close a convocatoria: `is_active = false`.
 *
 * The offerings it covered fall back to `sin_datos` rather than `cerradas` —
 * we are saying we no longer track this window, not that enrolment is shut.
 */
export async function deactivateAdmission(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(admissions).where(eq(admissions.id, id)).limit(1);
    if (!before) throw new Error('Convocatoria no encontrada.');

    await tx.update(admissions).set({ isActive: false }).where(eq(admissions.id, id));
    await applyEnrollmentStatus(tx as unknown as Db, { ...before, isActive: false }, new Date());

    await logActivity(tx, {
      userId: user.id,
      entityType: 'admission',
      entityId: id,
      action: 'archive',
      before: { isActive: before.isActive },
      after: { isActive: false },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/** Offerings with no admission row at all — the gap the staleness page reports. */
export async function countOfferingsWithoutAdmissions(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<number> {
  requireRole(actor, ['editor']);
  const [row] = await database
    .select({ count: sql<number>`count(*)` })
    .from(offerings)
    .leftJoin(
      admissions,
      and(eq(admissions.offeringId, offerings.id), eq(admissions.isActive, true)),
    )
    .where(and(eq(offerings.status, 'published'), isNull(admissions.id)));
  return Number(row?.count ?? 0);
}

/**
 * Recompute `offerings.enrollment_status` for every active convocatoria
 * (PR-33's `/api/cron/admissions`).
 *
 * Saving a convocatoria already restates the badge for what it covers (§14), so
 * this exists for the transitions **time** makes rather than a person: the day
 * a registration window opens, and the day it closes. It walks the active
 * admissions from widest scope to narrowest and calls the same
 * `applyEnrollmentStatus` the admin path uses, so the precedence rule — a
 * narrower scope wins — is the same code, not a second implementation.
 *
 * Idempotent: writing the status a row already has changes nothing, and the
 * job re-derives from dates rather than stepping a state machine, so firing it
 * twice in a day is a wasted read.
 */
export async function refreshEnrollmentStatuses(
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<number> {
  const rows = await database
    .select({
      scope: admissions.scope,
      institutionId: admissions.institutionId,
      programId: admissions.programId,
      offeringId: admissions.offeringId,
      registrationOpens: admissions.registrationOpens,
      registrationCloses: admissions.registrationCloses,
      isActive: admissions.isActive,
    })
    .from(admissions)
    .where(eq(admissions.isActive, true));

  // Widest first, so a narrower window is applied last and wins — the same
  // ordering `applyEnrollmentStatus` protects with its `moreSpecific` check.
  const order = { institution: 0, program: 1, offering: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.scope] - order[b.scope]);

  let touched = 0;
  for (const row of sorted) {
    touched += await applyEnrollmentStatus(
      database,
      {
        scope: row.scope,
        institutionId: row.institutionId ?? null,
        programId: row.programId ?? null,
        offeringId: row.offeringId ?? null,
        periodLabel: '',
        registrationOpens: row.registrationOpens ?? null,
        registrationCloses: row.registrationCloses ?? null,
        examDate: null,
        classesStart: null,
        requirementsMd: null,
        processMd: null,
        url: null,
        isActive: true,
      },
      now,
    );
  }
  return touched;
}
