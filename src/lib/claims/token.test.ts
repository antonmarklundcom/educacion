/**
 * The token's three promises (PR-22): **single-use**, **hashed at rest**,
 * **72 h**. Two of them are properties of this module; the third — single-use —
 * is only half here, because the guarantee that actually holds under a race is
 * the conditional `UPDATE` in `redeemClaim`. What `claimTokenState` gives is the
 * truth table, and `claims.access.test.ts` checks that a spent token cannot
 * reach a write.
 */

import { describe, expect, it } from 'vitest';

import {
  CLAIM_TTL_HOURS,
  claimExpiry,
  claimTokenState,
  createClaimToken,
  hashClaimToken,
  type RedeemableClaim,
} from './token';

describe('createClaimToken', () => {
  it('produces a URL-safe token with no padding', () => {
    const { token } = createClaimToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes in base64url.
    expect(token.length).toBe(43);
  });

  it('never repeats — 256 bits, so a collision here means the RNG is broken', () => {
    const seen = new Set(Array.from({ length: 500 }, () => createClaimToken().token));
    expect(seen.size).toBe(500);
  });

  it('returns the hash of the token it returns, and never the token itself', () => {
    const { token, tokenHash } = createClaimToken();
    expect(tokenHash).toBe(hashClaimToken(token));
    expect(tokenHash).not.toContain(token);
  });
});

describe('hashClaimToken', () => {
  /** `claims.token_hash` is varchar(64). A wider digest would silently truncate. */
  it('is 64 hex characters, exactly the column width', () => {
    expect(hashClaimToken('cualquier-cosa')).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * The property that made this *not* use `lib/privacy/hash.ts`: that module
   * falls back to a random per-process salt, which would invalidate every
   * outstanding claim link on the next deploy.
   */
  it('is stable — the same token hashes the same way every time', () => {
    expect(hashClaimToken('abc')).toBe(hashClaimToken('abc'));
    expect(hashClaimToken('abc')).not.toBe(hashClaimToken('abd'));
  });

  it('tolerates the whitespace a mail client adds around a pasted link', () => {
    expect(hashClaimToken(' abc\n')).toBe(hashClaimToken('abc'));
  });
});

describe('claimExpiry', () => {
  it('is 72 hours, as the acceptance criteria say', () => {
    const now = new Date('2026-08-08T12:00:00Z');
    expect(claimExpiry(now).toISOString()).toBe('2026-08-11T12:00:00.000Z');
    expect(CLAIM_TTL_HOURS).toBe(72);
  });
});

describe('claimTokenState — the gate', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const live: RedeemableClaim = {
    status: 'pending',
    expiresAt: new Date('2026-08-09T12:00:00Z'),
    domainVerified: true,
    decidedByUserId: null,
  };

  it('a live, domain-verified claim is redeemable', () => {
    expect(claimTokenState(live, now)).toBe('ok');
  });

  it('an admin-approved claim is redeemable without domain verification', () => {
    expect(claimTokenState({ ...live, domainVerified: false, decidedByUserId: 1 }, now)).toBe('ok');
  });

  /** The acceptance criterion, negatively: neither verified nor approved is not a claim. */
  it('neither verified nor approved is never redeemable', () => {
    expect(claimTokenState({ ...live, domainVerified: false, decidedByUserId: null }, now)).toBe(
      'awaiting_review',
    );
  });

  it('a spent token is used, whatever else is true of it', () => {
    expect(claimTokenState({ ...live, status: 'approved' }, now)).toBe('used');
    expect(claimTokenState({ ...live, status: 'rejected' }, now)).toBe('used');
    expect(claimTokenState({ ...live, status: 'expired' }, now)).toBe('used');
  });

  it('expires exactly at the boundary, not a millisecond after', () => {
    expect(claimTokenState({ ...live, expiresAt: now }, now)).toBe('expired');
    expect(claimTokenState({ ...live, expiresAt: new Date(now.getTime() + 1) }, now)).toBe('ok');
  });

  /** Status is checked before expiry: a used token is used, not "expired". */
  it('reports a used token as used even after it would have expired', () => {
    expect(
      claimTokenState({ ...live, status: 'approved', expiresAt: new Date('2020-01-01') }, now),
    ).toBe('used');
  });
});
