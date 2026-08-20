/**
 * All SQL for `leads` (CLAUDE.md rule 5).
 *
 * ### The durable half of the rate limit lives here
 *
 * `architecture.md` §6.1 chose to derive the durable quota from this table
 * rather than from a `rate_limits` table of its own. `countRecentByPhone` and
 * `countRecentByIpHash` are that decision: the numbers they return are facts
 * about leads that exist, so they cannot drift from what was actually stored,
 * they survive a redeploy, and there is no counter table for a cron job to
 * sweep. Both are backed by an index added for exactly this purpose
 * (`0002_lead_rate_limit_indexes.sql`); without it they are a table scan on the
 * one path an attacker controls.
 *
 * ### What never leaves this module
 *
 * `ip_hash` and `user_agent` are written and read for abuse control only. They
 * are not on `LeadRecord`, so PR-23's inbox and CSV export cannot include them
 * by accident — a lead's contact details belong to the institution it was sent
 * to, its abuse metadata belongs to nobody.
 */

import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { leads } from '@/db/schema';
import type { AgeBracket, LeadStatus } from '@/lib/leads/contract';

/**
 * One lead as any reader is allowed to see it. PR-23 (`/panel/leads`, CSV
 * export, email digest) is written against this shape; it must not need to
 * change when that PR lands.
 */
export interface LeadRecord {
  id: number;
  institutionId: number;
  offeringId: number | null;
  name: string;
  phoneE164: string;
  email: string | null;
  message: string | null;
  ageBracket: AgeBracket;
  status: LeadStatus;
  consentTextVersion: string;
  consentAt: Date;
  sourcePage: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

/** What `createLead` needs. Consent is not optional and has no default. */
export interface LeadInsert {
  institutionId: number;
  offeringId: number;
  name: string;
  phoneE164: string;
  email: string | null;
  message: string | null;
  ageBracket: AgeBracket;
  consentTextVersion: string;
  consentAt: Date;
  sourcePage: string | null;
  ipHash: string | null;
  userAgent: string | null;
}

const RECORD_COLUMNS = {
  id: leads.id,
  institutionId: leads.institutionId,
  offeringId: leads.offeringId,
  name: leads.name,
  phoneE164: leads.phoneE164,
  email: leads.email,
  message: leads.message,
  ageBracket: leads.ageBracket,
  status: leads.status,
  consentTextVersion: leads.consentTextVersion,
  consentAt: leads.consentAt,
  sourcePage: leads.sourcePage,
  deliveredAt: leads.deliveredAt,
  createdAt: leads.createdAt,
} as const;

/**
 * Insert one lead. `consent` is hard-coded to `true` rather than passed in:
 * the table's `leads_consent_required` CHECK would reject anything else, and a
 * parameter would imply there is a call site that could legitimately set it
 * false. There is not.
 */
export async function createLead(input: LeadInsert, database: Db = defaultDb): Promise<number> {
  const [result] = await database.insert(leads).values({
    ...input,
    consent: true,
    status: 'new',
  });
  return Number(result.insertId);
}

/** Called after a successful notification; PR-23 owns the retry cron. */
export async function markLeadDelivered(
  id: number,
  at: Date = new Date(),
  database: Db = defaultDb,
): Promise<void> {
  await database.update(leads).set({ status: 'sent', deliveredAt: at }).where(eq(leads.id, id));
}

async function countSince(
  database: Db,
  column: typeof leads.phoneE164 | typeof leads.ipHash,
  value: string,
  since: Date,
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(column, value), gt(leads.createdAt, since)));
  return Number(row?.total ?? 0);
}

/** How many leads this phone has already produced since `since`. */
export function countRecentByPhone(
  phoneE164: string,
  since: Date,
  database: Db = defaultDb,
): Promise<number> {
  return countSince(database, leads.phoneE164, phoneE164, since);
}

/** Same, per hashed IP. Useless once the salt rotates — see `lib/privacy/hash`. */
export function countRecentByIpHash(
  ipHash: string,
  since: Date,
  database: Db = defaultDb,
): Promise<number> {
  return countSince(database, leads.ipHash, ipHash, since);
}

/** One lead by id, unscoped — callers check ownership themselves (`panel/scope.ts`). */
export async function getLeadById(
  id: number,
  database: Db = defaultDb,
): Promise<LeadRecord | null> {
  const [row] = await database.select(RECORD_COLUMNS).from(leads).where(eq(leads.id, id)).limit(1);
  if (!row) return null;
  return { ...row, offeringId: row.offeringId ?? null };
}

/**
 * PR-23's read path, already scoped: there is no overload that omits
 * `institutionId`, so an inbox query cannot be written that returns another
 * institution's leads. Kept here (rather than in PR-23) so the interface it
 * builds against exists in `main` before it starts (`agent-workflow.md` §2).
 */
export async function listLeadsForInstitution(
  query: { institutionId: number; status?: LeadStatus; limit?: number; offset?: number },
  database: Db = defaultDb,
): Promise<LeadRecord[]> {
  const conditions = [eq(leads.institutionId, query.institutionId)];
  if (query.status) conditions.push(eq(leads.status, query.status));

  const rows = await database
    .select(RECORD_COLUMNS)
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt))
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0);

  return rows.map((row) => ({ ...row, offeringId: row.offeringId ?? null }));
}

/** Total matching `listLeadsForInstitution`'s filters, for pagination (PR-23). */
export async function countLeadsForInstitution(
  institutionId: number,
  status?: LeadStatus,
  database: Db = defaultDb,
): Promise<number> {
  const conditions = [eq(leads.institutionId, institutionId)];
  if (status) conditions.push(eq(leads.status, status));

  const [row] = await database
    .select({ total: sql<number>`count(*)` })
    .from(leads)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

/**
 * Leads of one institution inside a half-open date range (PR-28).
 *
 * The dashboard reports solicitudes from **this table** rather than from the
 * `lead_submit` event, and the two can differ: a lead is a row that exists and
 * can be answered, the event is a count of a page action. When they disagree
 * the row is the truth, and it is also the number an institution can check
 * against its own inbox.
 */
export async function countLeadsForInstitutionSince(
  institutionId: number,
  range: { since: Date; until: Date },
  database: Db = defaultDb,
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)` })
    .from(leads)
    .where(
      and(
        eq(leads.institutionId, institutionId),
        gte(leads.createdAt, range.since),
        lt(leads.createdAt, range.until),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * `contacted` / `qualified` / `discarded` — the transitions an institution
 * makes from `/panel/leads`. `new` and `sent` are system states (set by
 * `createLead` and `markLeadDelivered`) and are not reachable through this
 * function; the panel action that calls it enforces that allow-list, not this
 * layer, but only these three are ever passed in practice.
 */
export async function updateLeadStatus(
  id: number,
  status: LeadStatus,
  database: Db = defaultDb,
): Promise<void> {
  await database.update(leads).set({ status }).where(eq(leads.id, id));
}

/**
 * Leads still waiting on a first delivery attempt, oldest first. This is the
 * whole read side of the hourly `lead-retry` cron (`architecture.md` §10):
 * `status='new'` and `delivered_at is null` together mean "the row exists and
 * nothing has told the institution yet" — `notifyInstitution` failing is the
 * only way a lead gets here, since `submitLead` calls `markLeadDelivered`
 * itself on success.
 *
 * Not institution-scoped: the cron runs for every institution at once and is
 * never reachable from `/panel`, so there is no `scopeToInstitution` to apply.
 */
export async function listUndeliveredLeads(
  limit = 200,
  database: Db = defaultDb,
): Promise<LeadRecord[]> {
  const rows = await database
    .select(RECORD_COLUMNS)
    .from(leads)
    .where(and(eq(leads.status, 'new'), isNull(leads.deliveredAt)))
    .orderBy(leads.createdAt)
    .limit(limit);

  return rows.map((row) => ({ ...row, offeringId: row.offeringId ?? null }));
}

/**
 * One row per institution that currently has at least one `status='new'`
 * lead, with the count — the whole read side of the daily digest. `since` is
 * the digest's own concern (it does not filter here): the email honestly
 * reports "leads waiting right now", not "leads since last time", because
 * there is no persisted "last sent" clock to measure the second sentence
 * against (`architecture.md` §10 notes the digest as a live snapshot, safe to
 * re-send).
 */
export async function listInstitutionsWithNewLeads(
  database: Db = defaultDb,
): Promise<Array<{ institutionId: number; newCount: number; oldestCreatedAt: Date }>> {
  const rows = await database
    .select({
      institutionId: leads.institutionId,
      newCount: sql<number>`count(*)`,
      oldestCreatedAt: sql<Date>`min(${leads.createdAt})`,
    })
    .from(leads)
    .where(eq(leads.status, 'new'))
    .groupBy(leads.institutionId);

  return rows.map((row) => ({
    institutionId: row.institutionId,
    newCount: Number(row.newCount),
    oldestCreatedAt: row.oldestCreatedAt,
  }));
}

/**
 * `markLeadDelivered` at scale. `since` bounds it defensively — a cron job is
 * not a place to run an unbounded `UPDATE`.
 *
 * **The retry cron no longer uses this**, and PR-46 says why: batching the
 * marks meant one failed write re-sent the whole batch's worth of student
 * contact details on the next tick, and again after that. `retryLeadDelivery`
 * marks each lead the moment its mail is accepted. Kept for a caller that
 * genuinely has a set in hand, of which there is currently none.
 */
export async function markLeadsDelivered(
  ids: number[],
  at: Date = new Date(),
  database: Db = defaultDb,
): Promise<void> {
  if (ids.length === 0) return;
  await database
    .update(leads)
    .set({ status: 'sent', deliveredAt: at })
    .where(inArray(leads.id, ids));
}
