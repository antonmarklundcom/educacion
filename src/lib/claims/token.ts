/**
 * The claim token (PR-22).
 *
 * A bearer credential with a 72-hour life that, when redeemed, mints a login
 * for an institution. It is the most sensitive string this codebase produces
 * after the session cookie, so the three properties the acceptance criteria ask
 * for are implemented here and asserted in `token.test.ts`: **single-use**,
 * **hashed at rest**, **expiring in 72 h**.
 *
 * ### Why an opaque random token and not a signed one
 *
 * A signed token (HMAC/JWT) carries its own claim id and expiry and needs no
 * row to be verified — which sounds like less state until single-use is
 * required, at which point a used-token store has to exist anyway. It also
 * cannot be revoked: an admin who rejects a claim after the mail went out has
 * nothing to delete. So the token is 32 bytes of `randomBytes`, meaningless on
 * its own, and every property of it is a column on the `claims` row it names.
 *
 * ### Why the hash here is *not* `lib/privacy/hash.ts`
 *
 * That module salts with `PRIVACY_SALT` and, when the salt is unset, falls back
 * to a **random per-process salt** — correct for IP hashes, where an unstable
 * salt costs a rate-limit window, and quietly catastrophic here: every
 * outstanding claim link would stop working on the next deploy or idle recycle,
 * and the failure would look like "the link is invalid" to a university.
 *
 * The salt buys nothing here in any case. It exists because an IP address has
 * ~2^32 possible values and is therefore enumerable against a bare digest; a
 * claim token has 2^256, so a plain SHA-256 of it is already a one-way function
 * with no dictionary to attack. What matters — that the database never holds
 * the token itself, so a leaked backup or a read-only SQL injection cannot mint
 * a login — is fully delivered by the unsalted digest.
 *
 * The stored digest is the full 64 hex characters, which is exactly
 * `claims.token_hash`'s width, and carries the unique index that makes
 * redemption an O(1) lookup.
 */

import { createHash, randomBytes } from 'node:crypto';

/** 72 hours, per PR-22's acceptance criteria. */
export const CLAIM_TTL_HOURS = 72;

/** 256 bits. base64url so it survives every mail client without escaping. */
const TOKEN_BYTES = 32;

export interface ClaimToken {
  /** Goes in the emailed link. Never stored, never logged. */
  token: string;
  /** Goes in `claims.token_hash`. */
  tokenHash: string;
}

export function createClaimToken(): ClaimToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashClaimToken(token) };
}

/** SHA-256 hex. Stable across restarts and deploys — see the note above. */
export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

/** When a token minted now stops working. */
export function claimExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CLAIM_TTL_HOURS * 60 * 60 * 1000);
}

/** The subset of a `claims` row that decides whether its token still works. */
export interface RedeemableClaim {
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: Date;
  domainVerified: boolean;
  decidedByUserId: number | null;
}

export type ClaimTokenState = 'ok' | 'used' | 'expired' | 'awaiting_review';

/**
 * The gate, restated as a pure function so its truth table is a test.
 *
 * Three independent conditions, and all three have to hold:
 *
 * 1. **`pending`.** Redemption flips the status, so any other value means the
 *    token was already spent (or the claim was rejected). This is what makes it
 *    single-use — enforced for real by a conditional `UPDATE … WHERE status =
 *    'pending'` in `redeemClaim`, which is atomic where this check is not.
 * 2. **Not expired.** 72 hours from when the token was minted, and an admin
 *    approval mints a fresh one rather than reviving a stale link.
 * 3. **Verified or approved.** Either the address was on the institution's own
 *    domain, or a human said yes. A token can only be *sent* when one of those
 *    holds, so re-checking it at redemption is redundant by construction — and
 *    it is exactly the kind of redundancy that survives someone later adding a
 *    third way to create a claim row.
 */
export function claimTokenState(claim: RedeemableClaim, now: Date = new Date()): ClaimTokenState {
  if (claim.status !== 'pending') return 'used';
  if (claim.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (!claim.domainVerified && claim.decidedByUserId == null) return 'awaiting_review';
  return 'ok';
}
