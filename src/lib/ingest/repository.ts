/**
 * The only module in PR-05 that writes.
 *
 * It writes to exactly two tables — `import_runs` and `source_records` — and
 * that restriction is the PR's central invariant (`contract.ts` header,
 * `data-sources.md` §3). Matching and any write to a curated table is PR-06.
 *
 * Idempotency comes from `UNIQUE (source, checksum)` on `source_records`, not
 * from anything this module decides: every insert is `INSERT ... ON DUPLICATE
 * KEY UPDATE`, so a re-run over an unchanged source cannot create a second row
 * even if our own bookkeeping is wrong. The *counts* in the run summary are
 * derived separately, by asking which checksums already exist — see the note
 * in `writeRawRecords` for why that is a pre-check rather than arithmetic over
 * `affectedRows`.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '@/db';
import { importRuns, sourceRecords } from '@/db/schema';
import type { ImportRunSummary, RawRecord, SourceName } from './contract';

/** Chunk size for the batch insert. Keeps us well under max_allowed_packet. */
const INSERT_CHUNK = 200;

export interface WriteResult {
  rowsIn: number;
  rowsNew: number;
  rowsUnchanged: number;
}

export async function startImportRun(db: Db, source: SourceName): Promise<number> {
  const [result] = await db.insert(importRuns).values({ source, status: 'running' });
  return Number(result.insertId);
}

export async function finishImportRun(
  db: Db,
  importRunId: number,
  outcome: {
    status: 'succeeded' | 'failed';
    rowsIn: number;
    rowsNew: number;
    rowsUnchanged: number;
    log?: string;
  },
): Promise<void> {
  await db
    .update(importRuns)
    .set({
      status: outcome.status,
      finishedAt: new Date(),
      rowsIn: outcome.rowsIn,
      rowsNew: outcome.rowsNew,
      rowsUnchanged: outcome.rowsUnchanged,
      log: outcome.log ?? null,
    })
    .where(sql`${importRuns.id} = ${importRunId}`);
}

/**
 * Persist raw records. Returns what actually happened in the database.
 *
 * On a duplicate we touch `import_run_id` only — never `payload_json`,
 * `checksum` or `fetched_at`. Raw provenance is append-only (`data-model.md`:
 * "never edited, never deleted"); rewriting the payload of an existing row
 * would destroy the evidence a moderator needs to resolve a conflict. Updating
 * the run id is the one useful exception: it records that this run saw the row.
 */
export async function writeRawRecords<TPayload>(
  db: Db,
  records: readonly RawRecord<TPayload>[],
  importRunId: number,
  source: SourceName,
): Promise<WriteResult> {
  const foreign = records.find((record) => record.source !== source);
  if (foreign) {
    // One run is one source; mixing them would make the run summary and the
    // existence check below both wrong.
    throw new Error(`Record from source ${foreign.source} passed to a ${source} import run.`);
  }

  // Two parsers can yield the same checksum within one run (paginated views of
  // the same list). Collapsing here keeps ON DUPLICATE KEY from reporting a
  // row as both new and unchanged in a single statement.
  const unique = new Map<string, RawRecord<TPayload>>();
  for (const record of records) {
    unique.set(`${record.source}:${record.checksum}`, record);
  }
  const deduplicated = [...unique.values()];

  let rowsNew = 0;

  for (let offset = 0; offset < deduplicated.length; offset += INSERT_CHUNK) {
    const chunk = deduplicated.slice(offset, offset + INSERT_CHUNK);

    // Count what is genuinely new *before* inserting. The alternative —
    // deriving it from affectedRows, which MySQL reports as 1 per insert and 2
    // per changed duplicate — is arithmetic that silently goes wrong the day
    // someone adds a second column to the ON DUPLICATE KEY UPDATE set. This
    // number appears in the PR-05 acceptance criterion ("re-running produces
    // zero duplicates"), so it should be something we can read directly.
    //
    // Check-then-insert is a race in principle. It is not one in practice: the
    // importer is a single monthly operator-run script. And if two ever did
    // race, UNIQUE (source, checksum) still prevents a duplicate row — only
    // this count would overstate, never the data.
    const existing = await db
      .select({ checksum: sourceRecords.checksum })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.source, source),
          inArray(
            sourceRecords.checksum,
            chunk.map((record) => record.checksum),
          ),
        ),
      );
    const known = new Set(existing.map((row) => row.checksum));
    rowsNew += chunk.filter((record) => !known.has(record.checksum)).length;

    await db
      .insert(sourceRecords)
      .values(
        chunk.map((record) => ({
          source: record.source,
          externalId: record.externalId,
          sourceUrl: record.sourceUrl,
          payloadJson: record.payload,
          checksum: record.checksum,
          importRunId,
        })),
      )
      .onDuplicateKeyUpdate({ set: { importRunId } });
  }

  return {
    rowsIn: deduplicated.length,
    rowsNew,
    rowsUnchanged: deduplicated.length - rowsNew,
  };
}

/**
 * Run one source end to end: open a run, write what the fetch+parse produced,
 * close the run. A thrown error still closes the run as `failed` with the
 * message in `log`, so a broken import is visible in the table rather than
 * leaving a row stuck in `running` forever.
 */
export async function runImport<TPayload>(
  db: Db,
  source: SourceName,
  produce: () => Promise<readonly RawRecord<TPayload>[]>,
  options: { dryRun?: boolean; onProgress?: (message: string) => void } = {},
): Promise<ImportRunSummary> {
  const { dryRun = false, onProgress } = options;
  const startedAt = new Date();

  if (dryRun) {
    const records = await produce();
    onProgress?.(`Dry run: parsed ${records.length} records, wrote nothing.`);
    return {
      importRunId: 0,
      source,
      rowsIn: records.length,
      rowsNew: 0,
      rowsUnchanged: 0,
      startedAt,
      finishedAt: new Date(),
    };
  }

  const importRunId = await startImportRun(db, source);

  try {
    const records = await produce();
    const written = await writeRawRecords(db, records, importRunId, source);
    await finishImportRun(db, importRunId, { status: 'succeeded', ...written });

    return {
      importRunId,
      source,
      ...written,
      startedAt,
      finishedAt: new Date(),
    };
  } catch (error) {
    await finishImportRun(db, importRunId, {
      status: 'failed',
      rowsIn: 0,
      rowsNew: 0,
      rowsUnchanged: 0,
      log: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    throw error;
  }
}
