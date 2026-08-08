/**
 * Account reads and writes (CLAUDE.md rule 5 — all SQL lives here).
 *
 * Everything in this file is about *who someone is*. It deliberately knows
 * nothing about what they may do: that is `src/lib/auth/roles.ts`, which is
 * pure and therefore testable without MySQL. Keeping the two apart is what
 * lets PR-18's acceptance criterion — the negative authorization cases — be
 * asserted directly rather than through a live database.
 *
 * The session's institution scope comes from here and only from here, and it
 * is resolved at **login** time from `users.institution_id` plus
 * `institution_members`. A membership revoked mid-session therefore survives
 * until the cookie expires or the user signs in again; that is the accepted
 * cost of not hitting the database on every request, and eight hours
 * (`SESSION_TTL_SECONDS`) is the bound on it.
 */

import { and, eq, isNull, lt, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { institutionMembers, passwordResetTokens, users } from '@/db/schema';
import type { StoredResetToken } from '@/lib/auth/reset';
import type { SessionUser, UserRole } from '@/lib/auth/session';

export interface AccountRow {
  id: number;
  email: string;
  name: string | null;
  passwordHash: string | null;
  role: UserRole;
  institutionId: number | null;
  status: string;
  mustChangePassword: boolean;
}

/**
 * Look an account up by email, case- and whitespace-insensitively.
 *
 * Returns the row whatever its status; the login path decides what an
 * `invited` or `disabled` account means. Deciding that here would tempt a
 * caller into treating "no row" and "disabled row" differently in a way an
 * attacker can time.
 */
export async function findAccountByEmail(
  email: string,
  db: Db = defaultDb,
): Promise<AccountRow | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      role: users.role,
      institutionId: users.institutionId,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalized))
    .limit(1);

  return row ?? null;
}

/**
 * The institution a session is scoped to.
 *
 * `users.institution_id` is the denormalized common case; `institution_members`
 * is the real record. A member row wins when the two disagree, and a user
 * belonging to more than one institution gets **none** of them — a session
 * cannot be scoped to two institutions at once, and silently picking the
 * lowest id would give someone access they did not ask for. That user needs an
 * institution switcher, which is PR-21's problem, not a default here.
 */
export async function resolveInstitutionScope(
  userId: number,
  fallback: number | null,
  db: Db = defaultDb,
): Promise<number | null> {
  const memberships = await db
    .select({ institutionId: institutionMembers.institutionId })
    .from(institutionMembers)
    .where(eq(institutionMembers.userId, userId));

  if (memberships.length === 1) return memberships[0].institutionId;
  if (memberships.length > 1) return null;
  return fallback;
}

/** The stored hash for a signed-in user, for re-authenticating a sensitive action. */
export async function findPasswordHash(userId: number, db: Db = defaultDb): Promise<string | null> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.passwordHash ?? null;
}

/** Record a successful sign-in. Best-effort: a failed write must not fail login. */
export async function recordLogin(userId: number, db: Db = defaultDb): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function setPassword(
  userId: number,
  passwordHash: string,
  options: { mustChangePassword?: boolean } = {},
  db: Db = defaultDb,
): Promise<void> {
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: options.mustChangePassword ?? false,
      status: 'active',
    })
    .where(eq(users.id, userId));
}

/** Does any usable staff account exist? The bootstrap script's guard. */
export async function hasActiveAdmin(db: Db = defaultDb): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
    .limit(1);
  return row != null;
}

/* ------------------------------- password reset --------------------------- */

/**
 * Issue a reset token, invalidating every outstanding one for that user.
 *
 * Marking the old tokens used rather than deleting them means a second request
 * silently voids the first link — so an attacker who triggers a reset cannot
 * leave a valid token lying around after the real owner requests their own.
 */
export async function createResetToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
  db: Db = defaultDb,
): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));

  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

export async function findResetToken(
  tokenHash: string,
  db: Db = defaultDb,
): Promise<StoredResetToken | null> {
  const [row] = await db
    .select({
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/**
 * Spend a token, or report that someone else already did.
 *
 * The `used_at IS NULL` predicate is inside the UPDATE, so the database — not
 * this process — decides the winner when the same link is submitted twice at
 * once. A read-then-write would let both submissions pass the check.
 */
export async function consumeResetToken(tokenHash: string, db: Db = defaultDb): Promise<boolean> {
  const [result] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)));
  return result.affectedRows === 1;
}

/** Housekeeping: spent and expired tokens are not worth keeping. */
export async function deleteStaleResetTokens(before: Date, db: Db = defaultDb): Promise<number> {
  const [result] = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, before));
  return result.affectedRows;
}

export async function createAccount(
  input: {
    email: string;
    name: string | null;
    passwordHash: string;
    role: UserRole;
    institutionId?: number | null;
    mustChangePassword?: boolean;
  },
  db: Db = defaultDb,
): Promise<number> {
  const [result] = await db.insert(users).values({
    email: input.email.trim().toLowerCase(),
    name: input.name,
    passwordHash: input.passwordHash,
    role: input.role,
    institutionId: input.institutionId ?? null,
    status: 'active',
    mustChangePassword: input.mustChangePassword ?? false,
  });
  return result.insertId;
}

/** The account row as the cookie will carry it. */
export function toSessionUser(account: AccountRow, institutionId: number | null): SessionUser {
  return {
    id: account.id,
    role: account.role,
    institutionId,
    mustChangePassword: account.mustChangePassword,
  };
}
