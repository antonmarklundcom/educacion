/**
 * `activity_log` writes — the one thing every admin mutation must not forget
 * (CLAUDE.md, PR-19 acceptance criteria).
 *
 * `buildActivityLogRow` is pure so the shape (create → `beforeJson: null`,
 * delete → `afterJson: null`, update → both present) is unit-testable without
 * a database. `logActivity` is the thin write on top of it, called from
 * inside the same transaction as the mutation it records — never from the
 * route or the server action, so a future entity's mutation cannot ship
 * without it.
 *
 * Never pass a `users` row through here: `before`/`after` snapshots on this
 * module's five entities (institutions, campuses, careers, programs,
 * offerings) never touch `password_hash`, and nothing in this file reads
 * `users` at all.
 */

import type { Db } from '@/db';
import { activityLog } from '@/db/schema';

/**
 * Structural, not `Db` itself: every mutation calls this from inside
 * `db.transaction(async (tx) => …)`, and Drizzle's transaction handle is not
 * assignable to `Db` (it lacks `$client`) even though `.insert` behaves
 * identically on both.
 */
export type Writable = Pick<Db, 'insert'>;

export type ActivityAction = 'create' | 'update' | 'delete' | 'archive';

export interface ActivityLogEntry {
  /**
   * Null for a write nobody made — the past-due sweep is a cron, not a person
   * (PR-29). Keeping the column nullable rather than inventing a "system user"
   * is what makes "who did this" answerable honestly: a system user id in this
   * column would be indistinguishable from a staff account in every report.
   */
  userId: number | null;
  entityType: string;
  entityId: number | null;
  action: ActivityAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** Builds the row `activity_log` gets. Pure — no I/O, no clock read here. */
export function buildActivityLogRow(entry: ActivityLogEntry): typeof activityLog.$inferInsert {
  return {
    userId: entry.userId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    beforeJson: entry.before,
    afterJson: entry.after,
  };
}

export async function logActivity(db: Writable, entry: ActivityLogEntry): Promise<void> {
  await db.insert(activityLog).values(buildActivityLogRow(entry));
}
