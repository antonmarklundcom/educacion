/**
 * Cron-run history, out of `activity_log` (PR-50). Rule 5.
 *
 * ### Why `activity_log` and not a `cron_runs` table
 *
 * The console needs one fact per job: when it last ran and how it went. That is
 * a row with an actor, a time, a subject and an outcome, which is exactly what
 * `activity_log` already stores — and it is already indexed on
 * `(entity_type, created_at)`, which is the query. A `cron_runs` table would be
 * a migration, a second thing to purge and a second history for a reader to
 * check, in exchange for columns this screen does not use.
 *
 * `user_id` is null for a run hPanel fired and set for one an operator pressed
 * "ejecutar ahora" on. That distinction is the whole reason the row is worth
 * writing: "it ran an hour ago" means something different when the only thing
 * that ever ran it was a person clicking a button on this page.
 *
 * ### The run is logged by the route, not by the button
 *
 * `/api/cron/[job]` writes it, so an hPanel-fired run and an operator-fired one
 * produce the same row — and the console's own trigger goes through the route
 * (`actions.ts`), so there is one place a cron run is recorded rather than two
 * that can disagree.
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { activityLog } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';

/** `activity_log.entity_type` for a cron run. */
export const CRON_ENTITY = 'cron_job';

export type CronRunOutcome = 'ok' | 'failed' | 'not_needed';

export interface CronRunRecord {
  job: string;
  outcome: CronRunOutcome;
  /** Whatever the job returned, or the error message when it failed. */
  result: Record<string, unknown> | null;
  /** Null when hPanel fired it; a user id when somebody pressed the button. */
  userId: number | null;
  at: Date;
}

/**
 * Record one run.
 *
 * Never throws: a job that worked must not be reported as failed because the
 * bookkeeping row would not insert. The console showing nothing is a smaller
 * problem than a 500 on a cron endpoint hPanel will retry.
 */
export async function logCronRun(
  job: string,
  outcome: CronRunOutcome,
  result: object | null,
  userId: number | null,
  database: Db = defaultDb,
): Promise<void> {
  try {
    await logActivity(database, {
      userId,
      entityType: CRON_ENTITY,
      entityId: null,
      action: 'run',
      before: null,
      after: { job, outcome, ...(result ?? {}) },
    });
  } catch (error) {
    console.error(`[cron] could not log the ${job} run`, error);
  }
}

function shape(row: {
  id: number;
  userId: number | null;
  afterJson: Record<string, unknown> | null;
  createdAt: Date;
}): CronRunRecord | null {
  const after = row.afterJson ?? {};
  const job = typeof after.job === 'string' ? after.job : null;
  if (job === null) return null;
  const outcome = after.outcome;
  // The payload minus the two keys this shape reads itself: what is left is
  // whatever the job returned, which the console prints verbatim.
  const result = Object.fromEntries(
    Object.entries(after).filter(([key]) => key !== 'job' && key !== 'outcome'),
  );
  return {
    job,
    outcome:
      outcome === 'ok' || outcome === 'failed' || outcome === 'not_needed' ? outcome : 'failed',
    result: Object.keys(result).length > 0 ? result : null,
    userId: row.userId,
    at: row.createdAt,
  };
}

/**
 * The most recent run of each job, as a map keyed by job name.
 *
 * One query, `LIMIT`ed rather than grouped: MySQL 8 would do this with a window
 * function, but the console lists nine jobs and the table is written to once per
 * cron fire — reading the newest few hundred rows of one entity type and taking
 * the first per job is cheaper to read than to explain, and it uses the index
 * that already exists. A job that has not run inside that window is reported as
 * never having run, which is the same thing the operator needs to see.
 */
export async function lastCronRuns(
  database: Db = defaultDb,
  scanLimit = 500,
): Promise<Map<string, CronRunRecord>> {
  const rows = await database
    .select({
      id: activityLog.id,
      userId: activityLog.userId,
      afterJson: activityLog.afterJson,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(and(eq(activityLog.entityType, CRON_ENTITY), eq(activityLog.action, 'run')))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(scanLimit);

  const latest = new Map<string, CronRunRecord>();
  for (const row of rows) {
    const record = shape(row);
    if (record && !latest.has(record.job)) latest.set(record.job, record);
  }
  return latest;
}

/** How many cron runs are on file at all — "the log is empty" vs "this job never ran". */
export async function countCronRuns(database: Db = defaultDb): Promise<number> {
  const rows = await database
    .select({ count: sql<number>`count(*)` })
    .from(activityLog)
    .where(and(eq(activityLog.entityType, CRON_ENTITY), eq(activityLog.action, 'run')));
  return Number(rows[0]?.count ?? 0);
}
