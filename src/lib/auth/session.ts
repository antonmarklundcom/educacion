/**
 * The session cookie.
 *
 * One rule governs this file: **nothing the client sends is trusted except the
 * sealed cookie itself.** iron-session encrypts and signs the payload with
 * `SESSION_SECRET`, so a user cannot edit their own role — but that guarantee
 * only holds if the role is never read from anywhere else. There is no
 * `x-user-role` header, no role in a query string, and no client component
 * that reports who it thinks it is (CLAUDE.md rule 4).
 *
 * What the cookie carries is deliberately minimal: an id, a role, and the
 * institution scope. Anything else — name, email, plan — is read from the
 * database at use time, so revoking access takes effect on the next request
 * rather than whenever a stale cookie happens to expire.
 */

import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

import type { USER_ROLE } from '@/db/schema';

export type UserRole = (typeof USER_ROLE)[number];

export interface SessionUser {
  id: number;
  role: UserRole;
  /**
   * The institution this session is scoped to, or null for staff. Every
   * institution-scoped read filters on this — never on a value from the
   * request (`scopeToInstitution`).
   */
  institutionId: number | null;
  /** Set at login when the bootstrap or a reset issued a temporary password. */
  mustChangePassword: boolean;
}

export interface SessionData {
  user?: SessionUser;
}

export const SESSION_COOKIE = 'educacion_session';

/** Eight hours: a working day, not a month. Re-login is cheap; a stolen
 * long-lived cookie is not. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // Failing loudly at boot beats running with a guessable secret. A
    // development default would inevitably reach production — that is exactly
    // the "seeded default credentials" failure PR-18 is asked to prevent.
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. Generate one with ' +
        '`openssl rand -base64 32` and set it in the environment (docs/deployment.md §5).',
    );
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName: SESSION_COOKIE,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // Off in development only, where there is no TLS to be secure over.
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** The signed-in user, or null. Never throws — callers decide what absence means. */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const session = await getSession();
    return session.user ?? null;
  } catch {
    // A malformed or undecryptable cookie is an anonymous request, not a crash.
    return null;
  }
}

export async function startSession(user: SessionUser): Promise<void> {
  const session = await getSession();
  session.user = user;
  await session.save();
}

export async function endSession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}
