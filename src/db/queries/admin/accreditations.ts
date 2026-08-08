/**
 * Admin CRUD for `accreditations` (PR-20). CLAUDE.md rule 5.
 *
 * This is the table `plan.md` §2 calls the wedge and `risks.md` §R-09 calls the
 * largest liability, so it gets one rule the other admin modules do not have:
 *
 * **Every write calls `assertAccreditationStatusIsSafe` and `assertScopeTarget`
 * here, in the query module, after the form has already called them.** That is
 * deliberate duplication. The form's copy exists to produce a sentence a
 * moderator can act on; this one exists because the form is not the only caller
 * — PR-21's panel and PR-22's claim flow will reach this module too — and the
 * rule that must never have two implementations is `src/db/invariants.ts`, not
 * the number of places that call it.
 *
 * No citation, no badge. `no_acreditada` is held to the same bar as a positive
 * claim, because asserting an unverified negative about a real institution is
 * the defamatory-adjacent one.
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { assertAccreditationStatusIsSafe, assertScopeTarget } from '@/db/invariants';
import { accreditations, institutions, programs } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { AccreditationInputData } from '@/lib/admin/validation';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export type AccreditationRow = typeof accreditations.$inferSelect;

export interface AccreditationListRow extends AccreditationRow {
  /** The institution this row lands on, resolved for display. Never asserted. */
  institutionShort: string | null;
  programName: string | null;
}

const PAGE_SIZE = 25;

export async function listAccreditationsAdmin(
  actor: SessionUser | null | undefined,
  options: { institutionId?: number | null; status?: string | null; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<AccreditationListRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const conditions = [];
  if (options.institutionId) {
    // An accreditation reaches an institution either directly or through its
    // program; both are the same institution to a moderator filtering the list.
    conditions.push(
      sql`(${accreditations.institutionId} = ${options.institutionId} or ${programs.institutionId} = ${options.institutionId})`,
    );
  }
  if (options.status) {
    conditions.push(eq(accreditations.status, options.status as AccreditationRow['status']));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select({
        row: accreditations,
        programName: programs.nameOfficial,
        institutionShort: institutions.nameShort,
      })
      .from(accreditations)
      .leftJoin(programs, eq(programs.id, accreditations.programId))
      .leftJoin(
        institutions,
        sql`${institutions.id} = coalesce(${accreditations.institutionId}, ${programs.institutionId})`,
      )
      .where(where)
      .orderBy(desc(accreditations.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(accreditations)
      .leftJoin(programs, eq(programs.id, accreditations.programId))
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

export async function getAccreditationForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<AccreditationRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database
    .select()
    .from(accreditations)
    .where(eq(accreditations.id, id))
    .limit(1);
  return row ?? null;
}

function toRow(input: AccreditationInputData, userId: number): typeof accreditations.$inferInsert {
  // Both invariants, on every write, whoever the caller is. See the header.
  assertScopeTarget(input, 'accreditations');
  assertAccreditationStatusIsSafe(input);

  return {
    scope: input.scope,
    institutionId: input.institutionId,
    programId: input.programId,
    offeringId: input.offeringId,
    agency: input.agency,
    kind: input.kind,
    status: input.status,
    model: input.model,
    resolutionNumber: input.resolutionNumber,
    resolutionDate: input.resolutionDate,
    validFrom: input.validFrom,
    validTo: input.validTo,
    sourceUrl: input.sourceUrl,
    verifiedAt: new Date(),
    verifiedByUserId: userId,
  };
}

export async function createAccreditation(
  actor: SessionUser | null | undefined,
  input: AccreditationInputData,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);
  const row = toRow(input, user.id);

  const id = await database.transaction(async (tx) => {
    const [result] = await tx.insert(accreditations).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'accreditation',
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

export async function updateAccreditation(
  actor: SessionUser | null | undefined,
  id: number,
  input: AccreditationInputData,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);
  const row = toRow(input, user.id);

  await database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(accreditations)
      .where(eq(accreditations.id, id))
      .limit(1);
    if (!before) throw new Error('Acreditación no encontrada.');

    await tx.update(accreditations).set(row).where(eq(accreditations.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'accreditation',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  await rebuildProgramSearch({ db: database });
}

/**
 * Retract an accreditation row.
 *
 * There is no `status = 'archived'` on this table, and inventing one would be a
 * restructure. Setting `status = 'sin_datos'` is the honest retraction: it is
 * the value that means "we could not verify this", the badge disappears, and
 * the row — with its resolution number, its source and its history in
 * `activity_log` — survives. Deleting it would destroy the provenance of a
 * claim we once published, which is the one thing an institution disputing a
 * badge is entitled to see (`risks.md` §R-14).
 */
export async function retractAccreditation(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(accreditations)
      .where(eq(accreditations.id, id))
      .limit(1);
    if (!before) throw new Error('Acreditación no encontrada.');

    await tx
      .update(accreditations)
      .set({ status: 'sin_datos', verifiedAt: new Date(), verifiedByUserId: user.id })
      .where(eq(accreditations.id, id));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'accreditation',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'sin_datos' },
    });
  });

  await rebuildProgramSearch({ db: database });
}
