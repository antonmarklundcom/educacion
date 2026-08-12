import { describe, expect, it } from 'vitest';

import {
  RESET_TTL_MINUTES,
  createResetToken,
  hashResetToken,
  resetExpiry,
  resetTokenState,
} from './reset-token';

const NOW = new Date('2026-08-12T10:00:00.000Z');

describe('createResetToken', () => {
  it('never returns the same token twice', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createResetToken().token));
    expect(tokens.size).toBe(200);
  });

  it('stores a digest, never the token', () => {
    const { token, tokenHash } = createResetToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(token);
    expect(hashResetToken(token)).toBe(tokenHash);
  });

  it('is URL-safe, so a mail client cannot mangle it', () => {
    expect(createResetToken().token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('tolerates the whitespace a mail client adds around a pasted link', () => {
    const { token, tokenHash } = createResetToken();
    expect(hashResetToken(`  ${token}\n`)).toBe(tokenHash);
  });
});

describe('resetExpiry', () => {
  it('is one hour out — far shorter than a claim link, and why is in the docstring', () => {
    expect(resetExpiry(NOW).getTime() - NOW.getTime()).toBe(RESET_TTL_MINUTES * 60 * 1000);
    expect(RESET_TTL_MINUTES).toBe(60);
  });
});

describe('resetTokenState', () => {
  it('accepts a fresh unused token', () => {
    expect(resetTokenState({ expiresAt: resetExpiry(NOW), usedAt: null }, NOW)).toBe('ok');
  });

  it('refuses an expired one, at the boundary', () => {
    expect(resetTokenState({ expiresAt: NOW, usedAt: null }, NOW)).toBe('expired');
  });

  it('says "used" before "expired" — that is the fact the person can act on', () => {
    const row = { expiresAt: new Date(NOW.getTime() - 1), usedAt: new Date(NOW.getTime() - 10) };
    expect(resetTokenState(row, NOW)).toBe('used');
  });
});
