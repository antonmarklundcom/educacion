/**
 * `loginAction`'s **input** handling (PR-51).
 *
 * A companion to `actions.test.ts`, which owns the ordering claims PR-42
 * settled — the limiter before the lookup, the charge before the outcome. This
 * file is the other half the audit found missing: what the action does with a
 * form that is not a credential at all.
 *
 * Two properties, and the second is the one worth reviewing:
 *
 * 1. **Malformed input is refused before any query runs.** Not "returns an
 *    error": `findAccountByEmail` must not be called, because a public endpoint
 *    that reaches the database on garbage is a free amplifier.
 * 2. **The refusal is the same sentence as a wrong password.** A distinct
 *    "correo inválido" would make this form answer "that address is malformed"
 *    and "that address does not exist" differently, which is an account oracle.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LOGIN_ERROR } from '@/lib/auth/login';

const findAccountByEmail = vi.fn();
const authenticate = vi.fn();
const startSession = vi.fn();

vi.mock('@/db/queries/auth', () => ({
  findAccountByEmail: (...args: unknown[]) => findAccountByEmail(...args),
  recordLogin: vi.fn(),
  resolveInstitutionScope: async () => null,
  setPassword: vi.fn(),
}));

vi.mock('@/lib/auth/login', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/login')>('@/lib/auth/login');
  return { ...actual, authenticate: (...args: unknown[]) => authenticate(...args) };
});

vi.mock('@/lib/auth/session', () => ({ startSession: (...a: unknown[]) => startSession(...a) }));
vi.mock('@/lib/privacy/server-request', () => ({ clientIpHash: async () => 'ip-hash' }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { loginAction } = await import('./actions');

function form(entries: Record<string, unknown>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === 'string') data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  findAccountByEmail.mockReset();
  authenticate.mockReset();
  startSession.mockReset();
  findAccountByEmail.mockResolvedValue(null);
  authenticate.mockResolvedValue({ ok: false, reason: 'unknown_account' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('bad input never reaches a query', () => {
  it.each([
    ['no fields at all', {}],
    ['no password', { email: 'ana@example.com' }],
    ['no email', { password: 'una contraseña larga' }],
    ['a blank email', { email: '   ', password: 'una contraseña larga' }],
    [
      'an email over the column length',
      { email: `${'a'.repeat(260)}@x.com`, password: 'abcdefghijkl' },
    ],
    [
      'a password longer than anything we hash',
      { email: 'ana@example.com', password: 'x'.repeat(2000) },
    ],
  ])('refuses %s without a database read', async (_case, entries) => {
    const state = await loginAction({}, form(entries));
    expect(state.error).toBe(LOGIN_ERROR);
    expect(findAccountByEmail).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('answers a malformed address exactly as it answers a wrong password', async () => {
    const malformed = await loginAction({}, form({ email: '', password: 'x' }));
    const wrong = await loginAction(
      {},
      form({ email: 'ana@example.com', password: 'nope-nope-nope' }),
    );
    expect(malformed.error).toBe(wrong.error);
  });
});

describe('what reaches the query', () => {
  it('hands the credential through intact, trimmed of the spaces a phone adds', async () => {
    await loginAction({}, form({ email: '  Ana@Example.com  ', password: ' secreto largo ' }));
    expect(findAccountByEmail).toHaveBeenCalledWith('Ana@Example.com');
    // The password is not trimmed: its leading and trailing spaces are the
    // user's, and trimming them would refuse a password that was set with them.
    expect(authenticate).toHaveBeenCalledWith(null, ' secreto largo ', null);
  });

  it('starts no session when authentication failed', async () => {
    await loginAction({}, form({ email: 'ana@example.com', password: 'una contraseña larga' }));
    expect(startSession).not.toHaveBeenCalled();
  });
});
