/**
 * The ingestion layer's public surface.
 *
 * PR-06 and the admin moderation queue import from here, not from the modules
 * directly, so the raw-layer boundary stays legible: everything exported here
 * either produces `RawRecord`s or writes to `source_records` / `import_runs`.
 * Nothing here touches a curated table.
 */

export * from './contract';
export { canonicalize, canonicalJson, checksumOf, collapseWhitespace } from './checksum';
export {
  FetchError,
  politeFetchText,
  USER_AGENT,
  type FetchOptions,
  __resetRateLimiter,
} from './http';
export { parseCsv, parseCsvRecords } from './csv';
export {
  conesPaginationLinks,
  parseConesInstitutions,
  parseConesPrograms,
  parseConesRegister,
  type ConesPayload,
} from './parsers/cones';
export { parseAneaesCsv, parseAneaesHtml, type AneaesPayload } from './parsers/aneaes';
export {
  ANEAES_URLS,
  CONES_URLS,
  collectAneaes,
  collectCones,
  type ConesInput,
  type SourceInput,
} from './sources';
export {
  finishImportRun,
  runImport,
  startImportRun,
  writeRawRecords,
  type WriteResult,
} from './repository';
