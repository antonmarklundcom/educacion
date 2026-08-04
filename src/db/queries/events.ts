/**
 * All SQL for `events` (CLAUDE.md rule 5).
 *
 * This table is the one that lets an institution be told "tuviste 1.240 vistas
 * y 87 clics a WhatsApp este mes" with a number we can defend, which GA4 cannot
 * produce per institution (`data-model.md`). PR-28 aggregates over it; PR-14
 * only writes `whatsapp_click` and `lead_submit`, and PR-17 adds the rest of
 * the event types and the `/admin/stats` read.
 *
 * **There is no PII column here and there must never be one.** The row is a
 * type, two foreign keys and a session hash that is a salted, daily-rotating
 * digest — see `lib/privacy/hash`. Nothing in it identifies a person, which is
 * also why writing one is not gated on the cookie banner: there is no cookie
 * and no client-side storage involved.
 */

import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { events } from '@/db/schema';
import type { EVENT_TYPE } from '@/db/schema';

export type EventType = (typeof EVENT_TYPE)[number];

export interface EventInsert {
  type: EventType;
  offeringId: number | null;
  institutionId: number | null;
  sessionHash: string | null;
}

export async function insertEvent(input: EventInsert, database: Db = defaultDb): Promise<void> {
  await database.insert(events).values(input);
}

/* -------------------------------------------------------------------------- */
/* Aggregation (PR-17 reads these for /admin/stats; PR-28 for the panel)      */
/* -------------------------------------------------------------------------- */

/**
 * Every aggregate takes the same half-open range and the same optional
 * `institutionId`. PR-28's dashboard is the same questions asked with that
 * argument set, so it does not need a second set of functions — and because
 * the scoping is a parameter of the query rather than a filter applied after
 * it, there is no shape in which "all institutions" leaks into an
 * institution-scoped page (`architecture.md` §12).
 */
export interface EventRange {
  /** Inclusive. */
  since: Date;
  /** Exclusive, so day buckets never double-count a boundary row. */
  until: Date;
}

export interface EventTypeCount {
  type: EventType;
  events: number;
  /** Distinct daily session hashes. Not people — see `lib/privacy/hash`. */
  sessions: number;
}

export interface EventDayCount {
  /** `YYYY-MM-DD`, UTC, matching how the session hash buckets its day. */
  day: string;
  events: number;
}

export interface EventInstitutionCount {
  institutionId: number;
  events: number;
}

function rangeWhere(range: EventRange, institutionId?: number) {
  const conditions = [gte(events.createdAt, range.since), lt(events.createdAt, range.until)];
  if (institutionId != null) conditions.push(eq(events.institutionId, institutionId));
  return and(...conditions);
}

export async function countEventsByType(
  range: EventRange,
  institutionId?: number,
  database: Db = defaultDb,
): Promise<EventTypeCount[]> {
  const rows = await database
    .select({
      type: events.type,
      events: sql<number>`count(*)`,
      sessions: sql<number>`count(distinct ${events.sessionHash})`,
    })
    .from(events)
    .where(rangeWhere(range, institutionId))
    .groupBy(events.type);

  return rows.map((row) => ({
    type: row.type,
    events: Number(row.events),
    sessions: Number(row.sessions),
  }));
}

/**
 * One row per day that has events. Days with none are absent rather than
 * zero-filled: the caller knows the range it asked for and can fill the gaps,
 * and a zero invented by the query layer is indistinguishable from a zero we
 * measured.
 */
export async function countEventsByDay(
  range: EventRange,
  options: { type?: EventType; institutionId?: number } = {},
  database: Db = defaultDb,
): Promise<EventDayCount[]> {
  const conditions = [rangeWhere(range, options.institutionId)];
  if (options.type) conditions.push(eq(events.type, options.type));

  const day = sql<string>`date(${events.createdAt})`;
  const rows = await database
    .select({ day, events: sql<number>`count(*)` })
    .from(events)
    .where(and(...conditions))
    .groupBy(day)
    .orderBy(day);

  return rows.map((row) => ({
    day:
      typeof row.day === 'string'
        ? row.day.slice(0, 10)
        : new Date(row.day).toISOString().slice(0, 10),
    events: Number(row.events),
  }));
}

/**
 * The institutions with the most events of one type in the range. Rows whose
 * `institution_id` is null (a `compare_add`, which carries only an offering)
 * are excluded rather than bucketed into a fictional institution.
 */
export async function countEventsByInstitution(
  range: EventRange,
  type: EventType,
  limit = 10,
  database: Db = defaultDb,
): Promise<EventInstitutionCount[]> {
  const rows = await database
    .select({ institutionId: events.institutionId, events: sql<number>`count(*)` })
    .from(events)
    .where(and(rangeWhere(range), eq(events.type, type), isNotNull(events.institutionId)))
    .groupBy(events.institutionId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows
    .filter((row) => row.institutionId != null)
    .map((row) => ({ institutionId: Number(row.institutionId), events: Number(row.events) }));
}
