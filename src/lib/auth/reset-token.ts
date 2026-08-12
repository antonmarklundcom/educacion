/**
 * The password-reset token (PR-35).
 *
 * PR-18 deferred this flow and wrote *"do not ship `/panel` to real
 * institutions without it"*; PR-21 §15.4 repeated it. This is that token, and
 * it is deliberately the same shape as PR-22's claim token
 * (`architecture.md` §16.1) — opaque, random, hashed at rest, single-use,
 * expiring — because it is the same class of thing: a string in an inbox that
 * turns into a login.
 *
 * ### Why one hour and not seventy-two
 *
 * A claim link is sent to somebody who may need to forward it to a colleague
 * with the authority to accept, so 72 h is a usability requirement. A reset
 * link is sent to a person who just clicked "olvidé mi contraseña" and is
 * sitting in front of their inbox. The shorter the window, the smaller the
 * chance the link is still live when it is later found in a forwarded thread, a
 * shared laptop or a mail archive — and one hour is long enough for a slow
 * mail server without being long enough to matter.
 *
 * ### The hash is unsalted SHA-256, again on purpose
 *
 * Same reasoning as §16.1: `lib/privacy/hash.ts` falls back to a random
 * per-process salt when `PRIVACY_SALT` is unset, which would silently
 * invalidate every outstanding link on a deploy. A 256-bit token has no
 * dictionary to attack, so the plain digest already delivers the property that
 * matters — the database never holds the token, so a leaked backup cannot mint
 * a login.
 */

import { createHash, randomBytes } from 'node:crypto';

/** One hour. See the docstring. */
export const RESET_TTL_MINUTES = 60;

/**
 * An **admin-issued** access link lives 72 hours, not one (PR-36).
 *
 * The one-hour window above is calibrated for a link anybody can cause to be
 * sent, to an inbox we do not control, by typing an address into a public
 * form. An admin-issued link is a different object: a member of staff verified
 * who they are handing it to, and hands it over by WhatsApp or on the phone —
 * a channel where "open this within the hour" is a support ticket rather than
 * a security control. 72 h is the claim flow's window (§16.1) and is chosen
 * for the same reason: the recipient may need to find a moment.
 *
 * Everything else about the token is identical — same table, same digest, same
 * single-use `UPDATE`, same invalidation of the user's other links on
 * redemption. Only the clock differs.
 */
export const ADMIN_LINK_TTL_HOURS = 72;

const TOKEN_BYTES = 32;

export interface ResetToken {
  /** Goes in the emailed link. Never stored, never logged. */
  token: string;
  /** Goes in `password_reset_tokens.token_hash`. */
  tokenHash: string;
}

export function createResetToken(): ResetToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

export function resetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000);
}

/** Expiry for an admin-issued link. See `ADMIN_LINK_TTL_HOURS`. */
export function adminLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + ADMIN_LINK_TTL_HOURS * 60 * 60 * 1000);
}

/** The subset of the row that decides whether a token still works. */
export interface RedeemableReset {
  expiresAt: Date;
  usedAt: Date | null;
}

export type ResetTokenState = 'ok' | 'used' | 'expired';

/**
 * The gate as a pure function, so its truth table is a test.
 *
 * "Used" is checked before "expired" deliberately: a token that was used and
 * has since expired should tell the person it was already used, because that
 * is the fact they can act on — and, if they did not use it, the one they need
 * to worry about.
 *
 * This is a courtesy check. Single-use is enforced for real by the conditional
 * `UPDATE … WHERE used_at IS NULL` in `consumePasswordReset`, which is atomic
 * where this is not.
 */
export function resetTokenState(row: RedeemableReset, now: Date = new Date()): ResetTokenState {
  if (row.usedAt != null) return 'used';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'ok';
}
