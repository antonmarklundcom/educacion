import { describe, expect, it } from 'vitest';

import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  needsRehash,
  passwordProblem,
  verifyPassword,
} from './password';

// scrypt at OWASP parameters is intentionally slow; these run a handful of
// derivations, not hundreds.
const PASSWORD = 'una contraseña larga y difícil';

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD + 'x', hash)).toBe(false);
  });

  it('salts: the same password hashes differently every time', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('stores no plaintext', async () => {
    expect(await hashPassword(PASSWORD)).not.toContain('contraseña');
  });

  it('records its parameters, so they can be raised without a migration', async () => {
    expect(await hashPassword(PASSWORD)).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/);
  });

  // An invited user has password_hash IS NULL. Login must fail like any wrong
  // password rather than throwing, which would reveal that the account exists.
  it('returns false, not an error, for a missing or malformed hash', async () => {
    expect(await verifyPassword(PASSWORD, null)).toBe(false);
    expect(await verifyPassword(PASSWORD, undefined)).toBe(false);
    expect(await verifyPassword(PASSWORD, '')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'not-a-hash')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'scrypt$0$0$0$$')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'bcrypt$2b$10$abc')).toBe(false);
  });

  it('accepts a unicode password normalized either way', async () => {
    const composed = 'contraseña-única-larga';
    const hash = await hashPassword(composed.normalize('NFC'));
    expect(await verifyPassword(composed.normalize('NFD'), hash)).toBe(true);
  });
});

describe('needsRehash', () => {
  it('flags a hash made with weaker parameters', async () => {
    const current = await hashPassword(PASSWORD);
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash(current.replace(/^scrypt\$\d+/, 'scrypt$16384'))).toBe(true);
  });

  it('flags anything it cannot read at all', () => {
    expect(needsRehash('$2b$10$something')).toBe(true);
    expect(needsRehash(null)).toBe(false); // nothing to rehash
  });
});

describe('passwordProblem', () => {
  it('rejects a short password with a message in voseo', () => {
    expect(passwordProblem('corta')).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('accepts a long one', () => {
    expect(passwordProblem(PASSWORD)).toBeNull();
  });

  it('does not impose composition rules', () => {
    expect(passwordProblem('caballo correcto batería grapa')).toBeNull();
  });
});
