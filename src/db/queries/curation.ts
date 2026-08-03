/**
 * Steps 3–5 of the pipeline, where they meet the database — `npm run curate`.
 *
 * Everything that *decides* lives in `src/lib/curate/` and is pure. This module
 * only reads a snapshot, hands it to `buildProposals`, and writes what
 * `decideApply` allows. That split is deliberate: rule 5 keeps SQL out of the
 * library, and it means the rules that protect an accreditation badge are
 * testable without a MySQL instance.
 *
 * ### What gets written, and what does not
 *
 * - **Applied**: `new` rows whose NOT NULL fields the source actually supplied,
 *   and `changed` rows once protected fields are stripped.
 * - **Queued into `curation_conflicts`**: every `conflict`, every
 *   `ambiguous_match` (which includes *every* fuzzy match), and every `new`
 *   row we cannot create honestly — a new institution, because neither
 *   register prints `management`.
 * - **Never written from here**: an accreditation without a citation, a
 *   negative accreditation status, or anything derived from a CONES row that
 *   claims accreditation. CONES habilita; ANEAES acredita (`plan.md` §2).
 *
 * The whole thing is idempotent. A second run re-derives the same proposals,
 * finds them `unchanged`, and writes nothing — and the open-conflict lookup
 * keeps a re-run from queueing the same conflict twice.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '@/db';
import { assertAccreditationStatusIsSafe, assertScopeTarget } from '@/db/invariants';
import {
  accreditations,
  campuses,
  careers,
  cities,
  curationConflicts,
  importRuns,
  institutionAliases,
  institutions,
  offerings,
  programs,
  sourceRecords,
} from '@/db/schema';
import { decideApply } from '@/lib/curate/apply-rules';
import { applicableUpdate } from '@/lib/curate/apply-rules';
import {
  autoMatchRate,
  buildProposals,
  type AliasCandidate,
  type CurationSnapshot,
  type MatchStats,
  type SourceRecordRow,
} from '@/lib/curate/pipeline';
import type {
  ApplyReport,
  ConflictEntity,
  CurationProposal,
  SourceName,
} from '@/lib/ingest/contract';

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** The curated tables, as the matcher needs to see them. */
export async function loadSnapshot(db: Db): Promise<CurationSnapshot> {
  const [
    institutionRows,
    aliasRows,
    careerRows,
    programRows,
    campusRows,
    offeringRows,
    accreditationRows,
    cityRows,
  ] = await Promise.all([
    db
      .select({
        id: institutions.id,
        nameOfficial: institutions.nameOfficial,
        nameShort: institutions.nameShort,
        acronym: institutions.acronym,
        matchKey: institutions.matchKey,
        conesCode: institutions.conesCode,
      })
      .from(institutions),
    db
      .select({
        institutionId: institutionAliases.institutionId,
        matchKey: institutionAliases.matchKey,
      })
      .from(institutionAliases),
    db
      .select({
        id: careers.id,
        slug: careers.slug,
        nameEs: careers.nameEs,
        synonymsJson: careers.synonymsJson,
      })
      .from(careers),
    db
      .select({
        id: programs.id,
        institutionId: programs.institutionId,
        nameOfficial: programs.nameOfficial,
        matchKey: programs.matchKey,
        slug: programs.slug,
        level: programs.level,
        careerId: programs.careerId,
        conesResolution: programs.conesResolution,
      })
      .from(programs),
    db
      .select({
        id: campuses.id,
        institutionId: campuses.institutionId,
        name: campuses.name,
        slug: campuses.slug,
        cityId: campuses.cityId,
      })
      .from(campuses),
    db
      .select({
        id: offerings.id,
        programId: offerings.programId,
        campusId: offerings.campusId,
        modality: offerings.modality,
        shift: offerings.shift,
      })
      .from(offerings),
    db
      .select({
        id: accreditations.id,
        scope: accreditations.scope,
        institutionId: accreditations.institutionId,
        programId: accreditations.programId,
        offeringId: accreditations.offeringId,
        agency: accreditations.agency,
        kind: accreditations.kind,
        status: accreditations.status,
        model: accreditations.model,
        resolutionNumber: accreditations.resolutionNumber,
        sourceUrl: accreditations.sourceUrl,
        validFrom: accreditations.validFrom,
        validTo: accreditations.validTo,
      })
      .from(accreditations),
    db.select({ id: cities.id, slug: cities.slug, nameEs: cities.nameEs }).from(cities),
  ]);

  return {
    institutions: institutionRows,
    aliases: aliasRows,
    careers: careerRows,
    programs: programRows,
    campuses: campusRows,
    offerings: offeringRows,
    accreditations: accreditationRows,
    cities: cityRows,
  };
}

/** Every raw record captured for a source, oldest first. */
export async function loadSourceRecords(db: Db, source: SourceName): Promise<SourceRecordRow[]> {
  const rows = await db
    .select({
      id: sourceRecords.id,
      source: sourceRecords.source,
      sourceUrl: sourceRecords.sourceUrl,
      payload: sourceRecords.payloadJson,
    })
    .from(sourceRecords)
    .where(eq(sourceRecords.source, source))
    .orderBy(sourceRecords.id);

  return rows.map((row) => ({
    id: Number(row.id),
    source: row.source,
    sourceUrl: row.sourceUrl,
    payload: row.payload,
  }));
}

/** Open conflicts, keyed the way `queueConflict` de-duplicates. */
async function loadOpenConflictKeys(
  db: Db,
  sourceRecordIds: readonly number[],
): Promise<Set<string>> {
  if (sourceRecordIds.length === 0) return new Set();

  const keys = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < sourceRecordIds.length; i += CHUNK) {
    const rows = await db
      .select({
        sourceRecordId: curationConflicts.sourceRecordId,
        entityType: curationConflicts.entityType,
        entityId: curationConflicts.entityId,
        kind: curationConflicts.kind,
      })
      .from(curationConflicts)
      .where(
        and(
          eq(curationConflicts.status, 'open'),
          inArray(curationConflicts.sourceRecordId, sourceRecordIds.slice(i, i + CHUNK)),
        ),
      );
    for (const row of rows) {
      keys.add(`${row.sourceRecordId}:${row.entityType}:${row.entityId ?? 'new'}:${row.kind}`);
    }
  }
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

type ColumnValues = Record<string, unknown>;

/**
 * Explicit column mapping per entity.
 *
 * A proposal is a plain object, and passing it straight to `.values()` would
 * mean any key someone adds later becomes a column write. Listing the columns
 * is also what keeps `citable` — a curation-only flag, not a column — out of
 * the insert.
 */
function pick(source: ColumnValues, fields: readonly string[]): ColumnValues {
  const out: ColumnValues = {};
  for (const field of fields) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

const INSTITUTION_COLUMNS = [
  'nameOfficial',
  'nameShort',
  'acronym',
  'matchKey',
  'slug',
  'conesCode',
  'management',
  'type',
  'website',
] as const;
const CAMPUS_COLUMNS = ['institutionId', 'name', 'slug', 'cityId', 'address'] as const;
const PROGRAM_COLUMNS = [
  'institutionId',
  'careerId',
  'nameOfficial',
  'slug',
  'matchKey',
  'level',
  'titleAwarded',
  'conesResolution',
] as const;
const OFFERING_COLUMNS = ['programId', 'campusId', 'modality', 'shift', 'durationMonths'] as const;
const ACCREDITATION_COLUMNS = [
  'scope',
  'institutionId',
  'programId',
  'offeringId',
  'agency',
  'kind',
  'status',
  'model',
  'resolutionNumber',
  'resolutionDate',
  'validFrom',
  'validTo',
  'sourceUrl',
] as const;

const COLUMNS: Partial<Record<ConflictEntity, readonly string[]>> = {
  institution: INSTITUTION_COLUMNS,
  campus: CAMPUS_COLUMNS,
  program: PROGRAM_COLUMNS,
  offering: OFFERING_COLUMNS,
  accreditation: ACCREDITATION_COLUMNS,
};

async function insertEntity(
  db: Db,
  entityType: ConflictEntity,
  values: ColumnValues,
  sourceRecordId: number,
): Promise<number | null> {
  const columns = COLUMNS[entityType];
  if (!columns) return null;
  const row = pick(values, columns);

  switch (entityType) {
    case 'institution': {
      const [result] = await db
        .insert(institutions)
        .values(row as typeof institutions.$inferInsert);
      return Number(result.insertId);
    }
    case 'campus': {
      const [result] = await db.insert(campuses).values(row as typeof campuses.$inferInsert);
      return Number(result.insertId);
    }
    case 'program': {
      const [result] = await db.insert(programs).values(row as typeof programs.$inferInsert);
      return Number(result.insertId);
    }
    case 'offering': {
      const [result] = await db.insert(offerings).values(row as typeof offerings.$inferInsert);
      return Number(result.insertId);
    }
    case 'accreditation': {
      // The third enforcement of the citation rule, after the CHECK constraint
      // and `decideApply`. It throws rather than skipping: reaching here with
      // an uncited status means an earlier gate is broken, and a loud import
      // failure is the correct outcome (`risks.md` §R-09).
      const values = row as typeof accreditations.$inferInsert;
      assertScopeTarget(values, 'accreditations');
      assertAccreditationStatusIsSafe({ ...values, status: values.status ?? 'sin_datos' });
      const [result] = await db
        .insert(accreditations)
        .values({ ...values, sourceRecordId, verifiedAt: new Date() });
      return Number(result.insertId);
    }
    default:
      return null;
  }
}

async function updateEntity(
  db: Db,
  entityType: ConflictEntity,
  entityId: number,
  values: ColumnValues,
): Promise<void> {
  const columns = COLUMNS[entityType];
  if (!columns) return;
  const row = pick(values, columns);
  if (Object.keys(row).length === 0) return;

  switch (entityType) {
    case 'institution':
      await db.update(institutions).set(row).where(eq(institutions.id, entityId));
      return;
    case 'campus':
      await db.update(campuses).set(row).where(eq(campuses.id, entityId));
      return;
    case 'program':
      await db.update(programs).set(row).where(eq(programs.id, entityId));
      return;
    case 'offering':
      await db.update(offerings).set(row).where(eq(offerings.id, entityId));
      return;
    case 'accreditation': {
      const merged = row as typeof accreditations.$inferInsert;
      // An update that does not touch `status` cannot make the row's claim
      // stronger, so there is nothing to assert.
      if (merged.status) assertAccreditationStatusIsSafe({ ...merged, status: merged.status });
      await db.update(accreditations).set(row).where(eq(accreditations.id, entityId));
      return;
    }
    default:
      return;
  }
}

function conflictKey(proposal: CurationProposal): string {
  return `${proposal.sourceRecordId}:${proposal.entityType}:${proposal.entityId ?? 'new'}:${proposal.classification}`;
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

export interface ApplyOptions {
  importRunId?: number;
  dryRun?: boolean;
  /** Skips re-queueing a conflict that is already open. */
  openConflictKeys?: ReadonlySet<string>;
}

export async function applyProposals(
  db: Db,
  proposals: readonly CurationProposal[],
  options: ApplyOptions = {},
): Promise<ApplyReport> {
  const { importRunId, dryRun = false } = options;
  const openKeys =
    options.openConflictKeys ??
    (await loadOpenConflictKeys(db, [
      ...new Set(proposals.map((proposal) => proposal.sourceRecordId)),
    ]));

  const report: ApplyReport = { applied: 0, queued: 0, unchanged: 0, byEntity: {} };
  const bump = (entity: ConflictEntity, field: 'applied' | 'queued') => {
    const bucket = (report.byEntity[entity] ??= { applied: 0, queued: 0 });
    bucket[field] += 1;
    report[field] += 1;
  };

  const queued: Array<typeof curationConflicts.$inferInsert> = [];
  const seenConflictKeys = new Set<string>();

  for (const proposal of proposals) {
    const decision = decideApply(proposal);

    if (proposal.classification === 'unchanged') {
      report.unchanged += 1;
      continue;
    }

    if (decision.apply) {
      if (!dryRun) {
        if (proposal.classification === 'new') {
          await insertEntity(
            db,
            proposal.entityType,
            proposal.proposed as ColumnValues,
            proposal.sourceRecordId,
          );
        } else {
          await updateEntity(
            db,
            proposal.entityType,
            proposal.entityId!,
            applicableUpdate(
              proposal.entityType,
              proposal.current as ColumnValues | null,
              proposal.proposed as ColumnValues,
            ),
          );
        }
      }
      bump(proposal.entityType, 'applied');
      continue;
    }

    const key = conflictKey(proposal);
    if (openKeys.has(key) || seenConflictKeys.has(key)) continue;
    seenConflictKeys.add(key);

    queued.push({
      importRunId: importRunId ?? null,
      sourceRecordId: proposal.sourceRecordId,
      entityType: proposal.entityType,
      entityId: proposal.entityId,
      kind: proposal.classification,
      matchScore: Math.max(0, Math.min(100, Math.round(proposal.match.score))),
      currentJson: proposal.current as Record<string, unknown> | null,
      proposedJson: {
        ...(proposal.proposed as Record<string, unknown>),
        // The candidates are the point of the queue: a moderator resolving an
        // ambiguous match needs the real alternatives, not just a score.
        matchCandidates: proposal.match.candidates,
        matchMethod: proposal.match.method,
      },
      notes: decision.reason,
    });
  }

  if (!dryRun && queued.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < queued.length; i += CHUNK) {
      await db.insert(curationConflicts).values(queued.slice(i, i + CHUNK));
    }
  }
  for (const row of queued) bump(row.entityType, 'queued');

  return report;
}

/**
 * Write the alias rows a pass earned (§4.5).
 *
 * `institution_aliases.match_key` is UNIQUE, and a key already claimed by
 * another institution is left alone: two institutions competing for one string
 * is a human decision, not a race the last writer wins.
 */
export async function writeAliases(
  db: Db,
  candidates: readonly AliasCandidate[],
  source: SourceName,
): Promise<number> {
  if (candidates.length === 0) return 0;

  const rows = candidates.map((candidate) => ({
    institutionId: candidate.institutionId,
    rawName: candidate.rawName.slice(0, 320),
    matchKey: candidate.matchKey.slice(0, 320),
    source,
  }));

  // Touching nothing on a duplicate is the point — `values(match_key)` is a
  // no-op update that lets the statement succeed without changing the row.
  await db
    .insert(institutionAliases)
    .values(rows)
    .onDuplicateKeyUpdate({ set: { matchKey: sql`values(match_key)` } });

  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

export interface CurationPassSummary {
  source: SourceName;
  importRunId: number;
  rowsIn: number;
  stats: MatchStats;
  autoMatchRate: number;
  report: ApplyReport;
  aliasesWritten: number;
}

export interface CurateOptions {
  db: Db;
  /** Defaults to the two sources PR-05 populates, CONES first. */
  sources?: readonly SourceName[];
  dryRun?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * One curation pass per source, in order, reloading the snapshot between them.
 *
 * CONES runs first on purpose: it is the source that establishes institutions
 * and programs, so ANEAES has something to attach an accreditation to in the
 * same command rather than a cycle later.
 */
export async function curate(options: CurateOptions): Promise<CurationPassSummary[]> {
  const { db, sources = ['CONES', 'ANEAES'] as const, dryRun = false } = options;
  const log = options.onProgress ?? (() => {});
  const summaries: CurationPassSummary[] = [];

  for (const source of sources) {
    log(`\n${source}: reading source_records…`);
    const [snapshot, records] = await Promise.all([
      loadSnapshot(db),
      loadSourceRecords(db, source),
    ]);
    log(`  ${records.length} raw records, ${snapshot.institutions.length} institutions known`);

    if (records.length === 0) {
      summaries.push({
        source,
        importRunId: 0,
        rowsIn: 0,
        stats: {
          institutionsMatched: 0,
          institutionsUnmatched: 0,
          certain: 0,
          fuzzy: 0,
          ambiguous: 0,
          deferred: 0,
        },
        autoMatchRate: 0,
        report: { applied: 0, queued: 0, unchanged: 0, byEntity: {} },
        aliasesWritten: 0,
      });
      continue;
    }

    const { proposals, aliasCandidates, stats } = buildProposals(snapshot, records);
    log(`  ${proposals.length} proposals, ${autoMatchRate(stats)}% of rows matched an institution`);

    let importRunId = 0;
    if (!dryRun) {
      const [result] = await db.insert(importRuns).values({ source, status: 'running' });
      importRunId = Number(result.insertId);
    }

    const report = await applyProposals(db, proposals, { importRunId, dryRun });
    const aliasesWritten = dryRun ? 0 : await writeAliases(db, aliasCandidates, source);

    if (!dryRun) {
      await db
        .update(importRuns)
        .set({
          status: 'succeeded',
          finishedAt: new Date(),
          rowsIn: records.length,
          rowsMatched: stats.institutionsMatched,
          rowsNew: report.applied,
          rowsUnchanged: report.unchanged,
          rowsConflicted: report.queued,
          log: `curate: ${report.applied} applied, ${report.queued} queued, ${stats.deferred} deferred`,
        })
        .where(eq(importRuns.id, importRunId));
    }

    summaries.push({
      source,
      importRunId,
      rowsIn: records.length,
      stats,
      autoMatchRate: autoMatchRate(stats),
      report,
      aliasesWritten,
    });
  }

  return summaries;
}
