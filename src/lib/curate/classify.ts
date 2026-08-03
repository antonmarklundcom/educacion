/**
 * Step 4 of the pipeline: NEW / UNCHANGED / CHANGED / CONFLICT.
 *
 * The classifier answers one question — *what kind of thing is this row?* — and
 * deliberately not the second one, *may we write it?*, which lives in
 * `apply-rules.ts`. Keeping them apart means the moderation queue can show an
 * honest `new` for a row that is nonetheless not safe to auto-create, instead
 * of relabelling it `conflict` and losing the reason.
 *
 * The rules, in order:
 *
 * 1. A fuzzy or ambiguous match is `ambiguous_match`. Nothing is written on a
 *    guess, however good the score (`FUZZY_AUTO_APPLY` is false).
 * 2. No current row ⇒ `new`.
 * 3. No differing field ⇒ `unchanged`. This is what makes re-running the
 *    curation step a no-op, the same way the checksum makes re-importing one.
 * 4. A differing field in `PROTECTED_FIELDS` ⇒ `conflict`, **even when the
 *    match is certain**. Accreditation status, price, slug, level, management
 *    and `cones_code` are the fields where a wrong automatic write is publicly
 *    damaging (`data-sources.md` §3, `risks.md` §R-09).
 * 5. Anything else ⇒ `changed`.
 */

import {
  PROTECTED_FIELDS,
  type Classification,
  type ConflictEntity,
  type MatchResult,
} from '@/lib/ingest/contract';

import { isAmbiguous } from './match';

/** `curation_conflicts.entity_type` is singular; `PROTECTED_FIELDS` is keyed by table. */
const PROTECTED_KEY_BY_ENTITY: Partial<Record<ConflictEntity, keyof typeof PROTECTED_FIELDS>> = {
  institution: 'institutions',
  program: 'programs',
  accreditation: 'accreditations',
  price: 'prices',
};

export function protectedFieldsFor(entityType: ConflictEntity): readonly string[] {
  const key = PROTECTED_KEY_BY_ENTITY[entityType];
  return key ? (PROTECTED_FIELDS[key] ?? []) : [];
}

export function isProtectedField(entityType: ConflictEntity, field: string): boolean {
  return protectedFieldsFor(entityType).includes(field);
}

/**
 * Keys a proposal may carry that are not columns.
 *
 * `citable` is the parser's verdict on whether the source row can support a
 * positive accreditation status. It travels with the proposal so the apply
 * gate and the moderator both see it, but it is not a field of any table:
 * counting it as a diff would make every accreditation look `changed` on every
 * run, and the whole design depends on a re-run being `unchanged`.
 */
export const CURATION_ONLY_FIELDS: ReadonlySet<string> = new Set(['citable']);

/**
 * Fields of `proposed` that differ from `current`.
 *
 * `undefined` in `proposed` means "this source has nothing to say about that
 * field" and is skipped; `null` means "the source says there is no value" and
 * counts as a difference. Collapsing the two would let a register that omits a
 * column erase data another source supplied.
 */
export function changedFields(
  current: Record<string, unknown> | null,
  proposed: Record<string, unknown>,
): string[] {
  if (!current) {
    return Object.keys(proposed).filter(
      (key) => proposed[key] !== undefined && !CURATION_ONLY_FIELDS.has(key),
    );
  }

  return Object.entries(proposed)
    .filter(([key, value]) => {
      if (value === undefined || CURATION_ONLY_FIELDS.has(key)) return false;
      const before = current[key] ?? null;
      const after = value ?? null;
      if (before instanceof Date || after instanceof Date) {
        return String(before) !== String(after);
      }
      return before !== after;
    })
    .map(([key]) => key);
}

export interface ClassifyInput {
  entityType: ConflictEntity;
  current: Record<string, unknown> | null;
  proposed: Record<string, unknown>;
  match: MatchResult;
}

export function classify(input: ClassifyInput): Classification {
  if (isAmbiguous(input.match)) return 'ambiguous_match';
  if (!input.current) return 'new';

  const changed = changedFields(input.current, input.proposed);
  if (changed.length === 0) return 'unchanged';
  if (changed.some((field) => isProtectedField(input.entityType, field))) return 'conflict';
  return 'changed';
}
