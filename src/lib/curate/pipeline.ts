/**
 * Steps 3–4 of `docs/data-sources.md` §3, as one pure function.
 *
 * `buildProposals(snapshot, records)` takes the curated tables as they are now
 * plus a batch of `source_records`, and returns `CurationProposal`s. It reads
 * no database and writes nothing, which is what lets the whole matching and
 * classification behaviour be tested without MySQL — the apply step in
 * `src/db/queries/curation.ts` is then a thin, boring writer.
 *
 * ### Why proposals resolve against a snapshot, not against each other
 *
 * A CONES row implies a chain: institution → program → campus → offering. It
 * is tempting to thread the ids of things created earlier in the same run
 * through to the rows that depend on them. We deliberately do not:
 *
 * - a **new institution never auto-applies** anyway (`apply-rules.ts`: we
 *   cannot source `management`), so the chain is broken by a human decision
 *   regardless;
 * - and threading ids means a bug in the first row silently mis-parents every
 *   row after it, which is the corruption R-05 is about.
 *
 * So a row whose parent does not exist yet is *deferred*: reported, not
 * queued, not applied. `npm run curate` runs the sources in order and reloads
 * the snapshot between them, so a program created from CONES is available to
 * the ANEAES pass in the same command, and anything behind a human decision
 * lands on the next cycle. The alias table makes that cheap — §4.5.
 */

import type {
  ConflictEntity,
  CurationProposal,
  MatchResult,
  SourceName,
} from '@/lib/ingest/contract';
import type { AneaesPayload } from '@/lib/ingest/parsers/aneaes';
import type { ConesPayload } from '@/lib/ingest/parsers/cones';

import { classify } from './classify';
import {
  buildCareerIndex,
  buildInstitutionIndex,
  buildProgramIndex,
  isCertainMatch,
  matchCareer,
  matchInstitution,
  matchProgram,
  type AliasRow,
  type CareerRow,
  type InstitutionRow,
  type ProgramRow,
} from './match';
import { normalizeName, slugify, uniqueSlug } from './match-key';
import {
  stageAneaesRecord,
  stageConesRecord,
  type Modality,
  type StagedAccreditation,
} from './staging';

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export interface SnapshotCampus {
  id: number;
  institutionId: number;
  name: string;
  slug: string;
  cityId: number;
}

export interface SnapshotOffering {
  id: number;
  programId: number;
  campusId: number;
  modality: string;
  shift: string;
}

export interface SnapshotAccreditation {
  id: number;
  scope: string;
  institutionId: number | null;
  programId: number | null;
  offeringId: number | null;
  agency: string;
  kind: string;
  status: string;
  model: string | null;
  resolutionNumber: string | null;
  sourceUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface SnapshotCity {
  id: number;
  slug: string;
  nameEs: string;
}

export interface SnapshotProgram extends ProgramRow {
  slug: string;
  level: string;
  careerId: number | null;
  conesResolution: string | null;
}

/** Everything the matcher needs to know about the curated tables. */
export interface CurationSnapshot {
  institutions: InstitutionRow[];
  aliases: AliasRow[];
  careers: CareerRow[];
  programs: SnapshotProgram[];
  campuses: SnapshotCampus[];
  offerings: SnapshotOffering[];
  accreditations: SnapshotAccreditation[];
  cities: SnapshotCity[];
}

export function emptySnapshot(): CurationSnapshot {
  return {
    institutions: [],
    aliases: [],
    careers: [],
    programs: [],
    campuses: [],
    offerings: [],
    accreditations: [],
    cities: [],
  };
}

/** One `source_records` row, as the curation step reads it. */
export interface SourceRecordRow {
  id: number;
  source: SourceName;
  sourceUrl: string | null;
  payload: unknown;
}

export interface MatchStats {
  /** Rows whose institution resolved to exactly one existing row. */
  institutionsMatched: number;
  institutionsUnmatched: number;
  /** Rows whose institution resolved by a method that is not fuzzy. */
  certain: number;
  fuzzy: number;
  ambiguous: number;
  /** Rows we could not act on because a parent does not exist yet. */
  deferred: number;
}

/**
 * A string that identified an institution with certainty — a candidate row for
 * `institution_aliases`, §4.5's "compounding asset". Fuzzy identifications are
 * never candidates: an alias is a statement of fact, and a guess must not
 * become one without a human.
 */
export interface AliasCandidate {
  institutionId: number;
  rawName: string;
  matchKey: string;
}

export interface ProposalBatch {
  proposals: CurationProposal[];
  aliasCandidates: AliasCandidate[];
  stats: MatchStats;
}

/**
 * The share of rows whose institution was identified with certainty — the
 * "auto-match rate" of `pr-plan.md` PR-06. Reported per run against real data;
 * it is meaningless against fixtures (see `docs/data-sources.md` §4.7).
 */
export function autoMatchRate(stats: MatchStats): number {
  const total = stats.institutionsMatched + stats.institutionsUnmatched;
  return total === 0 ? 0 : Math.round((100 * stats.institutionsMatched) / total);
}

/* -------------------------------------------------------------------------- */
/* Building proposals                                                         */
/* -------------------------------------------------------------------------- */

interface Context {
  snapshot: CurationSnapshot;
  institutionIndex: ReturnType<typeof buildInstitutionIndex>;
  careerIndex: ReturnType<typeof buildCareerIndex>;
  programIndex: ReturnType<typeof buildProgramIndex>;
  cityByKey: Map<string, number>;
  institutionSlugs: Set<string>;
  programSlugsByInstitution: Map<number, Set<string>>;
  campusSlugsByInstitution: Map<number, Set<string>>;
  programByKey: Map<string, SnapshotProgram>;
  campusByKey: Map<string, SnapshotCampus>;
  offeringByKey: Map<string, SnapshotOffering>;
  accreditationByProgram: Map<string, SnapshotAccreditation>;
  aliasCandidates: Map<string, AliasCandidate>;
  knownAliasKeys: Set<string>;
  stats: MatchStats;
}

function buildContext(snapshot: CurationSnapshot): Context {
  const cityByKey = new Map<string, number>();
  for (const city of snapshot.cities) {
    cityByKey.set(normalizeName(city.nameEs), city.id);
    cityByKey.set(normalizeName(city.slug), city.id);
  }

  const programSlugsByInstitution = new Map<number, Set<string>>();
  const programByKey = new Map<string, SnapshotProgram>();
  for (const program of snapshot.programs) {
    const slugs = programSlugsByInstitution.get(program.institutionId) ?? new Set<string>();
    slugs.add(program.slug);
    programSlugsByInstitution.set(program.institutionId, slugs);
    programByKey.set(`${program.institutionId}:${program.matchKey}`, program);
  }

  const campusSlugsByInstitution = new Map<number, Set<string>>();
  const campusByKey = new Map<string, SnapshotCampus>();
  for (const campus of snapshot.campuses) {
    const slugs = campusSlugsByInstitution.get(campus.institutionId) ?? new Set<string>();
    slugs.add(campus.slug);
    campusSlugsByInstitution.set(campus.institutionId, slugs);
    campusByKey.set(`${campus.institutionId}:${campus.cityId}`, campus);
  }

  const offeringByKey = new Map<string, SnapshotOffering>();
  for (const offering of snapshot.offerings) {
    offeringByKey.set(
      `${offering.programId}:${offering.campusId}:${offering.modality}:${offering.shift}`,
      offering,
    );
  }

  const accreditationByProgram = new Map<string, SnapshotAccreditation>();
  for (const row of snapshot.accreditations) {
    if (row.scope !== 'program' || row.programId == null) continue;
    accreditationByProgram.set(`${row.programId}:${row.agency}`, row);
  }

  return {
    snapshot,
    institutionIndex: buildInstitutionIndex(snapshot.institutions, snapshot.aliases),
    careerIndex: buildCareerIndex(snapshot.careers),
    programIndex: buildProgramIndex(snapshot.programs),
    cityByKey,
    institutionSlugs: new Set(snapshot.institutions.map((row) => slugify(row.nameOfficial))),
    programSlugsByInstitution,
    campusSlugsByInstitution,
    programByKey,
    campusByKey,
    offeringByKey,
    accreditationByProgram,
    aliasCandidates: new Map(),
    knownAliasKeys: new Set(snapshot.aliases.map((alias) => alias.matchKey)),
    stats: {
      institutionsMatched: 0,
      institutionsUnmatched: 0,
      certain: 0,
      fuzzy: 0,
      ambiguous: 0,
      deferred: 0,
    },
  };
}

function proposal(
  entityType: ConflictEntity,
  entityId: number | null,
  match: MatchResult,
  current: Record<string, unknown> | null,
  proposed: Record<string, unknown>,
  sourceRecordId: number,
): CurationProposal {
  return {
    entityType,
    entityId,
    classification: classify({ entityType, current, proposed, match }),
    match,
    current,
    proposed,
    sourceRecordId,
  };
}

function countMatch(context: Context, match: MatchResult): void {
  if (isCertainMatch(match)) {
    context.stats.institutionsMatched += 1;
    context.stats.certain += 1;
    return;
  }
  context.stats.institutionsUnmatched += 1;
  if (match.method === 'fuzzy') context.stats.fuzzy += 1;
  else if (match.candidates.length > 1) context.stats.ambiguous += 1;
}

/* ------------------------------ institutions ------------------------------ */

function institutionProposal(
  context: Context,
  record: SourceRecordRow,
  staged: { rawName: string; matchKey: string; conesCode: string | null },
  match: MatchResult,
): CurationProposal {
  const existing =
    match.entityId != null
      ? context.snapshot.institutions.find((row) => row.id === match.entityId)
      : undefined;

  if (!existing) {
    return proposal(
      'institution',
      null,
      match,
      null,
      {
        nameOfficial: staged.rawName,
        nameShort: staged.rawName,
        matchKey: staged.matchKey,
        slug: uniqueSlug(staged.rawName, context.institutionSlugs),
        conesCode: staged.conesCode,
        // Neither register prints gestión or institution type. Leaving them
        // null is what makes this proposal queue rather than auto-create —
        // see REQUIRED_CREATE_FIELDS.
        management: null,
        type: null,
      },
      record.id,
    );
  }

  // A string that resolved to this institution by any means other than the
  // alias table is worth remembering — that is how the second cycle gets
  // cheap (§4.5).
  if (
    isCertainMatch(match) &&
    match.method !== 'alias' &&
    staged.matchKey &&
    !context.knownAliasKeys.has(staged.matchKey) &&
    !context.aliasCandidates.has(staged.matchKey)
  ) {
    context.aliasCandidates.set(staged.matchKey, {
      institutionId: existing.id,
      rawName: staged.rawName,
      matchKey: staged.matchKey,
    });
  }

  // The name is only proposed as an update when the match came from the one
  // trustworthy key. Matching *by name* and then proposing the name as a
  // change would overwrite the canonical name with whichever alias this row
  // happened to print.
  const proposed: Record<string, unknown> = { conesCode: staged.conesCode ?? undefined };
  if (match.method === 'cones_code') proposed.nameOfficial = staged.rawName;

  return proposal(
    'institution',
    existing.id,
    match,
    { nameOfficial: existing.nameOfficial, conesCode: existing.conesCode },
    proposed,
    record.id,
  );
}

/* --------------------------------- CONES ---------------------------------- */

function conesProposals(context: Context, record: SourceRecordRow): CurationProposal[] {
  const staged = stageConesRecord(record.payload as ConesPayload);
  const out: CurationProposal[] = [];

  const institutionMatch = matchInstitution(context.institutionIndex, {
    rawName: staged.institution.rawName,
    conesCode: staged.institution.conesCode,
  });
  countMatch(context, institutionMatch);
  out.push(institutionProposal(context, record, staged.institution, institutionMatch));

  const institutionId = isCertainMatch(institutionMatch) ? institutionMatch.entityId! : null;
  if (!staged.program) return out;
  if (institutionId == null) {
    // The program cannot be identified without its institution, and proposing
    // a create under an unknown parent is how duplicates get made.
    context.stats.deferred += 1;
    return out;
  }

  const programMatch = matchProgram(context.programIndex, institutionId, staged.program.rawName);
  const existingProgram =
    programMatch.entityId != null
      ? context.snapshot.programs.find((row) => row.id === programMatch.entityId)
      : undefined;

  const careerMatch = matchCareer(context.careerIndex, staged.program.rawName);
  const careerId = isCertainMatch(careerMatch) ? careerMatch.entityId : null;

  if (!existingProgram) {
    const slugs = context.programSlugsByInstitution.get(institutionId) ?? new Set<string>();
    out.push(
      proposal(
        'program',
        null,
        programMatch,
        null,
        {
          institutionId,
          nameOfficial: staged.program.rawName,
          matchKey: staged.program.matchKey,
          slug: uniqueSlug(staged.program.rawName, slugs),
          // Null when the register's wording is not one we map. The row then
          // queues instead of being created at a guessed level.
          level: staged.program.level,
          careerId,
          conesResolution: staged.program.conesResolution,
        },
        record.id,
      ),
    );
    return out;
  }

  out.push(
    proposal(
      'program',
      existingProgram.id,
      programMatch,
      {
        level: existingProgram.level,
        careerId: existingProgram.careerId,
        conesResolution: existingProgram.conesResolution,
      },
      {
        // `level` is protected: a level change queues even here.
        level: staged.program.level ?? undefined,
        conesResolution: staged.program.conesResolution ?? undefined,
        // Never unset a career a human assigned.
        careerId: existingProgram.careerId == null ? (careerId ?? undefined) : undefined,
      },
      record.id,
    ),
  );

  out.push(
    ...placementProposals(context, record, institutionId, existingProgram.id, staged.placement),
  );
  return out;
}

/** Campus + offering, from the register's `sede`/`modalidad` columns. */
function placementProposals(
  context: Context,
  record: SourceRecordRow,
  institutionId: number,
  programId: number,
  placement: { locationRaw: string | null; modality: Modality | null },
): CurationProposal[] {
  if (!placement.locationRaw) return [];

  const cityId = context.cityByKey.get(normalizeName(placement.locationRaw));
  if (cityId == null) {
    // An unseeded locality. Creating a city from an import would put an
    // unverified place name into the URL space (`seo.md` §4), so this waits
    // for `npm run seed:taxonomy` or a human.
    context.stats.deferred += 1;
    return [];
  }

  const out: CurationProposal[] = [];
  const existingCampus = context.campusByKey.get(`${institutionId}:${cityId}`);
  const certain: MatchResult = { entityId: null, method: 'match_key', score: 100, candidates: [] };

  if (!existingCampus) {
    const slugs = context.campusSlugsByInstitution.get(institutionId) ?? new Set<string>();
    out.push(
      proposal(
        'campus',
        null,
        certain,
        null,
        {
          institutionId,
          name: placement.locationRaw,
          slug: uniqueSlug(placement.locationRaw, slugs),
          cityId,
        },
        record.id,
      ),
    );
    // The offering needs a campus id, which only exists after that create is
    // written. Next run.
    context.stats.deferred += 1;
    return out;
  }

  if (!placement.modality) {
    // Modality is a facet on every card. Defaulting it to `presencial`
    // because most programs are presencial is exactly rule 1's fabrication.
    context.stats.deferred += 1;
    return out;
  }

  const key = `${programId}:${existingCampus.id}:${placement.modality}:flexible`;
  const existingOffering = context.offeringByKey.get(key);
  if (existingOffering) return out;

  out.push(
    proposal(
      'offering',
      null,
      certain,
      null,
      {
        programId,
        campusId: existingCampus.id,
        modality: placement.modality,
        // `shift` is NOT NULL with a 'flexible' default precisely so the
        // uniqueness index works (schema.ts). Neither register prints a turno.
        shift: 'flexible',
      },
      record.id,
    ),
  );
  return out;
}

/* --------------------------------- ANEAES --------------------------------- */

function aneaesProposals(context: Context, record: SourceRecordRow): CurationProposal[] {
  const payload = record.payload as AneaesPayload;
  const staged = stageAneaesRecord(payload, { sourceUrl: record.sourceUrl });
  const out: CurationProposal[] = [];

  const institutionMatch = matchInstitution(context.institutionIndex, {
    rawName: staged.institution.rawName,
    conesCode: null,
  });
  countMatch(context, institutionMatch);
  out.push(institutionProposal(context, record, staged.institution, institutionMatch));

  const institutionId = isCertainMatch(institutionMatch) ? institutionMatch.entityId! : null;
  if (!staged.program || institutionId == null) {
    context.stats.deferred += 1;
    return out;
  }

  const programMatch = matchProgram(context.programIndex, institutionId, staged.program.rawName);
  if (!isCertainMatch(programMatch)) {
    // An accreditation we cannot attach to a program is not an accreditation
    // we may write — but it is exactly what the moderation queue is for, so it
    // is queued with the candidates the matcher found rather than dropped.
    out.push(
      proposal(
        'accreditation',
        null,
        programMatch,
        null,
        accreditationFields(staged.accreditation, null),
        record.id,
      ),
    );
    return out;
  }

  const programId = programMatch.entityId!;

  if (!staged.accreditation.status) {
    // The source said nothing we recognize. Absence is `sin_datos` — which is
    // represented by writing no accreditation row at all, never by a negative.
    return out;
  }

  const existing = context.accreditationByProgram.get(`${programId}:ANEAES`);
  out.push(
    proposal(
      'accreditation',
      existing?.id ?? null,
      programMatch,
      existing
        ? {
            status: existing.status,
            model: existing.model,
            resolutionNumber: existing.resolutionNumber,
            sourceUrl: existing.sourceUrl,
            validFrom: existing.validFrom,
            validTo: existing.validTo,
          }
        : null,
      accreditationFields(staged.accreditation, programId),
      record.id,
    ),
  );

  return out;
}

function accreditationFields(
  staged: StagedAccreditation,
  programId: number | null,
): Record<string, unknown> {
  return {
    scope: 'program',
    programId,
    // ANEAES is the accrediting agency. A CONES row can never reach this
    // function — `stageConesRecord` has no accreditation field at all.
    agency: 'ANEAES',
    kind: staged.status === 'en_proceso' ? 'en_proceso' : 'acreditacion',
    status: staged.status,
    model: staged.model,
    resolutionNumber: staged.resolutionNumber,
    sourceUrl: staged.sourceUrl,
    validFrom: staged.validFrom,
    validTo: staged.validTo,
    citable: staged.citable,
  };
}

/* -------------------------------------------------------------------------- */

export function buildProposals(
  snapshot: CurationSnapshot,
  records: readonly SourceRecordRow[],
): ProposalBatch {
  const context = buildContext(snapshot);
  const proposals: CurationProposal[] = [];

  for (const record of records) {
    if (!record.payload || typeof record.payload !== 'object') continue;
    if (record.source === 'CONES') proposals.push(...conesProposals(context, record));
    else if (record.source === 'ANEAES' || record.source === 'DATOS_GOV_PY') {
      proposals.push(...aneaesProposals(context, record));
    }
  }

  return {
    proposals,
    aliasCandidates: [...context.aliasCandidates.values()],
    stats: context.stats,
  };
}
