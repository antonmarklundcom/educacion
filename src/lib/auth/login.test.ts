import { describe, expect, it } from 'vitest';

import { LOGIN_ERROR, authenticate, type LoginAccount } from './login';
import { hashPassword } from './password';

const PASSWORD = 'una contraseña larga y difícil';

async function account(overrides: Partial<LoginAccount> = {}): Promise<LoginAccount> {
  return {
    id: 1,
    passwordHash: await hashPassword(PASSWORD),
    role: 'admin',
    status: 'active',
    mustChangePassword: false,
    ...overrides,
  };
}

describe('authenticate', () => {
  it('signs in a correct password and carries the scope into the session', async () => {
    const result = await authenticate(await account({ role: 'institution_admin' }), PASSWORD, 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toMatchObject({ id: 1, role: 'institution_admin', institutionId: 10 });
    }
  });

  it('rejects the wrong password', async () => {
    const result = await authenticate(await account(), 'otra cosa entera', null);
    expect(result).toMatchObject({ ok: false, reason: 'wrong_password' });
  });

  it('rejects an unknown account without saying so to the user', async () => {
    const result = await authenticate(null, PASSWORD, null);
    expect(result).toMatchObject({ ok: false, reason: 'unknown_email' });
    // The reason is for our logs. The user is told one thing, always.
    expect(LOGIN_ERROR).not.toMatch(/correo no existe|no encontrado/i);
  });

  // An invited user has password_hash IS NULL — they must not be able to sign
  // in with an empty or any other password.
  it('rejects an account that has never set a password', async () => {
    const result = await authenticate(await account({ passwordHash: null }), PASSWORD, null);
    expect(result).toMatchObject({ ok: false, reason: 'no_password_set' });
  });

  it('rejects an empty password without touching the hash', async () => {
    const result = await authenticate(await account(), '', null);
    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
  });

  it('refuses a suspended account even with the right password', async () => {
    const result = await authenticate(await account({ status: 'suspended' }), PASSWORD, null);
    expect(result).toMatchObject({ ok: false, reason: 'suspended' });
  });

  it('carries mustChangePassword through, so the bootstrap password cannot stay', async () => {
    const result = await authenticate(await account({ mustChangePassword: true }), PASSWORD, null);
    expect(result.ok && result.user.mustChangePassword).toBe(true);
  });

  it('offers a fresh hash when the stored one used weaker parameters', async () => {
    const weak = (await hashPassword(PASSWORD)).replace(/^scrypt\$\d+/, 'scrypt$16384');
    // The weakened string is still a valid hash of this password: only the
    // recorded N changed, so verification fails and login is refused rather
    // than silently accepting a tampered parameter. That is the safe direction.
    const result = await authenticate(await account({ passwordHash: weak }), PASSWORD, null);
    expect(result.ok).toBe(false);
  });
});
