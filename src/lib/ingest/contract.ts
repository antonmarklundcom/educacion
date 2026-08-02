/**
 * The ingestion & curation interface — types only.
 *
 * PR-02 fixes this contract so PR-05 (raw capture) and PR-06 (matching +
 * apply) share one vocabulary and one hand-off shape, and so PR-20's
 * moderation queue reads the same rows the importer writes.
 *
 * The invariant that governs all of it: PR-05 writes ONLY to `source_records`
 * and `import_runs`. Nothing in the raw layer may touch a curated table.
 */

import type { CONFLICT_ENTITY, CONFLICT_KIND, CONFLICT_STATUS, SOURCE_NAME } from '@/db/schema';

export type SourceName = (typeof SOURCE_NAME)[number];
export type ConflictEntity = (typeof CONFLICT_ENTITY)[number];
export type ConflictKind = (typeof CONFLICT_KIND)[number];
export type ConflictStatus = (typeof CONFLICT_STATUS)[number];

/* -------------------------------------------------------------------------- */
/* PR-05 — raw capture                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One record exactly as the source published it. `payload` is stored verbatim
 * and never edited; `checksum` is a stable hash of the canonicalized payload
 * and is what makes a re-import a no-op instead of a duplicate.
 */
export interface RawRecord<TPayload = Record<string, unknown>> {
  source: SourceName;
  /** The source's own identifier where it has one (CONES code, ANEAES id). */
  externalId: string | null;
  sourceUrl: string | null;
  payload: TPayload;
  checksum: string;
}

export interface ImportRunSummary {
  importRunId: number;
  source: SourceName;
  rowsIn: number;
  rowsNew: number;
  rowsUnchanged: number;
  startedAt: Date;
  finishedAt: Date | null;
}

/** A parser turns a fetched document into raw records. It performs no writes. */
export type SourceParser<TPayload = Record<string, unknown>> = (
  document: string | Buffer,
  context: { sourceUrl: string },
) => RawRecord<TPayload>[];

export type ImportSource = (options?: { dryRun?: boolean }) => Promise<ImportRunSummary>;

/* -------------------------------------------------------------------------- */
/* PR-06 — matching                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Normalization for the matcher (data-sources.md §4.1): uppercase → strip
 * accents → strip punctuation → collapse whitespace → drop stopwords.
 * Deterministic and pure: the same string always yields the same key, in the
 * importer and in `institution_aliases` alike.
 */
export type BuildMatchKey = (rawName: string) => string;

export type MatchMethod = 'cones_code' | 'alias' | 'match_key' | 'acronym' | 'fuzzy' | 'none';

export interface MatchResult {
  entityId: number | null;
  method: MatchMethod;
  /** 0–100. Only `fuzzy` produces a score below the auto-apply threshold. */
  score: number;
  /** Runners-up, for the moderation queue to show the human a real choice. */
  candidates: Array<{ entityId: number; label: string; score: number }>;
}

/** Fuzzy ratio at or above this proposes; below it, nothing is written. */
export const FUZZY_PROPOSE_THRESHOLD = 88;
/** Nothing is auto-applied on a fuzzy match. A human resolves it once. */
export const FUZZY_AUTO_APPLY = false;

/* -------------------------------------------------------------------------- */
/* PR-06 — classification & apply                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every incoming record is classified before anything is written:
 *  - `new`            → create (safe to auto-apply)
 *  - `unchanged`      → no-op
 *  - `changed`        → update, unless the field is protected
 *  - `conflict`       → queue, never apply
 *  - `ambiguous_match`→ queue, never apply
 */
export type Classification = ConflictKind | 'unchanged';

export interface CurationProposal<T = Record<string, unknown>> {
  entityType: ConflictEntity;
  /** Null when proposing a create. */
  entityId: number | null;
  classification: Classification;
  match: MatchResult;
  current: T | null;
  proposed: T;
  sourceRecordId: number;
}

/**
 * Fields that never auto-update from an import, because a wrong write is
 * publicly damaging. A change to any of them queues for review even when the
 * match is certain — data-sources.md §3, risks.md §R-09.
 */
export const PROTECTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  accreditations: ['status', 'agency', 'resolutionNumber', 'validTo'],
  prices: ['matricula', 'monthlyFee', 'installmentsPerYear', 'isFree'],
  institutions: ['slug', 'management', 'conesCode'],
  programs: ['slug', 'level'],
} as const;

export interface ApplyReport {
  applied: number;
  queued: number;
  unchanged: number;
  byEntity: Partial<Record<ConflictEntity, { applied: number; queued: number }>>;
}

/** Applies only what is safe; everything else lands in `curation_conflicts`. */
export type ApplyProposals = (
  proposals: CurationProposal[],
  options?: { importRunId?: number; dryRun?: boolean },
) => Promise<ApplyReport>;
