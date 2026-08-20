/**
 * Reading `activity_log` (PR-44). CLAUDE.md rule 5.
 *
 * `activity-log.ts` next door owns the writes and has since PR-19; every admin
 * and panel mutation calls it, with a before/after snapshot. Nothing has ever
 * read it back, which made it a table that costs a write on every mutation and
 * answers no question — the audit's "built but orphaned" finding.
 *
 * **This module is read-only and has no counterpart that is not.** There is no
 * update, no delete, no redaction of an entry. An audit log a staff member can
 * edit is not an audit log, so the absence is the feature, and
 * `activity.access.test.ts` asserts it by canary: any write reached from here
 * fails the suite.
 *
 * Reading is `editor`. *Which* payloads an editor may read is a separate
 * question, and it is answered **here**, in the query, not in the page.
 *
 * That placement is the whole point. The first version of this module returned
 * everything and let `/admin/actividad` decide what to render, which put an
 * access-control rule in the layer CLAUDE.md rule 4 calls UX: hard-code
 * `viewerIsAdmin` to `true` in the page and the boundary was gone with the
 * whole suite still green. Now the row that reaches the page is already the row
 * this reader is allowed to have, and `activity.access.test.ts` can prove it.
 *
 * Two things are withheld from a non-`admin`:
 *
 * - **The snapshots of three entity types** — `user`, `institution_member`,
 *   `subscription` and `personal_data`, whose own screens (`/admin/usuarios`,
 *   `/admin/suscripciones`, `/admin/privacidad`) are `admin`-only.
 *   `src/lib/admin/activity-diff.ts` owns that list.
 * - **The actor's email address.** An independent review found this one: the
 *   join hands back `users.email` for whoever wrote each row, including
 *   institution members — the identical field being withheld one line below as
 *   `institution_member` snapshot data, and the content of the `admin`-only
 *   `/admin/usuarios`. An editor gets the actor's *name*, or nothing.
 */

import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { activityLog, users } from '@/db/schema';
import { hasRole, requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import { restrictSnapshots, type ActivitySnapshot } from '@/lib/admin/activity-diff';

/** How many entries one page shows. */
export const ACTIVITY_PAGE_SIZE = 50;

export interface ActivityEntry {
  id: number;
  /** Null for a cron's write — PR-29's sweep is not a person (`activity-log.ts`). */
  actorId: number | null;
  /** `null` for a cron **and** for anything an editor is not allowed to read. */
  actorEmail: string | null;
  actorName: string | null;
  entityType: string;
  entityId: number | null;
  action: string;
  before: ActivitySnapshot;
  after: ActivitySnapshot;
  /** True when the payload was withheld from this reader, not simply absent. */
  restricted: boolean;
  createdAt: Date;
}

export interface ActivityFilters {
  entityType?: string;
  /**
   * A user id, or the string `'system'` for a write with a null `user_id` —
   * PR-29's sweep is a cron, not a person. There is no user id 0, so the string
   * is the discriminator rather than a magic number.
   */
  actorId?: number | 'system';
  /** Inclusive instant. The *page* decides which day that is; see its `parseDay`. */
  since?: Date;
  /** Exclusive instant, so a day-sized range never drops the entry on its edge. */
  until?: Date;
  page?: number;
}

function conditions(filters: ActivityFilters): SQL[] {
  const where: SQL[] = [];
  if (filters.entityType) where.push(eq(activityLog.entityType, filters.entityType));
  if (filters.actorId === 'system') {
    where.push(sql`${activityLog.userId} is null`);
  } else if (typeof filters.actorId === 'number') {
    where.push(eq(activityLog.userId, filters.actorId));
  }
  if (filters.since) where.push(gte(activityLog.createdAt, filters.since));
  if (filters.until) where.push(lt(activityLog.createdAt, filters.until));
  return where;
}

/**
 * One page of the log, newest first.
 *
 * The actor is joined rather than denormalised: `activity_log` stores a user id
 * and the address belongs to `users`, so a staff member who changes their email
 * does not leave two spellings of themselves in the history.
 */
export async function listActivity(
  actor: SessionUser | null | undefined,
  filters: ActivityFilters = {},
  database: Db = defaultDb,
): Promise<{ entries: ActivityEntry[]; total: number; page: number; totalPages: number }> {
  requireRole(actor, ['editor']);
  const viewerIsAdmin = hasRole(actor, ['admin']);

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const where = conditions(filters);
  const whereClause = where.length ? and(...where) : undefined;

  const [rows, [count]] = await Promise.all([
    database
      .select({
        id: activityLog.id,
        actorId: activityLog.userId,
        actorEmail: users.email,
        actorName: users.name,
        entityType: activityLog.entityType,
        entityId: activityLog.entityId,
        action: activityLog.action,
        before: activityLog.beforeJson,
        after: activityLog.afterJson,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .where(whereClause)
      .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
      .limit(ACTIVITY_PAGE_SIZE)
      .offset((page - 1) * ACTIVITY_PAGE_SIZE),
    database
      .select({ total: sql<number>`count(*)` })
      .from(activityLog)
      .where(whereClause),
  ]);

  const total = Number(count?.total ?? 0);

  return {
    entries: rows.map((row) => {
      const snapshots = restrictSnapshots(row.entityType, viewerIsAdmin, {
        before: row.before ?? null,
        after: row.after ?? null,
      });
      return {
        ...row,
        id: Number(row.id),
        // Withheld here rather than in the page: see the module comment.
        actorEmail: viewerIsAdmin ? row.actorEmail : null,
        ...snapshots,
      };
    }),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)),
  };
}

/**
 * The entity types that actually appear, for the filter control.
 *
 * Read from the table rather than from a constant, because `entityType` is a
 * `varchar` every caller of `logActivity` picks for itself — a hardcoded list
 * would silently omit whatever the next PR starts logging.
 */
export async function listActivityEntityTypes(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<string[]> {
  requireRole(actor, ['editor']);
  const rows = await database
    .selectDistinct({ entityType: activityLog.entityType })
    .from(activityLog)
    .orderBy(activityLog.entityType);
  return rows.map((row) => row.entityType);
}

export interface ActivityActor {
  id: number;
  /** `null` for a non-`admin` reader — see `listActivityActors`. */
  email: string | null;
  name: string | null;
}

/**
 * Staff who have written at least one entry, for the actor filter.
 *
 * The address is stripped for a non-`admin` for the same reason it is stripped
 * from the rows: this list is every account that has ever touched the admin or
 * the panel, which is the content of the `admin`-only `/admin/usuarios`. The
 * id still identifies the option, so the filter keeps working.
 */
export async function listActivityActors(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<ActivityActor[]> {
  requireRole(actor, ['editor']);
  const viewerIsAdmin = hasRole(actor, ['admin']);
  const rows = await database
    .selectDistinct({ id: users.id, email: users.email, name: users.name })
    .from(activityLog)
    .innerJoin(users, eq(users.id, activityLog.userId))
    .orderBy(users.email);
  return rows.map((row) => ({ ...row, email: viewerIsAdmin ? row.email : null }));
}
