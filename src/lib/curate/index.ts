/**
 * The curation layer's public surface (PR-06).
 *
 * Everything exported here is pure: matching, classification and the
 * apply *rules*. The apply *writes* live in `src/db/queries/curation.ts`,
 * because rule 5 keeps SQL out of `src/lib`.
 */

export {
  ABBREVIATIONS,
  acronymCandidate,
  buildCareerMatchKey,
  buildMatchKey,
  CAREER_STOPWORDS,
  INSTITUTION_STOPWORDS,
  normalizeName,
  slugify,
  uniqueSlug,
} from './match-key';
export { levenshtein, levenshteinRatio, similarityScore, trigramSimilarity } from './similarity';
export {
  buildCareerIndex,
  buildInstitutionIndex,
  buildProgramIndex,
  isAmbiguous,
  isCertainMatch,
  matchCareer,
  matchInstitution,
  matchProgram,
  type AliasRow,
  type CareerRow,
  type InstitutionIndex,
  type InstitutionRow,
  type ProgramRow,
} from './match';
export {
  changedFields,
  classify,
  isProtectedField,
  protectedFieldsFor,
  CURATION_ONLY_FIELDS,
} from './classify';
export {
  accreditationBlocker,
  applicableUpdate,
  decideApply,
  isAutoApplicable,
  missingCreateFields,
  REQUIRED_CREATE_FIELDS,
} from './apply-rules';
export {
  mapAccreditationStatus,
  mapLevel,
  mapModality,
  parseSourceDate,
  stageAneaesRecord,
  stageConesRecord,
  type StagedAccreditation,
  type StagedAneaesRecord,
  type StagedConesRecord,
} from './staging';
export {
  autoMatchRate,
  buildProposals,
  emptySnapshot,
  type AliasCandidate,
  type CurationSnapshot,
  type MatchStats,
  type ProposalBatch,
  type SourceRecordRow,
} from './pipeline';
