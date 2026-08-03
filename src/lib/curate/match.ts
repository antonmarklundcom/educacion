/**
 * Entity matching — `docs/data-sources.md` §4, `risks.md` §R-05.
 *
 * The resolution order is the doc's, and it is an order of *trust*, not of
 * convenience:
 *
 *   1. `cones_code`  — the only stable key either register publishes
 *   2. `institution_aliases` — a human already decided this exact string once
 *   3. `institutions.match_key`
 *   4. `institutions.acronym`
 *   5. fuzzy ≥ `FUZZY_PROPOSE_THRESHOLD` → **propose**, never apply
 *   6. nothing → a create proposal
 *
 * Two properties of this module matter more than its hit rate:
 *
 * - **It is pure.** It reads an index built from a snapshot and returns a
 *   `MatchResult`. It performs no writes and knows nothing about a database,
 *   which is what makes the thresholds testable without one.
 * - **Ambiguity is never resolved by picking.** A key that maps to two
 *   institutions returns `entityId: null` with both candidates attached.
 *   Choosing the lower id would produce a plausible-looking, wrong merge —
 *   the exact failure R-05 is about.
 */

import { FUZZY_PROPOSE_THRESHOLD, type MatchResult } from '@/lib/ingest/contract';

import { acronymCandidate, buildCareerMatchKey, buildMatchKey, normalizeName } from './match-key';
import { similarityScore } from './similarity';

/** Candidates below this are not worth a moderator's attention. */
export const CANDIDATE_FLOOR = 60;
/** How many runners-up the moderation queue gets to show. */
export const MAX_CANDIDATES = 3;

const NO_MATCH: MatchResult = { entityId: null, method: 'none', score: 0, candidates: [] };

/* -------------------------------------------------------------------------- */
/* Institutions                                                               */
/* -------------------------------------------------------------------------- */

export interface InstitutionRow {
  id: number;
  nameOfficial: string;
  nameShort: string;
  acronym: string | null;
  matchKey: string;
  conesCode: string | null;
}

export interface AliasRow {
  institutionId: number;
  matchKey: string;
}

export interface InstitutionIndex {
  byConesCode: Map<string, number[]>;
  byAlias: Map<string, number>;
  byMatchKey: Map<string, number[]>;
  byAcronym: Map<string, number[]>;
  labels: Map<number, string>;
  entries: Array<{ id: number; matchKey: string }>;
}

function push(map: Map<string, number[]>, key: string, id: number): void {
  if (!key) return;
  const bucket = map.get(key);
  if (bucket) {
    if (!bucket.includes(id)) bucket.push(id);
  } else {
    map.set(key, [id]);
  }
}

export function buildInstitutionIndex(
  rows: readonly InstitutionRow[],
  aliases: readonly AliasRow[] = [],
): InstitutionIndex {
  const index: InstitutionIndex = {
    byConesCode: new Map(),
    byAlias: new Map(),
    byMatchKey: new Map(),
    byAcronym: new Map(),
    labels: new Map(),
    entries: [],
  };

  for (const row of rows) {
    index.labels.set(row.id, row.nameOfficial);
    // The stored key is authoritative, but a row written before a stopword
    // changed would otherwise stop matching its own name.
    const key = row.matchKey || buildMatchKey(row.nameOfficial);
    push(index.byMatchKey, key, row.id);
    push(index.byMatchKey, buildMatchKey(row.nameOfficial), row.id);
    if (row.conesCode) push(index.byConesCode, normalizeName(row.conesCode), row.id);
    if (row.acronym) push(index.byAcronym, normalizeName(row.acronym), row.id);
    const derived = acronymCandidate(row.nameShort);
    if (derived) push(index.byAcronym, derived, row.id);
    index.entries.push({ id: row.id, matchKey: key });
  }

  // Aliases last and unconditionally: `institution_aliases.match_key` is
  // UNIQUE, so one string can only ever point at one institution, and a human
  // put it there. It outranks anything derived.
  for (const alias of aliases) {
    if (!alias.matchKey) continue;
    index.byAlias.set(alias.matchKey, alias.institutionId);
  }

  return index;
}

function labelled(
  index: { labels: Map<number, string> },
  ids: readonly number[],
  score: number,
): MatchResult['candidates'] {
  return ids
    .slice(0, MAX_CANDIDATES)
    .map((id) => ({ entityId: id, label: index.labels.get(id) ?? `#${id}`, score }));
}

/** Best fuzzy candidates over an index's entries, highest first. */
function fuzzyCandidates(
  index: { labels: Map<number, string>; entries: Array<{ id: number; matchKey: string }> },
  key: string,
): MatchResult['candidates'] {
  return index.entries
    .map((entry) => ({
      entityId: entry.id,
      label: index.labels.get(entry.id) ?? `#${entry.id}`,
      score: similarityScore(key, entry.matchKey),
    }))
    .filter((candidate) => candidate.score >= CANDIDATE_FLOOR)
    .sort((a, b) => b.score - a.score || a.entityId - b.entityId)
    .slice(0, MAX_CANDIDATES);
}

function resolve(
  index: { labels: Map<number, string>; entries: Array<{ id: number; matchKey: string }> },
  ids: number[] | undefined,
  method: MatchResult['method'],
): MatchResult | null {
  if (!ids || ids.length === 0) return null;
  if (ids.length === 1) {
    return { entityId: ids[0], method, score: 100, candidates: labelled(index, ids, 100) };
  }
  // Two institutions share this key. Report both and let a human decide.
  return { entityId: null, method, score: 100, candidates: labelled(index, ids, 100) };
}

export interface InstitutionQuery {
  rawName: string;
  conesCode?: string | null;
}

export function matchInstitution(index: InstitutionIndex, query: InstitutionQuery): MatchResult {
  const key = buildMatchKey(query.rawName);

  if (query.conesCode) {
    const byCode = resolve(
      index,
      index.byConesCode.get(normalizeName(query.conesCode)),
      'cones_code',
    );
    if (byCode) return byCode;
  }

  const aliasId = index.byAlias.get(key);
  if (aliasId != null) {
    return {
      entityId: aliasId,
      method: 'alias',
      score: 100,
      candidates: labelled(index, [aliasId], 100),
    };
  }

  const byKey = resolve(index, index.byMatchKey.get(key), 'match_key');
  if (byKey) return byKey;

  const acronym = acronymCandidate(query.rawName);
  if (acronym) {
    const byAcronym = resolve(index, index.byAcronym.get(acronym), 'acronym');
    if (byAcronym) return byAcronym;
  }

  const candidates = fuzzyCandidates(index, key);
  const best = candidates[0];
  if (best && best.score >= FUZZY_PROPOSE_THRESHOLD) {
    // Proposed, not applied: `FUZZY_AUTO_APPLY` is false and the classifier
    // turns every fuzzy result into `ambiguous_match`.
    return { entityId: best.entityId, method: 'fuzzy', score: best.score, candidates };
  }

  return { ...NO_MATCH, score: best?.score ?? 0, candidates };
}

/* -------------------------------------------------------------------------- */
/* Careers — the synonym store is `careers.synonyms_json` (§4, last line)     */
/* -------------------------------------------------------------------------- */

export interface CareerRow {
  id: number;
  slug: string;
  nameEs: string;
  synonymsJson: string[] | null;
}

export interface CareerIndex {
  byName: Map<string, number[]>;
  bySynonym: Map<string, number[]>;
  labels: Map<number, string>;
  entries: Array<{ id: number; matchKey: string }>;
}

export function buildCareerIndex(rows: readonly CareerRow[]): CareerIndex {
  const index: CareerIndex = {
    byName: new Map(),
    bySynonym: new Map(),
    labels: new Map(),
    entries: [],
  };

  for (const row of rows) {
    const key = buildCareerMatchKey(row.nameEs);
    index.labels.set(row.id, row.nameEs);
    push(index.byName, key, row.id);
    push(index.byName, buildCareerMatchKey(row.slug), row.id);
    for (const synonym of row.synonymsJson ?? []) {
      push(index.bySynonym, buildCareerMatchKey(synonym), row.id);
    }
    index.entries.push({ id: row.id, matchKey: key });
  }

  return index;
}

/**
 * Match a program name onto our career taxonomy.
 *
 * A synonym hit counts as `alias`, the same trust level as an institution
 * alias: someone wrote "Medicina y Cirugía → medicina" by hand and it should
 * not have to be decided again.
 */
export function matchCareer(index: CareerIndex, programName: string): MatchResult {
  const key = buildCareerMatchKey(programName);
  if (!key) return NO_MATCH;

  const bySynonym = resolve(index, index.bySynonym.get(key), 'alias');
  if (bySynonym) return bySynonym;

  const byName = resolve(index, index.byName.get(key), 'match_key');
  if (byName) return byName;

  const candidates = fuzzyCandidates(index, key);
  const best = candidates[0];
  if (best && best.score >= FUZZY_PROPOSE_THRESHOLD) {
    return { entityId: best.entityId, method: 'fuzzy', score: best.score, candidates };
  }
  return { ...NO_MATCH, score: best?.score ?? 0, candidates };
}

/* -------------------------------------------------------------------------- */
/* Programs — matched within one institution, never across                    */
/* -------------------------------------------------------------------------- */

export interface ProgramRow {
  id: number;
  institutionId: number;
  nameOfficial: string;
  matchKey: string;
}

export interface ProgramIndex {
  byInstitution: Map<
    number,
    {
      byKey: Map<string, number[]>;
      labels: Map<number, string>;
      entries: Array<{ id: number; matchKey: string }>;
    }
  >;
}

export function buildProgramIndex(rows: readonly ProgramRow[]): ProgramIndex {
  const index: ProgramIndex = { byInstitution: new Map() };

  for (const row of rows) {
    let bucket = index.byInstitution.get(row.institutionId);
    if (!bucket) {
      bucket = { byKey: new Map(), labels: new Map(), entries: [] };
      index.byInstitution.set(row.institutionId, bucket);
    }
    const key = row.matchKey || buildCareerMatchKey(row.nameOfficial);
    bucket.labels.set(row.id, row.nameOfficial);
    push(bucket.byKey, key, row.id);
    push(bucket.byKey, buildCareerMatchKey(row.nameOfficial), row.id);
    bucket.entries.push({ id: row.id, matchKey: key });
  }

  return index;
}

/**
 * Two institutions can each run a "Carrera de Medicina" and they are different
 * programs, so a program is only ever matched inside its institution — which
 * is also why an unresolved institution makes the program unresolvable.
 */
export function matchProgram(
  index: ProgramIndex,
  institutionId: number,
  programName: string,
): MatchResult {
  const bucket = index.byInstitution.get(institutionId);
  if (!bucket) return NO_MATCH;

  const key = buildCareerMatchKey(programName);
  const exact = resolve(bucket, bucket.byKey.get(key), 'match_key');
  if (exact) return exact;

  const candidates = fuzzyCandidates(bucket, key);
  const best = candidates[0];
  if (best && best.score >= FUZZY_PROPOSE_THRESHOLD) {
    return { entityId: best.entityId, method: 'fuzzy', score: best.score, candidates };
  }
  return { ...NO_MATCH, score: best?.score ?? 0, candidates };
}

/** True when a result may be treated as a certain identification. */
export function isCertainMatch(match: MatchResult): boolean {
  return match.entityId != null && match.method !== 'fuzzy' && match.method !== 'none';
}

/** True when the result identifies nothing but is not merely "no match". */
export function isAmbiguous(match: MatchResult): boolean {
  return match.method === 'fuzzy' || (match.entityId == null && match.candidates.length > 1);
}
