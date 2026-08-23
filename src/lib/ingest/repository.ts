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

/** Thrown by `claimImportRun` when this source already has a run in flight. */
export class ImportAlreadyRunningError extends Error {
  constructor(readonly source: SourceName) {
    super(`Ya hay una importación de ${source} en curso.`);
    this.name = 'ImportAlreadyRunningError';
  }
}

/**
 * `startImportRun`, but only if this source has no run still `running` (PR-50).
 *
 * `import_runs` **is** the lock — there is no second table and no advisory
 * lock. Two operators clicking "importar" at the same second must not produce
 * two concurrent crawls of the same government site, which is both rude to the
 * source and a way to get the whole network 403'd (`data-sources.md` §1).
 *
 * One statement, deliberately. `SELECT`-then-`INSERT` from the application is a
 * race however carefully it is written; `INSERT … SELECT … WHERE NOT EXISTS` is
 * decided inside the server, and InnoDB's locking read on the `NOT EXISTS`
 * subquery is what makes two simultaneous attempts serialize instead of both
 * seeing an empty table. Zero rows inserted means somebody else holds the run.
 *
 * The lock is only as good as runs being closed, which is why every path that
 * opens a run also closes it — `runImport`'s `catch` marks `failed`, and PR-50
 * gave `curate()` the same treatment, since a crash there used to leave a row
 * `running` forever. `/admin/importaciones` can release a run that outlived its
 * process, which is the case no `finally` can cover.
 */
export async function claimImportRun(db: Db, source: SourceName): Promise<number> {
  const [result] = await db.execute(
    sql`insert into ${importRuns} (${sql.raw(importRuns.source.name)}, ${sql.raw(importRuns.status.name)})
        select ${source}, 'running' from dual
        where not exists (
          select 1 from ${importRuns}
          where ${importRuns.source} = ${source} and ${importRuns.status} = 'running'
        )`,
  );

  const header = result as unknown as { affectedRows?: number; insertId?: number };
  if (!header.affectedRows) throw new ImportAlreadyRunningError(source);
  return Number(header.insertId);
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

export interface ImportOptions {
  dryRun?: boolean;
  onProgress?: (message: string) => void;
  /**
   * Refuse to start when this source already has a run in flight (PR-50).
   * `/admin/importaciones` passes it; the CLI does not, because an operator at
   * a shell can see what they are doing and must not be locked out by a row a
   * crashed process left behind.
   */
  exclusive?: boolean;
}

/**
 * Open the run, and hand back the rest of the import as a promise (PR-50).
 *
 * This exists because the two callers need different halves of the same work
 * awaited. The CLI wants the whole thing and prints the summary.
 * `/admin/importaciones` needs the **claim** awaited — it is what takes the
 * lock, and "ya hay una importación en curso" is an answer the operator must
 * get on the click — and cannot await the rest, because a full CONES pass is
 * ~65 polite requests and a Server Action that waited for it would time out
 * with the operator none the wiser.
 *
 * So the claim is awaited here and everything after it is `done`. `runImport`
 * is this function plus `await done`, which is what keeps the console and the
 * CLI on one code path rather than two that drift (the PR-20 rule).
 *
 * A caller that keeps `done` must attach a rejection handler: an unhandled
 * rejection ends the process on current Node.
 */
export async function beginImport<TPayload>(
  db: Db,
  source: SourceName,
  produce: () => Promise<readonly RawRecord<TPayload>[]>,
  options: ImportOptions = {},
): Promise<{ importRunId: number; done: Promise<ImportRunSummary> }> {
  const startedAt = new Date();
  const importRunId = options.exclusive
    ? await claimImportRun(db, source)
    : await startImportRun(db, source);

  const done = (async (): Promise<ImportRunSummary> => {
    try {
      const records = await produce();
      const written = await writeRawRecords(db, records, importRunId, source);
      await finishImportRun(db, importRunId, { status: 'succeeded', ...written });
      return { importRunId, source, ...written, startedAt, finishedAt: new Date() };
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
  })();

  return { importRunId, done };
}

/**
 * Run one source end to end: open a run, write what the fetch+parse produced,
 * close the run. A thrown error still closes the run as `failed` with the
 * message in `log`, so a broken import is visible in the table rather than
 * leaving a row stuck in `running` forever.
 *
 * With `exclusive`, opening the run is `claimImportRun` and a second concurrent
 * call throws `ImportAlreadyRunningError` **before** anything is fetched — the
 * claim failing means no run was opened, so there is nothing to close.
 */
export async function runImport<TPayload>(
  db: Db,
  source: SourceName,
  produce: () => Promise<readonly RawRecord<TPayload>[]>,
  options: ImportOptions = {},
): Promise<ImportRunSummary> {
  const startedAt = new Date();

  if (options.dryRun) {
    const records = await produce();
    options.onProgress?.(`Dry run: parsed ${records.length} records, wrote nothing.`);
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

  const { done } = await beginImport(db, source, produce, options);
  return done;
}
