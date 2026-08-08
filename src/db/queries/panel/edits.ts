/**
 * What an institution may change about itself, and how (PR-21). Rule 5.
 *
 * Every function here does the same four things in the same order, and the
 * order is the security property:
 *
 *   1. `assertOwns*` — the id came from a URL, so it is checked against the
 *      session before it is used for anything (`scope.ts`).
 *   2. `splitSubmission` — the field-level split into write / review / refuse
 *      (`src/lib/panel/review.ts`).
 *   3. the write, and/or the `curation_conflicts` row.
 *   4. `activity_log`, then the search rebuild.
 *
 * The review half reuses the queue PR-20 built rather than inventing a second
 * one: an institution's request to change its programme's official name lands
 * in `/admin/moderacion` beside the importer's conflicts, and is applied
 * through the importer's own write path when a human approves it
 * (`architecture.md` §14.1). One queue, one apply path, one place to look.
 */

import { and, eq } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { assertPriceIsCoherent } from '@/db/invariants';
import { admissions, curationConflicts, offerings, prices, programs } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { rebuildProgramSearch } from '@/db/queries/rebuild-search';
import type { SessionUser } from '@/lib/auth/session';
import {
  splitSubmission,
  submissionMessage,
  type PanelEntity,
  type SplitSubmission,
} from '@/lib/panel/review';

import {
  assertOwnsAdmission,
  assertOwnsOffering,
  assertOwnsProgram,
  panelInstitutionId,
} from './scope';

export interface PanelSaveResult {
  message: string;
  wrote: string[];
  queued: string[];
  rejected: string[];
}

function result(split: SplitSubmission): PanelSaveResult {
  return {
    message: submissionMessage(split),
    wrote: Object.keys(split.direct),
    queued: Object.keys(split.review),
    rejected: split.rejected,
  };
}

/**
 * Queue a review request as a `curation_conflicts` row.
 *
 * `sourceRecordId` is null — this proposal came from the institution, not from
 * a register — and `kind` is `changed`, which is exactly what it is. The
 * moderator sees current vs proposed and the same approve/merge/reject controls
 * as for an imported row, because it is the same row type.
 *
 * `matchScore` is left null rather than set to 100. A score is the matcher's
 * confidence that two records describe the same thing; there was no matching
 * here, and writing a perfect score would tell a moderator an algorithm agreed
 * with something no algorithm looked at.
 */
async function queueReview(
  database: Db,
  entityType: PanelEntity,
  entityId: number,
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  actorId: number,
): Promise<void> {
  if (Object.keys(proposed).length === 0) return;

  await database.insert(curationConflicts).values({
    importRunId: null,
    sourceRecordId: null,
    entityType,
    entityId,
    kind: 'changed',
    matchScore: null,
    currentJson: Object.fromEntries(
      Object.keys(proposed).map((key) => [key, current[key] ?? null]),
    ),
    proposedJson: proposed,
    status: 'open',
    notes: `Solicitud de la institución (usuario #${actorId})`,
  });
}

/* -------------------------------------------------------------------------- */
/* Programs                                                                   */
/* -------------------------------------------------------------------------- */

export async function savePanelProgram(
  user: SessionUser | null | undefined,
  programId: number,
  submitted: Record<string, unknown>,
  database: Db = defaultDb,
): Promise<PanelSaveResult> {
  await assertOwnsProgram(user, programId, database);
  const actorId = user!.id;

  const [current] = await database
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);
  if (!current) throw new Error('Esa carrera ya no existe.');

  const split = splitSubmission('program', submitted, current as Record<string, unknown>);

  if (Object.keys(split.direct).length > 0) {
    await database.update(programs).set(split.direct).where(eq(programs.id, programId));
  }
  await queueReview(
    database,
    'program',
    programId,
    current as Record<string, unknown>,
    split.review,
    actorId,
  );

  await logActivity(database, {
    userId: actorId,
    entityType: 'program',
    entityId: programId,
    action: 'update',
    before: { ...current },
    after: { ...current, ...split.direct, submittedForReview: Object.keys(split.review) },
  });

  if (Object.keys(split.direct).length > 0) await rebuildProgramSearch({ db: database });
  return result(split);
}

/* -------------------------------------------------------------------------- */
/* Offerings                                                                  */
/* -------------------------------------------------------------------------- */

export async function savePanelOffering(
  user: SessionUser | null | undefined,
  offeringId: number,
  submitted: Record<string, unknown>,
  database: Db = defaultDb,
): Promise<PanelSaveResult> {
  await assertOwnsOffering(user, offeringId, database);
  const actorId = user!.id;

  const [current] = await database
    .select()
    .from(offerings)
    .where(eq(offerings.id, offeringId))
    .limit(1);
  if (!current) throw new Error('Esa oferta ya no existe.');

  const split = splitSubmission('offering', submitted, current as Record<string, unknown>);

  if (Object.keys(split.direct).length > 0) {
    await database.update(offerings).set(split.direct).where(eq(offerings.id, offeringId));
  }
  await queueReview(
    database,
    'offering',
    offeringId,
    current as Record<string, unknown>,
    split.review,
    actorId,
  );

  await logActivity(database, {
    userId: actorId,
    entityType: 'offering',
    entityId: offeringId,
    action: 'update',
    before: { ...current },
    after: { ...current, ...split.direct, submittedForReview: Object.keys(split.review) },
  });

  if (Object.keys(split.direct).length > 0) await rebuildProgramSearch({ db: database });
  return result(split);
}

/* -------------------------------------------------------------------------- */
/* Prices — the reason the panel exists                                       */
/* -------------------------------------------------------------------------- */

export interface PanelPriceInput {
  currency: 'PYG' | 'USD';
  matricula: number | null;
  monthlyFee: number | null;
  installmentsPerYear: number | null;
  admissionFee: number | null;
  isFree: boolean;
  notesMd: string | null;
  sourceUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
}

/**
 * An institution publishing its own arancel. **Direct, and immediately live.**
 *
 * It supersedes rather than edits, exactly as the admin path does
 * (`architecture.md` §14): the previous current row becomes history in the same
 * transaction. `source` is stamped `'institucion'` — the strongest provenance
 * this dataset has — and `verified_at` is now, because the institution telling
 * us its own price *is* the verification.
 *
 * There is no review gate here and that is the deliberate choice. An arancel is
 * the institution's own commercial fact; queueing it behind a human would mean
 * the most valuable thing the panel can produce arrives days late and only if
 * somebody is watching a queue. The safeguards are the ones that already exist:
 * the coherence invariant, `activity_log`, and the 12-month clock.
 */
export async function savePanelPrice(
  user: SessionUser | null | undefined,
  offeringId: number,
  input: PanelPriceInput,
  database: Db = defaultDb,
): Promise<PanelSaveResult> {
  await assertOwnsOffering(user, offeringId, database);
  const actorId = user!.id;

  assertPriceIsCoherent(input);

  const row: typeof prices.$inferInsert = {
    offeringId,
    currency: input.currency,
    matricula: input.matricula,
    monthlyFee: input.monthlyFee,
    installmentsPerYear: input.installmentsPerYear,
    admissionFee: input.admissionFee,
    isFree: input.isFree,
    notesMd: input.notesMd,
    source: 'institucion',
    sourceUrl: input.sourceUrl,
    validFrom: input.validFrom,
    validTo: input.validTo,
    isCurrent: true,
    verifiedAt: new Date(),
    verifiedByUserId: actorId,
  };

  await database.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(prices)
      .where(and(eq(prices.offeringId, offeringId), eq(prices.isCurrent, true)))
      .limit(1);

    if (previous) {
      await tx.update(prices).set({ isCurrent: false }).where(eq(prices.id, previous.id));
    }

    const [inserted] = await tx.insert(prices).values(row);

    await logActivity(tx, {
      userId: actorId,
      entityType: 'price',
      entityId: Number(inserted.insertId),
      action: 'create',
      before: previous ? { ...previous } : null,
      after: { ...row },
    });
  });

  await rebuildProgramSearch({ db: database });

  return {
    message: 'Publicamos tu arancel. Ya se ve en el sitio y en el comparador.',
    wrote: Object.keys(input),
    queued: [],
    rejected: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Admissions                                                                 */
/* -------------------------------------------------------------------------- */

export async function savePanelAdmission(
  user: SessionUser | null | undefined,
  admissionId: number,
  submitted: Record<string, unknown>,
  database: Db = defaultDb,
): Promise<PanelSaveResult> {
  await assertOwnsAdmission(user, admissionId, database);
  const actorId = user!.id;

  const [current] = await database
    .select()
    .from(admissions)
    .where(eq(admissions.id, admissionId))
    .limit(1);
  if (!current) throw new Error('Esa convocatoria ya no existe.');

  const split = splitSubmission('admission', submitted, current as Record<string, unknown>);

  if (Object.keys(split.direct).length > 0) {
    await database
      .update(admissions)
      .set({ ...split.direct, verifiedAt: new Date(), verifiedByUserId: actorId })
      .where(eq(admissions.id, admissionId));
  }

  await logActivity(database, {
    userId: actorId,
    entityType: 'admission',
    entityId: admissionId,
    action: 'update',
    before: { ...current },
    after: { ...current, ...split.direct },
  });

  if (Object.keys(split.direct).length > 0) await rebuildProgramSearch({ db: database });
  return result(split);
}

/**
 * Create a convocatoria for one of the institution's own programmes.
 *
 * Scope is fixed to `program` and the programme is checked: an institution
 * cannot create an institution-wide convocatoria for somebody else, and cannot
 * create one at all for an institution that is not its own — `assertOwnsProgram`
 * is what makes the second true regardless of what the form posted.
 */
export async function createPanelAdmission(
  user: SessionUser | null | undefined,
  programId: number,
  submitted: Record<string, unknown>,
  database: Db = defaultDb,
): Promise<number> {
  await assertOwnsProgram(user, programId, database);
  const actorId = user!.id;
  panelInstitutionId(user);

  const split = splitSubmission('admission', submitted, {});
  const periodLabel = String(split.direct.periodLabel ?? '').trim();
  if (!periodLabel) throw new Error('Poné un nombre al período, por ejemplo "Convocatoria 2027".');

  const [inserted] = await database.insert(admissions).values({
    ...split.direct,
    scope: 'program',
    programId,
    periodLabel,
    verifiedAt: new Date(),
    verifiedByUserId: actorId,
  } as typeof admissions.$inferInsert);

  const id = Number(inserted.insertId);
  await logActivity(database, {
    userId: actorId,
    entityType: 'admission',
    entityId: id,
    action: 'create',
    before: null,
    after: { ...split.direct, scope: 'program', programId },
  });

  await rebuildProgramSearch({ db: database });
  return id;
}

/** Review requests this institution has open, for the panel's own dashboard. */
export async function listOwnReviewRequests(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<
  Array<{
    id: number;
    entityType: string;
    entityId: number | null;
    createdAt: Date;
    status: string;
  }>
> {
  const institutionId = panelInstitutionId(user);

  const ownProgramIds = (
    await database
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.institutionId, institutionId))
  ).map((row) => row.id);

  if (ownProgramIds.length === 0) return [];

  const rows = await database
    .select({
      id: curationConflicts.id,
      entityType: curationConflicts.entityType,
      entityId: curationConflicts.entityId,
      createdAt: curationConflicts.createdAt,
      status: curationConflicts.status,
    })
    .from(curationConflicts)
    .where(eq(curationConflicts.entityType, 'program'))
    .orderBy(curationConflicts.id);

  // Filtered in JS against the ids we own rather than trusting the queue's own
  // `entity_id` in a WHERE — the queue holds every institution's rows.
  return rows
    .filter((row) => row.entityId != null && ownProgramIds.includes(row.entityId))
    .map((row) => ({ ...row, id: Number(row.id) }));
}
