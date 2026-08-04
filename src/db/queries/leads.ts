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

import { and, desc, eq, gt, sql } from 'drizzle-orm';

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
