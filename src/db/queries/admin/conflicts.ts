/**
 * The import moderation queue (PR-20). CLAUDE.md rule 5.
 *
 * PR-06 classifies every incoming record and writes everything it may not
 * apply into `curation_conflicts`. Until now nothing could resolve one without
 * SQL. This is that surface.
 *
 * ### The acceptance criterion, and how it is met
 *
 * > *approving a conflict writes through the same code path as the importer*
 *
 * Literally: `resolveConflict` calls `insertEntity` and `updateEntity` from
 * `src/db/queries/curation.ts` — the same two functions `applyProposals` calls,
 * now exported for this. There is no second mapping from a proposal to a row,
 * so the column allow-lists, the `assertScopeTarget` and the
 * `assertAccreditationStatusIsSafe` that guard an imported accreditation guard
 * an approved one identically. `apply-rules.ts` said this in a comment before
 * this module existed; this is that comment made true.
 *
 * ### What approval changes, and what it does not
 *
 * A conflict is queued for one of two reasons: **nobody may write this
 * automatically** (a protected field changed, a fuzzy match, a new institution
 * whose `management` no register prints), or **nobody may write this at all**
 * (an accreditation with no citation). Approval answers the first: the human
 * review is precisely what `PROTECTED_FIELDS` was holding out for, so an
 * approved change applies protected fields too — that is the point of the
 * queue, not a hole in it.
 *
 * It does not answer the second. The invariants run inside `insertEntity` and
 * `updateEntity`, so approving an uncited `vigente` throws, and the moderator
 * is told to fix the citation rather than being handed a badge nobody can
 * defend (`risks.md` §R-09). A rule that a human can click past is not a rule.
 *
 * ### Merge
 *
 * `resolveConflict` takes an optional `fields` allow-list: the moderator ticks
 * which of the differing fields to take from the source and which to keep. With
 * no list, the whole proposal applies. That is "approve/reject/merge" without a
 * third code path — merge is approve with a narrower diff.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { curationConflicts, importRuns, sourceRecords } from '@/db/schema';
import { insertEntity, updateEntity, type ColumnValues } from '@/db/queries/curation';
import { protectedFieldsFor } from '@/lib/curate';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { ConflictEntity } from '@/lib/ingest/contract';

import { logActivity } from './activity-log';
import { rebuildProgramSearch } from '../rebuild-search';
import type { AdminListPage } from './institutions';

export type ConflictRow = typeof curationConflicts.$inferSelect;

export interface ConflictListRow {
  id: number;
  entityType: ConflictEntity;
  entityId: number | null;
  kind: ConflictRow['kind'];
  matchScore: number | null;
  status: ConflictRow['status'];
  notes: string | null;
  createdAt: Date;
  sourceName: string | null;
  sourceUrl: string | null;
}

const PAGE_SIZE = 25;

/**
 * Keys a proposal carries that are not columns of anything.
 *
 * `matchCandidates` and `matchMethod` are put there by `applyProposals` so the
 * moderator can see the alternatives; `citable` is the parser's verdict
 * (`classify.ts`). None is a field, and passing one to a write would either be
 * ignored by the column allow-list or, worse, become a column later.
 */
export const NON_COLUMN_KEYS: ReadonlySet<string> = new Set([
  'matchCandidates',
  'matchMethod',
  'citable',
]);

export function proposedColumns(proposed: Record<string, unknown>): ColumnValues {
  const out: ColumnValues = {};
  for (const [key, value] of Object.entries(proposed)) {
    if (!NON_COLUMN_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** Fields where the proposal differs from what we have, for the merge UI. */
export function differingFields(
  current: Record<string, unknown> | null,
  proposed: Record<string, unknown>,
): string[] {
  const columns = proposedColumns(proposed);
  if (!current) return Object.keys(columns).filter((key) => columns[key] !== undefined);
  return Object.keys(columns).filter(
    (key) =>
      columns[key] !== undefined && JSON.stringify(current[key]) !== JSON.stringify(columns[key]),
  );
}

export async function countOpenConflicts(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<number> {
  requireRole(actor, ['editor']);
  const [row] = await database
    .select({ count: sql<number>`count(*)` })
    .from(curationConflicts)
    .where(eq(curationConflicts.status, 'open'));
  return Number(row?.count ?? 0);
}

export async function listConflicts(
  actor: SessionUser | null | undefined,
  options: {
    status?: ConflictRow['status'];
    entityType?: ConflictEntity | null;
    page?: number;
  } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<ConflictListRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const conditions = [eq(curationConflicts.status, options.status ?? 'open')];
  if (options.entityType) conditions.push(eq(curationConflicts.entityType, options.entityType));
  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    database
      .select({
        id: curationConflicts.id,
        entityType: curationConflicts.entityType,
        entityId: curationConflicts.entityId,
        kind: curationConflicts.kind,
        matchScore: curationConflicts.matchScore,
        status: curationConflicts.status,
        notes: curationConflicts.notes,
        createdAt: curationConflicts.createdAt,
        sourceName: sourceRecords.source,
        sourceUrl: sourceRecords.sourceUrl,
      })
      .from(curationConflicts)
      .leftJoin(sourceRecords, eq(sourceRecords.id, curationConflicts.sourceRecordId))
      .where(where)
      .orderBy(desc(curationConflicts.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(curationConflicts)
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, id: Number(r.id) })) as ConflictListRow[],
    total: Number(count),
    page,
    pageSize: PAGE_SIZE,
  };
}

export interface ConflictDetail extends ConflictListRow {
  currentJson: Record<string, unknown> | null;
  proposedJson: Record<string, unknown>;
  sourceRecordId: number | null;
  importRunId: number | null;
  /** Fields the source disagrees with us about. */
  differing: string[];
  /** Of those, the ones only a human may change (`PROTECTED_FIELDS`). */
  protectedFields: string[];
}

export async function getConflict(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<ConflictDetail | null> {
  requireRole(actor, ['editor']);

  const [row] = await database
    .select({
      conflict: curationConflicts,
      sourceName: sourceRecords.source,
      sourceUrl: sourceRecords.sourceUrl,
    })
    .from(curationConflicts)
    .leftJoin(sourceRecords, eq(sourceRecords.id, curationConflicts.sourceRecordId))
    .where(eq(curationConflicts.id, id))
    .limit(1);
  if (!row) return null;

  const conflict = row.conflict;
  const proposed = (conflict.proposedJson ?? {}) as Record<string, unknown>;
  const current = (conflict.currentJson ?? null) as Record<string, unknown> | null;
  const differing = differingFields(current, proposed);

  return {
    id: Number(conflict.id),
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    kind: conflict.kind,
    matchScore: conflict.matchScore,
    status: conflict.status,
    notes: conflict.notes,
    createdAt: conflict.createdAt,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    currentJson: current,
    proposedJson: proposed,
    sourceRecordId: conflict.sourceRecordId != null ? Number(conflict.sourceRecordId) : null,
    importRunId: conflict.importRunId != null ? Number(conflict.importRunId) : null,
    differing,
    protectedFields: differing.filter((field) =>
      protectedFieldsFor(conflict.entityType).includes(field),
    ),
  };
}

export interface ResolveResult {
  status: 'applied' | 'rejected';
  entityId: number | null;
  fieldsApplied: string[];
}

/**
 * Approve (optionally narrowed to `fields`), or reject.
 *
 * Approval writes through `insertEntity` / `updateEntity` — the importer's own
 * write path — so nothing here re-implements a mapping or a guard. If an
 * invariant refuses the row, this throws and the conflict stays `open`: a
 * queue entry that silently became `applied` without a write is the one
 * outcome that would make the queue untrustworthy.
 */
export async function resolveConflict(
  actor: SessionUser | null | undefined,
  id: number,
  decision: { action: 'approve' | 'reject'; fields?: readonly string[]; note?: string | null },
  database: Db = defaultDb,
): Promise<ResolveResult> {
  const user = requireRole(actor, ['editor']);

  const [row] = await database
    .select()
    .from(curationConflicts)
    .where(eq(curationConflicts.id, id))
    .limit(1);
  if (!row) throw new Error('Ese conflicto ya no existe.');
  if (row.status !== 'open') {
    throw new Error(`Este conflicto ya fue resuelto (${row.status}).`);
  }

  const proposed = proposedColumns((row.proposedJson ?? {}) as Record<string, unknown>);
  const current = (row.currentJson ?? null) as Record<string, unknown> | null;

  if (decision.action === 'reject') {
    await database
      .update(curationConflicts)
      .set({
        status: 'rejected',
        resolvedByUserId: user.id,
        resolvedAt: new Date(),
        notes: decision.note ?? row.notes,
      })
      .where(eq(curationConflicts.id, id));

    await logActivity(database, {
      userId: user.id,
      entityType: 'curation_conflict',
      entityId: Number(row.id),
      action: 'update',
      before: { status: 'open' },
      after: { status: 'rejected', note: decision.note ?? null },
    });

    return { status: 'rejected', entityId: row.entityId, fieldsApplied: [] };
  }

  // Merge is approve with a narrower diff. An empty selection is a no-op the
  // moderator did not mean, so it is refused rather than silently marking the
  // conflict applied.
  const allowed = decision.fields ? new Set(decision.fields) : null;
  const values: ColumnValues = allowed
    ? Object.fromEntries(Object.entries(proposed).filter(([key]) => allowed.has(key)))
    : proposed;

  if (row.entityId != null && Object.keys(values).length === 0) {
    throw new Error('No seleccionaste ningún campo para aplicar.');
  }

  let entityId: number | null = row.entityId;
  const sourceRecordId = row.sourceRecordId != null ? Number(row.sourceRecordId) : 0;

  if (row.entityId == null) {
    // A create. The whole proposal goes in — a half-created row would violate
    // a NOT NULL, and `REQUIRED_CREATE_FIELDS` is what the queue was protecting.
    entityId = await insertEntity(database, row.entityType, proposed, sourceRecordId);
  } else {
    await updateEntity(database, row.entityType, row.entityId, values);
  }

  await database
    .update(curationConflicts)
    .set({
      status: 'applied',
      resolvedByUserId: user.id,
      resolvedAt: new Date(),
      notes: decision.note ?? row.notes,
    })
    .where(eq(curationConflicts.id, id));

  await logActivity(database, {
    userId: user.id,
    entityType: row.entityType,
    entityId,
    action: row.entityId == null ? 'create' : 'update',
    before: current,
    after: { ...values, resolvedFromConflictId: Number(row.id) },
  });

  await rebuildProgramSearch({ db: database });

  return { status: 'applied', entityId, fieldsApplied: Object.keys(values) };
}

/**
 * Mark every other open conflict aimed at the same entity as `superseded`.
 *
 * Two import runs against a register that changed twice leave two open rows
 * for one program, and resolving the newer one makes the older one a decision
 * about a state that no longer exists. `CONFLICT_STATUS` already has the word
 * for that; this is what uses it.
 */
export async function supersedeStaleConflicts(
  actor: SessionUser | null | undefined,
  entityType: ConflictEntity,
  entityId: number,
  exceptId: number,
  database: Db = defaultDb,
): Promise<number> {
  requireRole(actor, ['editor']);

  const rows = await database
    .select({ id: curationConflicts.id })
    .from(curationConflicts)
    .where(
      and(
        eq(curationConflicts.status, 'open'),
        eq(curationConflicts.entityType, entityType),
        eq(curationConflicts.entityId, entityId),
      ),
    );

  const ids = rows.map((r) => Number(r.id)).filter((value) => value !== exceptId);
  if (ids.length === 0) return 0;

  await database
    .update(curationConflicts)
    .set({ status: 'superseded', resolvedAt: new Date() })
    .where(inArray(curationConflicts.id, ids));

  return ids.length;
}

/** The last few import runs, for the queue's header. */
export async function listRecentImportRuns(
  actor: SessionUser | null | undefined,
  limit = 5,
  database: Db = defaultDb,
) {
  requireRole(actor, ['editor']);
  return database.select().from(importRuns).orderBy(desc(importRuns.id)).limit(limit);
}
