/**
 * Which fields an institution may change directly, and which enter review.
 *
 * `pr-plan.md` PR-21 asks for a "submit-for-review workflow for fields we
 * curate". This file is the list of what we curate, and the reasoning behind
 * each side of it. Pure — no database, no session — so the split is one thing
 * to read and one thing to test.
 *
 * ### The principle
 *
 * **The institution is the authority on its own commercial facts. The register
 * is the authority on its identity.**
 *
 * An arancel, a convocatoria, a description, a plan de estudio: the institution
 * knows these and we do not. `plan.md` §6 calls arancel collection the actual
 * cost centre of this business, and `risks.md` §R-03 calls it the core moat —
 * an institution willing to type its own prices is the single most valuable
 * thing the panel can produce. Those publish directly, stamped
 * `source = 'institucion'` with `verified_at` and the user who did it.
 *
 * The programme's official name, its slug, its level, its CONES resolution:
 * these come from a public register, they are what a student is checking us
 * against, and a change to one is a change to a URL Google has indexed or to a
 * fact we cite a source for. Those become a `curation_conflicts` row and land
 * in `/admin/moderacion` — the same queue, resolved through the same importer
 * write path (`architecture.md` §14.1). The institution sees "enviado a
 * revisión", not "guardado".
 *
 * ### The two things the panel cannot touch at all
 *
 * **Accreditation.** Letting an institution edit its own accreditation status
 * is the entire content of `risks.md` §R-09 pointed at our own foot. The
 * institution's remedy is a *dispute*, which flips the badge to "en revisión"
 * and notifies us — and that is PR-24, deliberately not this PR.
 *
 * **`status`.** Publishing and archiving decide what is in the national index.
 * An institution un-publishing a programme it still runs would make the
 * directory quietly wrong in the one way nobody can detect from outside.
 * Removal requests go through the R-14 policy, not a checkbox.
 */

export type PanelEntity = 'program' | 'offering' | 'price' | 'admission';

/** Fields that publish immediately. Everything else on the entity is refused. */
export const DIRECT_FIELDS: Readonly<Record<PanelEntity, readonly string[]>> = {
  // What the institution says about itself, in its own words.
  program: ['descriptionMd', 'titleAwarded'],
  // Facts about how a programme is delivered that the register does not carry.
  offering: ['planUrl', 'credits'],
  // The whole point of the panel.
  price: [
    'currency',
    'matricula',
    'monthlyFee',
    'installmentsPerYear',
    'admissionFee',
    'isFree',
    'notesMd',
    'sourceUrl',
    'validFrom',
    'validTo',
  ],
  admission: [
    'periodLabel',
    'registrationOpens',
    'registrationCloses',
    'examDate',
    'classesStart',
    'requirementsMd',
    'processMd',
    'url',
    'isActive',
  ],
};

/** Fields a change to which becomes a review request instead of a write. */
export const REVIEW_FIELDS: Readonly<Record<PanelEntity, readonly string[]>> = {
  program: ['nameOfficial', 'level', 'conesResolution', 'careerId'],
  offering: ['modality', 'shift', 'durationMonths', 'campusId'],
  price: [],
  admission: [],
};

/**
 * Never writable from `/panel`, by any path.
 *
 * Listed rather than merely omitted, because "not in either list" and
 * "deliberately forbidden" are different facts and the second one deserves to
 * be greppable.
 */
export const FORBIDDEN_FIELDS: Readonly<Record<PanelEntity, readonly string[]>> = {
  program: ['slug', 'status', 'institutionId', 'matchKey'],
  offering: ['status', 'programId', 'enrollmentStatus'],
  price: ['isCurrent', 'offeringId', 'source', 'verifiedAt', 'verifiedByUserId'],
  admission: ['scope', 'institutionId', 'programId', 'offeringId', 'verifiedAt'],
};

export function isDirectField(entity: PanelEntity, field: string): boolean {
  return DIRECT_FIELDS[entity].includes(field);
}

export function isReviewField(entity: PanelEntity, field: string): boolean {
  return REVIEW_FIELDS[entity].includes(field);
}

export function isForbiddenField(entity: PanelEntity, field: string): boolean {
  return FORBIDDEN_FIELDS[entity].includes(field);
}

export interface SplitSubmission {
  /** Written now. */
  direct: Record<string, unknown>;
  /** Queued for review — only the fields that actually differ. */
  review: Record<string, unknown>;
  /** Submitted but not writable from here. Reported, never silently dropped. */
  rejected: string[];
}

/**
 * Split one submission into "write this", "queue this" and "refuse this".
 *
 * A review field whose value **has not changed** is not queued: a moderator
 * opening a request that proposes the value already stored has been given
 * busywork, and the queue's credibility is the thing that makes it get worked.
 *
 * Anything neither direct nor review-eligible is reported in `rejected` rather
 * than ignored. Silently dropping a field an institution typed into a form we
 * rendered is how a panel teaches its users that saving does not work.
 */
export function splitSubmission(
  entity: PanelEntity,
  submitted: Record<string, unknown>,
  current: Record<string, unknown>,
): SplitSubmission {
  const direct: Record<string, unknown> = {};
  const review: Record<string, unknown> = {};
  const rejected: string[] = [];

  for (const [field, value] of Object.entries(submitted)) {
    if (value === undefined) continue;

    if (isDirectField(entity, field)) {
      direct[field] = value;
      continue;
    }
    if (isReviewField(entity, field)) {
      if (JSON.stringify(current[field] ?? null) !== JSON.stringify(value ?? null)) {
        review[field] = value;
      }
      continue;
    }
    rejected.push(field);
  }

  return { direct, review, rejected };
}

/** What the panel tells the user after a save that did both. */
export function submissionMessage(split: SplitSubmission): string {
  const wrote = Object.keys(split.direct).length > 0;
  const queued = Object.keys(split.review).length;

  if (queued > 0 && wrote) {
    return `Guardamos tus cambios. ${queued === 1 ? 'Un campo pasó' : `${queued} campos pasaron`} a revisión porque ${queued === 1 ? 'viene' : 'vienen'} del registro público: te avisamos cuando lo revisemos.`;
  }
  if (queued > 0) {
    return `Enviamos ${queued === 1 ? 'tu cambio' : 'tus cambios'} a revisión. Estos datos vienen del registro público, así que los verificamos antes de publicarlos.`;
  }
  if (wrote) return 'Guardamos tus cambios. Ya se ven en el sitio.';
  return 'No había nada para guardar.';
}
