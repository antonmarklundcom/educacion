import { describe, expect, it } from 'vitest';

import {
  RESET_LINK_INVALID,
  RESET_REQUESTED,
  RESET_TTL_MS,
  generateResetToken,
  hashResetToken,
  resetEmailBody,
  resetExpiry,
  resetTokenProblem,
  type StoredResetToken,
} from './reset';

const NOW = new Date('2026-08-08T12:00:00Z');
const stored = (overrides: Partial<StoredResetToken> = {}): StoredResetToken => ({
  userId: 1,
  expiresAt: new Date(NOW.getTime() + 60_000),
  usedAt: null,
  ...overrides,
});

describe('generateResetToken', () => {
  it('is URL-safe, so it survives being pasted out of an email client', () => {
    expect(generateResetToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is long enough not to be guessed', () => {
    // 32 bytes → 43 base64url characters.
    expect(generateResetToken().length).toBeGreaterThanOrEqual(43);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateResetToken));
    expect(tokens.size).toBe(200);
  });
});

describe('hashResetToken', () => {
  it('is stable, so the emailed token finds its row', () => {
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
  });

  it('is a sha256 hex digest that fits the 64-char column', () => {
    expect(hashResetToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  // The point of hashing: a database dump is not a set of working links.
  it('does not contain the token', () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).not.toContain(token);
  });
});

describe('resetExpiry', () => {
  it('is one hour out', () => {
    expect(resetExpiry(NOW).getTime() - NOW.getTime()).toBe(RESET_TTL_MS);
  });
});

describe('resetTokenProblem', () => {
  it('accepts a fresh, unused token', () => {
    expect(resetTokenProblem(stored(), NOW)).toBeNull();
  });

  it('rejects a token nobody issued', () => {
    expect(resetTokenProblem(null, NOW)).toBe('unknown');
  });

  it('rejects a spent token', () => {
    expect(resetTokenProblem(stored({ usedAt: new Date() }), NOW)).toBe('already_used');
  });

  it('rejects an expired one, and treats the exact expiry instant as expired', () => {
    expect(resetTokenProblem(stored({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(
      'expired',
    );
    expect(resetTokenProblem(stored({ expiresAt: NOW }), NOW)).toBe('expired');
  });

  it('checks spent before expired, so a used token is never reported as merely late', () => {
    const both = stored({ usedAt: new Date(), expiresAt: new Date(NOW.getTime() - 1) });
    expect(resetTokenProblem(both, NOW)).toBe('already_used');
  });
});

describe('the messages', () => {
  // Both of these exist to avoid confirming whether an account or a link is
  // real. A test is the cheapest way to stop a well-meaning edit undoing that.
  it('says nothing about whether the address exists', () => {
    expect(RESET_REQUESTED).toMatch(/si ese correo/i);
    expect(RESET_REQUESTED).not.toMatch(/no existe|no encontramos|no tiene cuenta/i);
  });

  it('does not distinguish an expired link from an unknown or spent one', () => {
    expect(RESET_LINK_INVALID).not.toMatch(/ya fue usado|expiró hace|no existe/i);
  });

  it('tells the recipient what to do if they did not ask for it', () => {
    const body = resetEmailBody('https://educacion.com.py/restablecer?token=x');
    expect(body).toContain('https://educacion.com.py/restablecer?token=x');
    expect(body).toMatch(/si no pediste/i);
    expect(body).toMatch(/1 hora/);
  });
});
