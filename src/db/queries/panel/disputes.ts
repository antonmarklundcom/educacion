/**
 * Institution-initiated disputes on an accreditation record (PR-24). Rule 5.
 *
 * ### Why this is accreditation-only
 *
 * `pr-plan.md`'s original PR-24 scope named "an accreditation or price
 * record". Prices are already excluded by a decision `architecture.md` §15
 * settled after that plan was written: an arancel is **direct, live
 * immediately** — the institution is the authority on its own commercial fact
 * and already supersedes a wrong price itself from `/panel/ofertas`, no
 * review gate, no waiting on an admin. A "price dispute" workflow would be a
 * slower path to the same write the institution can already make, which is
 * exactly the kind of duplicate mechanism CLAUDE.md rule 10 (`plan.md` §6 in
 * spirit) says not to build. Accreditation has no such direct-write path —
 * `risks.md` §R-09 forbids it outright — so the dispute is its only remedy,
 * which is what `lib/panel/review.ts` already says: *"The institution's
 * remedy is a dispute, and that is PR-24."*
 *
 * ### No schema change
 *
 * `accreditations.is_disputed` already exists, reserved by this exact
 * comment: `"Set by an institution dispute (PR-24); suppresses the public
 * badge."` (`db/schema.ts`). Setting it is the whole public-facing effect —
 * `src/lib/search/accreditation.ts`'s `isUsable()` already drops a disputed
 * row from consideration, and `rebuild-search.ts` already excludes it from
 * the index at the query level. This PR only builds the write path.
 *
 * The dispute record itself reuses `curation_conflicts` — the same reuse
 * PR-21 already established for review requests (`db/queries/panel/edits.ts`'s
 * `queueReview`) — rather than a new table. It is distinguished from an
 * import-pipeline conflict the same way an institution's review request is:
 * `import_run_id IS NULL`. `kind: 'conflict'` is the closest existing
 * `CONFLICT_KIND` value to what a dispute is — a claim about this field the
 * importer did not resolve — and `proposedJson` is deliberately empty: a
 * dispute is "this is wrong, please look", not a proposed replacement value,
 * so there is nothing for `resolveConflict`'s apply-a-proposal machinery to
 * write, and this module does not use it — `resolveAccreditationDispute`
 * below only ever flips `is_disputed`, never a citation field, so an
 * uncited status can never reach the public badge through this path either.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { accreditations, curationConflicts } from '@/db/schema';
import type { AccreditationScope } from '@/lib/search/accreditation';
import type { AccreditationAgency, AccreditationStatus } from '@/lib/search/contract';
import { logActivity } from '@/db/queries/admin/activity-log';
import { rebuildProgramSearch } from '@/db/queries/rebuild-search';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import { notifyAdminOfDispute } from '@/lib/disputes/notify';

import { accreditationInstitutionId, assertOwnsAccreditation, assertOwnsProgram } from './scope';

const MIN_REASON_LENGTH = 10;

export interface DisputableAccreditation {
  id: number;
  scope: AccreditationScope;
  agency: AccreditationAgency;
  status: AccreditationStatus;
  resolutionNumber: string | null;
  sourceUrl: string | null;
  isDisputed: boolean;
  /** The open dispute's id, if this institution already filed one. */
  openDisputeId: number | null;
}

/**
 * Every accreditation row that could produce the badge shown for this
 * programme: the institution-wide ones and the programme-scoped ones —
 * exactly the two scopes `resolveAccreditation`'s precedence rule ranks
 * highest (`lib/search/accreditation.ts`). Offering-scoped rows are the rare
 * case and are not listed here; disputing one is still possible by id through
 * `fileAccreditationDispute` once support for that surface exists.
 */
export async function listDisputableAccreditations(
  user: SessionUser | null | undefined,
  programId: number,
  database: Db = defaultDb,
): Promise<DisputableAccreditation[]> {
  const institutionId = await assertOwnsProgram(user, programId, database);

  // Two separate queries rather than one OR: `scope` makes `institution_id`
  // and `program_id` mutually exclusive per row
  // (`accreditations_scope_target`), so a single `OR` and two independent
  // `WHERE`s return the same rows — this is clearer about which scope each
  // one is.
  const [institutionRows, programRows] = await Promise.all([
    database
      .select({
        id: accreditations.id,
        scope: accreditations.scope,
        agency: accreditations.agency,
        status: accreditations.status,
        resolutionNumber: accreditations.resolutionNumber,
        sourceUrl: accreditations.sourceUrl,
        isDisputed: accreditations.isDisputed,
      })
      .from(accreditations)
      .where(eq(accreditations.institutionId, institutionId)),
    database
      .select({
        id: accreditations.id,
        scope: accreditations.scope,
        agency: accreditations.agency,
        status: accreditations.status,
        resolutionNumber: accreditations.resolutionNumber,
        sourceUrl: accreditations.sourceUrl,
        isDisputed: accreditations.isDisputed,
      })
      .from(accreditations)
      .where(eq(accreditations.programId, programId)),
  ]);

  const merged = [...institutionRows, ...programRows];
  if (merged.length === 0) return [];

  const openDisputes = await database
    .select({ id: curationConflicts.id, entityId: curationConflicts.entityId })
    .from(curationConflicts)
    .where(
      and(
        eq(curationConflicts.entityType, 'accreditation'),
        eq(curationConflicts.status, 'open'),
        isNull(curationConflicts.importRunId),
      ),
    );
  const disputeByEntity = new Map(openDisputes.map((d) => [d.entityId, d.id]));

  return merged.map((row) => ({
    ...row,
    openDisputeId: disputeByEntity.get(row.id) ?? null,
  }));
}

/**
 * File a dispute. Flips `is_disputed` immediately (the badge is suppressed on
 * the next search rebuild, run inline here — same pattern as every other
 * panel write), queues the reviewable record, and best-effort notifies staff.
 * The notification never blocks or fails the dispute itself, same contract as
 * `leads/notify.ts`.
 */
export async function fileAccreditationDispute(
  user: SessionUser | null | undefined,
  accreditationId: number,
  reason: string,
  database: Db = defaultDb,
): Promise<void> {
  await assertOwnsAccreditation(user, accreditationId, database);
  const actorId = user!.id;

  const trimmedReason = reason.trim();
  if (trimmedReason.length < MIN_REASON_LENGTH) {
    throw new Error('Contanos con más detalle qué está mal — al menos una frase.');
  }

  const [current] = await database
    .select()
    .from(accreditations)
    .where(eq(accreditations.id, accreditationId))
    .limit(1);
  if (!current) throw new Error('Esa acreditación ya no existe.');

  const [existingOpen] = await database
    .select({ id: curationConflicts.id })
    .from(curationConflicts)
    .where(
      and(
        eq(curationConflicts.entityType, 'accreditation'),
        eq(curationConflicts.entityId, accreditationId),
        eq(curationConflicts.status, 'open'),
        isNull(curationConflicts.importRunId),
      ),
    )
    .limit(1);
  if (existingOpen) {
    throw new Error(
      'Ya hay una disputa abierta para este registro. Te avisamos cuando la resolvamos.',
    );
  }

  await database.transaction(async (tx) => {
    await tx.insert(curationConflicts).values({
      importRunId: null,
      sourceRecordId: null,
      entityType: 'accreditation',
      entityId: accreditationId,
      kind: 'conflict',
      matchScore: null,
      currentJson: { ...current },
      proposedJson: {},
      status: 'open',
      notes: `Disputa de la institución (usuario #${actorId}): ${trimmedReason}`,
    });

    await tx
      .update(accreditations)
      .set({ isDisputed: true })
      .where(eq(accreditations.id, accreditationId));

    await logActivity(tx, {
      userId: actorId,
      entityType: 'accreditation',
      entityId: accreditationId,
      action: 'update',
      before: { isDisputed: current.isDisputed },
      after: { isDisputed: true, disputeReason: trimmedReason },
    });
  });

  await rebuildProgramSearch({ db: database });

  await notifyAdminOfDispute({
    accreditationId,
    institutionId: user!.institutionId ?? current.institutionId ?? 0,
    agency: current.agency,
    status: current.status,
    reason: trimmedReason,
  });
}

/* -------------------------------------------------------------------------- */
/* Admin resolution                                                           */
/* -------------------------------------------------------------------------- */

export interface DisputeListRow {
  id: number;
  entityId: number | null;
  createdAt: Date;
  notes: string | null;
  accreditationStatus: AccreditationStatus | null;
  agency: AccreditationAgency | null;
  isDisputed: boolean | null;
}

export async function listOpenDisputes(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<DisputeListRow[]> {
  requireRole(actor, ['editor']);

  const rows = await database
    .select({
      id: curationConflicts.id,
      entityId: curationConflicts.entityId,
      createdAt: curationConflicts.createdAt,
      notes: curationConflicts.notes,
      accreditationStatus: accreditations.status,
      agency: accreditations.agency,
      isDisputed: accreditations.isDisputed,
    })
    .from(curationConflicts)
    .leftJoin(accreditations, eq(accreditations.id, curationConflicts.entityId))
    .where(
      and(
        eq(curationConflicts.entityType, 'accreditation'),
        eq(curationConflicts.status, 'open'),
        isNull(curationConflicts.importRunId),
      ),
    )
    .orderBy(desc(curationConflicts.id));

  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

export interface DisputeDetail extends DisputeListRow {
  currentJson: Record<string, unknown> | null;
  institutionId: number | null;
  resolutionNumber: string | null;
  sourceUrl: string | null;
}

export async function getDispute(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<DisputeDetail | null> {
  requireRole(actor, ['editor']);

  const [row] = await database
    .select({
      id: curationConflicts.id,
      entityId: curationConflicts.entityId,
      entityType: curationConflicts.entityType,
      importRunId: curationConflicts.importRunId,
      createdAt: curationConflicts.createdAt,
      notes: curationConflicts.notes,
      currentJson: curationConflicts.currentJson,
      accreditationStatus: accreditations.status,
      agency: accreditations.agency,
      isDisputed: accreditations.isDisputed,
      resolutionNumber: accreditations.resolutionNumber,
      sourceUrl: accreditations.sourceUrl,
    })
    .from(curationConflicts)
    .leftJoin(accreditations, eq(accreditations.id, curationConflicts.entityId))
    .where(eq(curationConflicts.id, id))
    .limit(1);
  if (!row || row.entityType !== 'accreditation' || row.importRunId != null) return null;

  const institutionId =
    row.entityId != null ? await accreditationInstitutionId(row.entityId, database) : null;

  return {
    id: Number(row.id),
    entityId: row.entityId,
    createdAt: row.createdAt,
    notes: row.notes,
    accreditationStatus: row.accreditationStatus,
    agency: row.agency,
    isDisputed: row.isDisputed,
    currentJson: row.currentJson as Record<string, unknown> | null,
    institutionId,
    resolutionNumber: row.resolutionNumber,
    sourceUrl: row.sourceUrl,
  };
}

export interface ResolveDisputeDecision {
  outcome: 'corrected' | 'rejected';
  notes: string | null;
}

/**
 * Always un-suppresses the badge. `corrected` means the moderator already
 * fixed the underlying row via `/admin/acreditaciones` before resolving —
 * the corrected, cited data shows again. `rejected` means the original claim
 * stood all along — the same data shows again, because nothing about it was
 * ever wrong. Either way the public record's provenance survives: nothing
 * here deletes the accreditation row or the dispute row, only their
 * `is_disputed` / `status` flags change, and the dispute row itself is the
 * permanent audit trail of what was claimed and why.
 */
export async function resolveAccreditationDispute(
  actor: SessionUser | null | undefined,
  disputeId: number,
  decision: ResolveDisputeDecision,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  const [row] = await database
    .select()
    .from(curationConflicts)
    .where(eq(curationConflicts.id, disputeId))
    .limit(1);
  if (!row) throw new Error('Esa disputa ya no existe.');
  if (row.entityType !== 'accreditation' || row.importRunId != null) {
    throw new Error('Eso no es una disputa de institución.');
  }
  if (row.status !== 'open') {
    throw new Error(`Esta disputa ya fue resuelta (${row.status}).`);
  }
  if (row.entityId == null) throw new Error('Disputa sin acreditación asociada.');
  const entityId = row.entityId;

  await database.transaction(async (tx) => {
    await tx
      .update(curationConflicts)
      .set({
        status: decision.outcome === 'rejected' ? 'rejected' : 'applied',
        resolvedByUserId: user.id,
        resolvedAt: new Date(),
        notes: decision.notes ?? row.notes,
      })
      .where(eq(curationConflicts.id, disputeId));

    await tx
      .update(accreditations)
      .set({ isDisputed: false })
      .where(eq(accreditations.id, entityId));

    await logActivity(tx, {
      userId: user.id,
      entityType: 'accreditation',
      entityId,
      action: 'update',
      before: { isDisputed: true },
      after: { isDisputed: false, disputeOutcome: decision.outcome },
    });
  });

  await rebuildProgramSearch({ db: database });
}
