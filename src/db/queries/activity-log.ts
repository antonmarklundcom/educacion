/**
 * `activity_log` — who changed what, from what, to what (CLAUDE.md rule 5).
 *
 * Every admin and panel write goes through `logActivity`. The acceptance bar
 * for PR-19 is "every write logs before/after", and the shape here is what
 * makes that checkable: `before` is null exactly for a create, `after` is null
 * exactly for a hard delete (which nothing does — archiving is an update).
 *
 * ### Two rules the log itself has to obey
 *
 * **It never carries a secret.** `REDACTED_FIELDS` are blanked before the row
 * is written, so a password hash or a claim token cannot end up in a table that
 * exists to be read by humans.
 *
 * **A failed log does not fail the write.** The entity change is already
 * committed when this runs; throwing here would surface as an error over a
 * mutation that actually succeeded, and the operator would retry it. It warns
 * instead.
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { activityLog, users } from '@/db/schema';

export type ActivityAction = 'create' | 'update' | 'archive' | 'restore' | 'upload' | string;

export interface ActivityInput {
  userId: number;
  entityType: string;
  entityId: number | null;
  action: ActivityAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  db?: Db;
}

/** Never written to the log, whatever the caller passes. */
export const REDACTED_FIELDS = new Set([
  'passwordHash',
  'password_hash',
  'password',
  'tokenHash',
  'token_hash',
  'ipHash',
  'ip_hash',
]);

export function redact(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (REDACTED_FIELDS.has(key)) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** Only the fields that actually changed, plus their old values. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

export async function logActivity(input: ActivityInput): Promise<void> {
  const database = input.db ?? defaultDb;
  try {
    await database.insert(activityLog).values({
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeJson: redact(input.before),
      afterJson: redact(input.after),
    });
  } catch (error) {
    console.warn(`[activity_log] could not record ${input.action} on ${input.entityType}`, error);
  }
}

export interface ActivityEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  entityType: string;
  entityId: number | null;
  action: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: Date;
}

export async function listActivity(
  filter: { entityType?: string; entityId?: number; limit?: number } = {},
  database: Db = defaultDb,
): Promise<ActivityEntry[]> {
  const conditions = [];
  if (filter.entityType) conditions.push(eq(activityLog.entityType, filter.entityType));
  if (filter.entityId != null) conditions.push(eq(activityLog.entityId, filter.entityId));

  const rows = await database
    .select({
      id: activityLog.id,
      userId: activityLog.userId,
      userName: users.name,
      userEmail: users.email,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      beforeJson: activityLog.beforeJson,
      afterJson: activityLog.afterJson,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.userId))
    .where(conditions.length ? and(...conditions) : sql`1 = 1`)
    .orderBy(desc(activityLog.id))
    .limit(Math.min(filter.limit ?? 50, 200));

  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}
