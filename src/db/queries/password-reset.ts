/**
 * Password reset by email — the two writes (PR-35). Rule 5.
 *
 * ### The request path answers the same thing for everybody
 *
 * `requestPasswordReset` returns `null` for an unknown address, a suspended
 * account and an account with no institution alike, and the page renders the
 * identical sentence in every case. Anything else is a user-enumeration oracle
 * — the same property PR-18 built into the login path, where a miss verifies
 * against a decoy hash so the *timing* does not leak either.
 *
 * ### Redemption is one transaction, and the order is the security property
 *
 * 1. `UPDATE … SET used_at = NOW() WHERE id = ? AND used_at IS NULL` — zero
 *    rows means somebody redeemed it first and the transaction ends there.
 *    That is what makes it single-use; the pure `resetTokenState` check above
 *    it races and is a courtesy.
 * 2. Only then the password is written, `must_change_password` cleared, and
 *    **every other outstanding token for that user invalidated** — a reset is
 *    the moment to assume the older links are in the wrong hands.
 *
 * A successful reset does **not** start a session. Same reasoning as the claim
 * flow (§16.4): a second, thinner path to a logged-in browser would have to be
 * kept correct forever, and the ordinary login already has the uniform failure
 * message and the timing defence.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { passwordResetTokens, users } from '@/db/schema';
import { logActivity } from '@/db/queries/admin/activity-log';
import { hashPassword } from '@/lib/auth/password';
import {
  createResetToken,
  hashResetToken,
  resetExpiry,
  resetTokenState,
  type ResetTokenState,
} from '@/lib/auth/reset-token';

export interface ResetRequest {
  /** The plaintext token for the link. Never persisted. */
  token: string;
  email: string;
  name: string | null;
}

/**
 * Mints a token for `email`, or returns null when there is nobody to mint it
 * for. The caller must render the same thing either way.
 *
 * `suspended` accounts are refused silently: telling a locked-out user that
 * their account exists but is suspended is information we would not give an
 * attacker, and the operator is the right channel for that conversation.
 */
export async function requestPasswordReset(
  email: string,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<ResetRequest | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const [user] = await database
    .select({ id: users.id, email: users.email, name: users.name, status: users.status })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (!user || user.status === 'suspended') return null;

  const { token, tokenHash } = createResetToken();
  await database.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt: resetExpiry(now),
  });

  return { token, email: user.email, name: user.name ?? null };
}

export interface ResetLookup {
  state: ResetTokenState | 'unknown';
  email: string | null;
}

/** What the reset page needs to decide whether to render a form or a refusal. */
export async function lookupResetToken(
  token: string,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<ResetLookup> {
  const [row] = await database
    .select({
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
      email: users.email,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(eq(passwordResetTokens.tokenHash, hashResetToken(token)))
    .limit(1);

  if (!row) return { state: 'unknown', email: null };
  return { state: resetTokenState(row, now), email: row.email };
}

export type ResetOutcome =
  { ok: true; email: string } | { ok: false; reason: ResetTokenState | 'unknown' };

export async function consumePasswordReset(
  token: string,
  newPassword: string,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<ResetOutcome> {
  const tokenHash = hashResetToken(token);

  const [row] = await database
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
      email: users.email,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, reason: 'unknown' };

  const state = resetTokenState(row, now);
  if (state !== 'ok') return { ok: false, reason: state };

  // Hashed before the transaction: scrypt at OWASP parameters takes a
  // deliberate moment, and holding a row lock through it would serialise
  // every concurrent reset behind the slowest one.
  const passwordHash = await hashPassword(newPassword);

  let claimed = false;
  await database.transaction(async (tx) => {
    const [result] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)));

    // Zero affected rows means another request spent it between the read and
    // now. Nothing else in this transaction may run.
    if (Number(result.affectedRows ?? 0) === 0) return;
    claimed = true;

    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, status: 'active' })
      .where(eq(users.id, row.userId));

    // Every other outstanding link for this user dies here: a reset is the
    // moment to assume the older ones are somewhere they should not be.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, row.userId), isNull(passwordResetTokens.usedAt)));

    await logActivity(tx, {
      userId: row.userId,
      entityType: 'user',
      entityId: row.userId,
      action: 'update',
      before: null,
      // Never the hash, never the password. What is recorded is that it changed.
      after: { passwordReset: true, at: now.toISOString() },
    });
  });

  return claimed ? { ok: true, email: row.email } : { ok: false, reason: 'used' };
}

/** Housekeeping for the cron: spent and expired rows are not evidence of anything. */
export async function purgeUsedResetTokens(
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<number> {
  const [before] = await database
    .select({ count: sql<number>`count(*)` })
    .from(passwordResetTokens)
    .where(
      sql`${passwordResetTokens.expiresAt} < ${now} or ${passwordResetTokens.usedAt} is not null`,
    );

  const deletable = Number(before?.count ?? 0);
  if (deletable > 0) {
    await database
      .delete(passwordResetTokens)
      .where(
        sql`${passwordResetTokens.expiresAt} < ${now} or ${passwordResetTokens.usedAt} is not null`,
      );
  }
  return deletable;
}
