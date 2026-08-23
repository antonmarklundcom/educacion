/**
 * `/admin/importaciones` — the reads, the lock and the trigger (PR-50). Rule 5.
 *
 * `plan.md` §6 calls data operations the real bottleneck of this project, and
 * until this PR every import ran from a shell with `DATABASE_URL` exported by
 * hand (`deployment.md` §5). That is fine for the person who wrote the scripts
 * and impossible for anybody else, which makes the bottleneck a person rather
 * than a task.
 *
 * ### There is no second import code path
 *
 * PR-20's rule. The triggers here call `runImport(...)` with the same collector
 * the CLI passes, and `curate({...})` — the same functions
 * `scripts/import-cones.ts`, `scripts/import-aneaes.ts` and `scripts/curate.ts`
 * call. What those scripts own that this does not is argv parsing and printing
 * to a terminal. Nothing about *what an import does* is decided twice.
 *
 * ### Why the trigger does not await the import
 *
 * A full CONES pass is ~65 polite HTTP requests and takes minutes; a Server
 * Action that awaited it would hit a proxy timeout long before it finished, and
 * the operator would be left not knowing whether it ran. So the trigger opens
 * the run — synchronously, because opening it is what takes the lock and what
 * the operator must be told about — and then lets the work continue in the
 * background while the page reports progress out of `import_runs`, which is the
 * table the import writes to anyway.
 *
 * The failure this leaves is a process that dies mid-import: the row stays
 * `running` and the lock is held by nobody. `releaseImportRun` is the operator's
 * answer to exactly that, and the page marks a long-running run as suspect
 * rather than waiting for somebody to notice.
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { importRuns } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { curate } from '@/db/queries/curation';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import { collectAneaes, collectCones } from '@/lib/ingest/sources';
import { ImportAlreadyRunningError, beginImport, finishImportRun } from '@/lib/ingest/repository';
import type { SourceName } from '@/lib/ingest';

/** `activity_log.entity_type` for an import triggered from the console. */
export const IMPORT_ENTITY = 'import_run';

/**
 * A run still `running` after this long is reported as suspect.
 *
 * Not a timeout and nothing acts on it: a full CONES crawl is minutes, not
 * hours, so a run that has been open since yesterday is either a dead process
 * or a source that has stopped answering — both of which want a human, and
 * neither of which should be resolved by a background job deciding on its own
 * that somebody else's import is dead.
 */
export const STUCK_AFTER_MINUTES = 90;

export type ImportJob = 'import:cones' | 'import:aneaes' | 'curate';

export interface ImportJobDefinition {
  job: ImportJob;
  label: string;
  detail: string;
  /** The sources whose lock this job takes. */
  sources: readonly SourceName[];
}

export const IMPORT_JOBS: readonly ImportJobDefinition[] = [
  {
    job: 'import:cones',
    label: 'Importar CONES',
    detail:
      'Captura el registro de habilitación del CONES en source_records. No publica nada: la capa cruda no toca instituciones ni carreras.',
    sources: ['CONES'],
  },
  {
    job: 'import:aneaes',
    label: 'Importar ANEAES',
    detail:
      'Captura las carreras acreditadas por la ANEAES en source_records. Tampoco publica: la acreditación se aplica al curar.',
    sources: ['ANEAES'],
  },
  {
    job: 'curate',
    label: 'Curar',
    detail:
      'Cruza source_records contra el catálogo, aplica lo seguro y manda el resto a moderación. Nada que tenga conflicto se publica solo.',
    sources: ['CONES', 'ANEAES'],
  },
] as const;

export interface ImportRunRow {
  id: number;
  source: SourceName;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: Date;
  finishedAt: Date | null;
  rowsIn: number;
  rowsNew: number;
  rowsUnchanged: number;
  rowsMatched: number;
  rowsConflicted: number;
  log: string | null;
}

/** The recent history the console lists, newest first. Editor-gated. */
export async function listImportRuns(
  user: SessionUser | null | undefined,
  limit = 25,
  database: Db = defaultDb,
): Promise<ImportRunRow[]> {
  requireRole(user, ['editor']);
  const rows = await database
    .select()
    .from(importRuns)
    .orderBy(desc(importRuns.startedAt), desc(importRuns.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    rowsIn: row.rowsIn,
    rowsNew: row.rowsNew,
    rowsUnchanged: row.rowsUnchanged,
    rowsMatched: row.rowsMatched,
    rowsConflicted: row.rowsConflicted,
    log: row.log,
  }));
}

/** Whether this source currently holds the lock, and since when. */
export async function runningImportRuns(
  user: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<ImportRunRow[]> {
  requireRole(user, ['editor']);
  const rows = await database
    .select()
    .from(importRuns)
    .where(eq(importRuns.status, 'running'))
    .orderBy(desc(importRuns.startedAt));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    rowsIn: row.rowsIn,
    rowsNew: row.rowsNew,
    rowsUnchanged: row.rowsUnchanged,
    rowsMatched: row.rowsMatched,
    rowsConflicted: row.rowsConflicted,
    log: row.log,
  }));
}

/** Whether a run that is still open has been open long enough to be suspect. */
export function isStuck(run: ImportRunRow, now: Date = new Date()): boolean {
  if (run.status !== 'running') return false;
  return now.getTime() - run.startedAt.getTime() >= STUCK_AFTER_MINUTES * 60_000;
}

export interface ImportsSummary {
  runs: ImportRunRow[];
  running: ImportRunRow[];
  /** Sources whose lock is currently held — the buttons those disable. */
  lockedSources: SourceName[];
  rowsLast24h: number;
}

export async function importsOverview(
  user: SessionUser | null | undefined,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<ImportsSummary> {
  requireRole(user, ['editor']);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [runs, running, recent] = await Promise.all([
    listImportRuns(user, 25, database),
    runningImportRuns(user, database),
    database
      .select({ rows: sql<number>`coalesce(sum(${importRuns.rowsNew}), 0)` })
      .from(importRuns)
      .where(and(gte(importRuns.startedAt, dayAgo), eq(importRuns.status, 'succeeded'))),
  ]);

  return {
    runs,
    running,
    lockedSources: [...new Set(running.map((run) => run.source))],
    rowsLast24h: Number(recent[0]?.rows ?? 0),
  };
}

export interface TriggerResult {
  /** The run that was opened, when the job opens exactly one. */
  importRunId: number | null;
  message: string;
}

function definitionFor(job: string): ImportJobDefinition {
  const definition = IMPORT_JOBS.find((candidate) => candidate.job === job);
  if (!definition) throw new Error('Ese trabajo no existe.');
  return definition;
}

/**
 * Start one import or a curate pass, and return as soon as the lock is taken.
 *
 * `editor`-gated here, in the query module that performs the write, and not
 * only in the Server Action — the placement rule `requireRole` follows
 * (`architecture.md` §13).
 *
 * The returned promise resolves when the run has been **claimed**, not when it
 * has finished. Everything after the claim runs in the background and reports
 * itself into `import_runs`; an unhandled rejection there would take the process
 * down on Node 18+, so the tail is caught and logged.
 */
export async function triggerImportJob(
  user: SessionUser | null | undefined,
  job: string,
  database: Db = defaultDb,
): Promise<TriggerResult> {
  requireRole(user, ['editor']);
  const definition = definitionFor(job);
  const actorId = user!.id;

  // A friendly refusal before the claim, so the operator reads "CONES ya se
  // está importando" instead of a generic failure. It is **not** the lock —
  // `claimImportRun` is, and it is what makes two simultaneous clicks safe.
  // This check only makes the common case legible.
  const blocked = (await runningImportRuns(user, database)).filter((run) =>
    definition.sources.includes(run.source),
  );
  if (blocked.length > 0) {
    const run = blocked[0]!;
    throw new ImportAlreadyRunningError(run.source);
  }

  if (definition.job === 'curate') {
    // `curate` opens one run per source itself, so the claim it needs is inside
    // it — passing `exclusive` is how a source that is already being imported
    // or curated refuses the pass rather than racing it.
    await logActivity(database, {
      userId: actorId,
      entityType: IMPORT_ENTITY,
      entityId: null,
      action: 'run',
      before: null,
      after: { job: definition.job },
    });
    void curate({ db: database, exclusive: true }).catch((error) => {
      console.error('[imports] curate failed', error);
    });
    return { importRunId: null, message: 'Curaduría iniciada. Mirá las corridas de abajo.' };
  }

  const source: SourceName = definition.sources[0]!;

  // `beginImport` awaits the claim and hands back the rest. That split is the
  // whole reason it exists: the operator learns "ya hay una importación en
  // curso" on the click, and the ~65-request crawl does not have to finish
  // inside a Server Action. The rejection handler is not optional — an
  // unhandled one ends the process, and `beginImport` says so.
  //
  // Branched rather than selected into a variable: `collectCones` and
  // `collectAneaes` return records of different payload types, and a union of
  // the two loses the tie between the source and its payload that
  // `writeRawRecords` checks.
  const { importRunId, done } =
    source === 'CONES'
      ? await beginImport(database, 'CONES', () => collectCones(), { exclusive: true })
      : await beginImport(database, 'ANEAES', () => collectAneaes(), { exclusive: true });

  // Logged **after** the claim, and carrying the run id (PR-52). Written before
  // it, a lost race left an `activity_log` row saying an import started next to
  // an `import_runs` table that never saw it — the two records of the same
  // event disagreeing, which is the thing an audit log exists not to do.
  await logActivity(database, {
    userId: actorId,
    entityType: IMPORT_ENTITY,
    entityId: importRunId,
    action: 'run',
    before: null,
    after: { job: definition.job, source, importRunId },
  });

  void done.catch((error) => {
    console.error(`[imports] ${source} run #${importRunId} failed`, error);
  });

  return { importRunId, message: `Importación de ${source} iniciada (corrida #${importRunId}).` };
}

/**
 * Close a run that outlived the process that opened it, so the lock is free.
 *
 * The one thing an operator can do that a `finally` cannot: a container that
 * was restarted mid-crawl leaves a row `running` with nobody to close it, and
 * without this the source is locked out until somebody opens a MySQL client.
 * It writes the same `failed` status the crash would have written, says in the
 * log that a person did it, and lands in `activity_log` like every other admin
 * mutation.
 *
 * It refuses a run that is not actually stuck: "the import is slow" is not a
 * reason to declare it dead and start a second crawl of the same site.
 */
export async function releaseImportRun(
  user: SessionUser | null | undefined,
  importRunId: number,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<void> {
  requireRole(user, ['editor']);
  const actorId = user!.id;

  const [row] = await database.select().from(importRuns).where(eq(importRuns.id, importRunId));
  if (!row) throw new Error('Esa corrida no existe.');
  if (row.status !== 'running') throw new Error('Esa corrida ya está cerrada.');
  if (!isStuck({ ...row, status: 'running' } as ImportRunRow, now)) {
    throw new Error(
      `Esa corrida arrancó hace menos de ${STUCK_AFTER_MINUTES} minutos. Esperá antes de darla por muerta.`,
    );
  }

  await finishImportRun(database, importRunId, {
    status: 'failed',
    rowsIn: row.rowsIn,
    rowsNew: row.rowsNew,
    rowsUnchanged: row.rowsUnchanged,
    log: `Cerrada a mano desde /admin/importaciones: la corrida quedó abierta sin proceso.`,
  });

  await logActivity(database, {
    userId: actorId,
    entityType: IMPORT_ENTITY,
    entityId: importRunId,
    action: 'update',
    before: { status: 'running' },
    after: { status: 'failed', released: true },
  });
}
