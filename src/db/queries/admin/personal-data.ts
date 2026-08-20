/**
 * Executing an R-06 deletion request (PR-44). CLAUDE.md rule 5.
 *
 * `/legal/privacidad` tells every person who submits a form that they can ask
 * us to delete their data, and `risks.md` §R-06 keeps the request channel a
 * human one on purpose: one address in the footer, read by the operator,
 * answered within ten working days. There is no student account, so nothing on
 * the public site can prove that the person asking is the person in the row —
 * a self-service button would be a promise the product cannot keep.
 *
 * What was missing was the other half: *executing* the request meant opening
 * phpMyAdmin and writing a `DELETE`, which is unlogged, unverified and one typo
 * away from deleting somebody else's. This module makes it one `admin` action
 * with the lookup, the confirmation and the audit entry attached.
 *
 * ### Exact match, never a search
 *
 * The lookup is an equality on the normalised value, not a `LIKE`. A prefix
 * search on `+59598` would list hundreds of unrelated people's leads on an
 * operator's screen, which is a privacy incident committed while servicing a
 * privacy request. A phone is normalised through `parseParaguayanPhone` — the
 * same function the lead form uses, so what is looked up is what was stored —
 * and an unparseable number matches nothing rather than falling back to the raw
 * string.
 *
 * ### What the log may say
 *
 * The audit entry records the actor, how many rows went, and a **hash** of the
 * key. Writing the phone number into `activity_log` would move the person's
 * data from a table we just emptied into one that is kept forever, which is the
 * request refused in slow motion. The hash is the same `PRIVACY_SALT`-based
 * digest `leads.ip_hash` uses, so two requests about the same person are
 * recognisably the same request without the log holding the number.
 *
 * ### What it cannot delete, and says so
 *
 * The institution received the lead by email at submission time. We delete our
 * rows and forward the request; we cannot reach their inbox, and
 * `/legal/privacidad` already says so rather than implying otherwise.
 */

import { desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutions, leads } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import { parseParaguayanPhone } from '@/lib/leads/phone';
import { hashEmail } from '@/lib/privacy/hash';
import type { LeadStatus } from '@/lib/leads/contract';

import { logActivity } from './activity-log';

/** The entity type this module writes. Nothing else uses it. */
export const PERSONAL_DATA_ENTITY = 'personal_data';

export interface ContactKey {
  /** E.164, exactly as `leads.phone_e164` stores it. */
  phoneE164: string | null;
  /** Lower-cased; MySQL's default collation makes the comparison itself insensitive. */
  email: string | null;
}

/**
 * Normalise whatever the operator pasted out of the request email.
 *
 * Returns `null` for "nothing usable", which the caller turns into a refusal
 * rather than into a query — an empty key would otherwise match every lead with
 * a null email.
 */
export function parseContactKey(input: { phone?: string; email?: string }): ContactKey | null {
  const phoneE164 = input.phone?.trim() ? parseParaguayanPhone(input.phone).e164 : null;
  const rawEmail = input.email?.trim().toLowerCase() ?? '';
  const email = rawEmail.includes('@') ? rawEmail : null;
  if (!phoneE164 && !email) return null;
  return { phoneE164, email };
}

/** A stable, non-reversible label for the request, for the audit entry only. */
export function contactKeyHash(key: ContactKey): string {
  // One digest over both halves, so "the same person by phone" and "the same
  // person by email" are distinguishable requests — which they are: they match
  // different rows.
  return hashEmail(`${key.phoneE164 ?? ''}|${key.email ?? ''}`);
}

/**
 * The `WHERE` behind both the lookup and the delete.
 *
 * Exported so a test can render it and assert the operator is `=` and not
 * `LIKE` — the independent review found that the first version of this module's
 * "exact match, never a prefix" claim survived being mutated into a prefix
 * search with every test still green, because the fake database captured the
 * clause and never looked at it.
 */
export function matches(key: ContactKey): SQL {
  const parts: SQL[] = [];
  if (key.phoneE164) parts.push(eq(leads.phoneE164, key.phoneE164));
  if (key.email) parts.push(eq(leads.email, key.email));
  // `parseContactKey` guarantees at least one; `or` of one term is that term.
  return parts.length === 1 ? parts[0] : (or(...parts) as SQL);
}

export interface PersonalDataMatch {
  id: number;
  name: string;
  phoneE164: string;
  email: string | null;
  institutionName: string;
  status: LeadStatus;
  createdAt: Date;
}

/**
 * Every `leads` row the key matches, newest first.
 *
 * The operator sees the contact fields deliberately: confirming that these are
 * the right rows before deleting them is the whole point of a two-step flow,
 * and this is an `admin` looking at data they are about to destroy on the
 * owner's instruction.
 */
export async function findLeadsByContact(
  actor: SessionUser | null | undefined,
  key: ContactKey,
  database: Db = defaultDb,
): Promise<PersonalDataMatch[]> {
  requireRole(actor, ['admin']);

  const rows = await database
    .select({
      id: leads.id,
      name: leads.name,
      phoneE164: leads.phoneE164,
      email: leads.email,
      institutionName: institutions.nameShort,
      status: leads.status,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .innerJoin(institutions, eq(institutions.id, leads.institutionId))
    .where(matches(key))
    .orderBy(desc(leads.createdAt));

  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

export interface DeletionResult {
  deleted: number;
  keyHash: string;
}

/**
 * Delete every lead the key matches, and record that it happened.
 *
 * The `DELETE` and the `activity_log` write share one transaction: a deletion
 * that is not recorded is indistinguishable afterwards from data that was never
 * collected, and this is the one action on the site whose whole value is being
 * answerable for it later.
 *
 * The rows are re-selected inside the transaction rather than trusting ids from
 * the browser. An id list round-tripping through a form is an id list somebody
 * can edit, and the edit would delete a lead nobody asked us to delete.
 */
export async function deleteLeadsByContact(
  actor: SessionUser | null | undefined,
  key: ContactKey,
  database: Db = defaultDb,
): Promise<DeletionResult> {
  const session = requireRole(actor, ['admin']);
  const keyHash = contactKeyHash(key);

  return database.transaction(async (tx) => {
    const rows = await tx.select({ id: leads.id }).from(leads).where(matches(key));
    const ids = rows.map((row) => Number(row.id));

    if (ids.length === 0) {
      // Nothing to delete is not nothing to record: "we looked and there was
      // nothing" is the answer the requester gets, and the log has to support it.
      await logActivity(tx, {
        userId: session.id,
        entityType: PERSONAL_DATA_ENTITY,
        entityId: null,
        action: 'delete',
        before: null,
        after: { deleted: 0, keyHash },
      });
      return { deleted: 0, keyHash };
    }

    await tx.delete(leads).where(inArray(leads.id, ids));

    await logActivity(tx, {
      userId: session.id,
      entityType: PERSONAL_DATA_ENTITY,
      entityId: null,
      action: 'delete',
      before: null,
      // The count and the hash. Never a name, a number, an address or an id —
      // an id is a pointer back to a row we have just promised to forget.
      after: { deleted: ids.length, keyHash },
    });

    return { deleted: ids.length, keyHash };
  });
}

/**
 * How many leads exist at all, so the screen can say "0 de 1 240" rather than
 * leaving an operator wondering whether the lookup ran.
 */
export async function countAllLeads(
  actor: SessionUser | null | undefined,
  database: Db = defaultDb,
): Promise<number> {
  requireRole(actor, ['admin']);
  const [row] = await database.select({ total: sql<number>`count(*)` }).from(leads);
  return Number(row?.total ?? 0);
}
