/**
 * Step 5, the decision half: *may this proposal be written without a human?*
 *
 * Every rule here is a "no". The apply step in `src/db/queries/curation.ts`
 * writes a proposal only if nothing in this module objects, and everything it
 * objects to lands in `curation_conflicts` instead — which is the whole point
 * of the moderation queue existing (`data-sources.md` §3, `pr-plan.md` PR-06).
 *
 * These functions are pure so they can be tested without a database, and they
 * are the same functions PR-20's "approve this conflict" action must call, so
 * an approved conflict cannot take a path the importer would have refused.
 */

import { hasRequiredCitation } from '@/db/invariants';
import type { Classification, ConflictEntity, CurationProposal } from '@/lib/ingest/contract';

import { changedFields, isProtectedField } from './classify';

/**
 * NOT NULL columns an auto-create must be able to fill *from the source*.
 *
 * This is the rule that keeps `institutions` out of the auto-apply path in
 * practice: `management` (pública/privada) is not printed by either register,
 * and inferring it from the word "Nacional" in a name is a guess about a fact
 * that appears on every card and every filter. A new institution is therefore
 * a `new` proposal that queues — honest about what it is, and reviewed once.
 */
export const REQUIRED_CREATE_FIELDS: Partial<Record<ConflictEntity, readonly string[]>> = {
  institution: ['nameOfficial', 'nameShort', 'slug', 'matchKey', 'management', 'type'],
  campus: ['institutionId', 'name', 'slug', 'cityId'],
  program: ['institutionId', 'nameOfficial', 'slug', 'matchKey', 'level'],
  offering: ['programId', 'campusId', 'modality'],
  accreditation: ['scope', 'agency', 'kind', 'status'],
  career: ['slug', 'nameEs'],
};

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value === 'string' ? value.trim().length > 0 : true;
}

/** Every NOT NULL field the source actually supplied. */
export function missingCreateFields(
  entityType: ConflictEntity,
  proposed: Record<string, unknown>,
): string[] {
  return (REQUIRED_CREATE_FIELDS[entityType] ?? []).filter((field) => !present(proposed[field]));
}

/**
 * The accreditation gate — the rule this PR exists to enforce.
 *
 * No accreditation row is ever written automatically unless:
 *  - it carries `source_url` or `resolution_number` (rule 2, `R-09`), **and**
 *  - the parser judged the underlying row citable (`citable: false` rows are
 *    those with neither, and a positive status from one is exactly the write
 *    that would put an uncitable badge on a public page), **and**
 *  - it does not assert a negative. `no_acreditada` always gets a human, even
 *    cited: a wrong negative is the defamatory-adjacent one, and absence of a
 *    row is `sin_datos`, never a negative.
 *  - CONES is not passed off as an accreditation agency. It certifies
 *    habilitación; conflating the two is the single most damaging mistake
 *    available to this pipeline (`plan.md` §2).
 */
export function accreditationBlocker(proposed: Record<string, unknown>): string | null {
  const status = proposed.status as string | undefined;
  if (!status) return 'sin estado';

  if (status === 'no_acreditada') return 'un estado negativo nunca se aplica automáticamente';

  // An accreditation that is not attached to anything cannot be written: the
  // `accreditations_scope_target` CHECK would reject it, and more to the point
  // an unattached badge is a claim about nobody in particular.
  const target = { institution: 'institutionId', program: 'programId', offering: 'offeringId' }[
    String(proposed.scope)
  ];
  if (!target || proposed[target] == null) return 'sin entidad a la que asociarla';

  if (proposed.citable === false) return 'la fila de origen no es citable';
  if (proposed.agency === 'CONES' && proposed.kind === 'acreditacion') {
    return 'CONES habilita, no acredita';
  }
  if (
    !hasRequiredCitation({
      status: status as 'vigente',
      sourceUrl: (proposed.sourceUrl as string | null) ?? null,
      resolutionNumber: (proposed.resolutionNumber as string | null) ?? null,
    })
  ) {
    return 'sin source_url ni resolution_number';
  }
  return null;
}

/**
 * The fields of an update that may actually be written: changed, and not
 * protected.
 *
 * A protected diff has already made the classifier say `conflict`, so this is
 * the second gate rather than the first. It exists because "nothing in
 * PROTECTED_FIELDS auto-updates" must survive someone later constructing a
 * proposal by hand and getting the classification wrong.
 */
export function applicableUpdate(
  entityType: ConflictEntity,
  current: Record<string, unknown> | null,
  proposed: Record<string, unknown>,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const field of changedFields(current, proposed)) {
    if (isProtectedField(entityType, field)) continue;
    update[field] = proposed[field];
  }
  return update;
}

export interface ApplyDecision {
  apply: boolean;
  /** Why not, in the language of the moderation queue. Null when applying. */
  reason: string | null;
}

const QUEUES_ALWAYS: readonly Classification[] = ['conflict', 'ambiguous_match'];

export function decideApply(proposal: CurationProposal): ApplyDecision {
  const proposed = proposal.proposed as Record<string, unknown>;
  const current = proposal.current as Record<string, unknown> | null;

  if (proposal.classification === 'unchanged') {
    return { apply: false, reason: null };
  }

  if (QUEUES_ALWAYS.includes(proposal.classification)) {
    return {
      apply: false,
      reason:
        proposal.classification === 'ambiguous_match'
          ? `coincidencia dudosa (${proposal.match.method}, ${proposal.match.score})`
          : 'cambio en un campo protegido',
    };
  }

  if (proposal.entityType === 'accreditation') {
    const blocked = accreditationBlocker(proposed);
    if (blocked) return { apply: false, reason: blocked };
  }

  if (proposal.classification === 'new') {
    const missing = missingCreateFields(proposal.entityType, proposed);
    if (missing.length > 0) {
      return { apply: false, reason: `faltan datos de origen: ${missing.join(', ')}` };
    }
    return { apply: true, reason: null };
  }

  // 'changed'
  const update = applicableUpdate(proposal.entityType, current, proposed);
  if (Object.keys(update).length === 0) {
    return { apply: false, reason: 'solo cambian campos protegidos' };
  }
  return { apply: true, reason: null };
}

/** Convenience predicate — `decideApply().apply`. */
export function isAutoApplicable(proposal: CurationProposal): boolean {
  return decideApply(proposal).apply;
}
