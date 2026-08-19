/**
 * `loginAction`'s ordering, which is the half of PR-42 that unit-testing the
 * limiter in isolation cannot reach.
 *
 * The review of the first revision made the point exactly: a test that calls
 * `loginAllowed()` twice and compares the answers is a tautology over its own
 * fixture — it would still pass if somebody moved the limiter call *below*
 * `findAccountByEmail`, which is the thing the "no enumeration oracle" and "a
 * flood never reaches the database" claims actually rest on. So this file
 * asserts the call order in the action itself.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetRateLimitForTests } from '@/lib/leads/rate-limit';
import { __resetSaltForTests } from '@/lib/privacy/hash';

const findAccountByEmail = vi.fn();
const resolveInstitutionScope = vi.fn();
const recordLogin = vi.fn();
const setPassword = vi.fn();
const authenticate = vi.fn();
const startSession = vi.fn();

vi.mock('@/db/queries/auth', () => ({
  findAccountByEmail: (...args: unknown[]) => findAccountByEmail(...args),
  resolveInstitutionScope: (...args: unknown[]) => resolveInstitutionScope(...args),
  recordLogin: (...args: unknown[]) => recordLogin(...args),
  setPassword: (...args: unknown[]) => setPassword(...args),
}));

vi.mock('@/lib/auth/login', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/login')>();
  return { ...actual, authenticate: (...args: unknown[]) => authenticate(...args) };
});

vi.mock('@/lib/auth/session', () => ({
  startSession: (...args: unknown[]) => startSession(...args),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to });
  },
}));

const { loginAction } = await import('./actions');
const { LOGIN_ERROR } = await import('@/lib/auth/login');
const { LOGIN_RATE_LIMITED, LOGIN_ACCOUNT_RULES, LOGIN_IP_RULES } =
  await import('@/lib/auth/rate-limit');

function form(email: string, password: string): FormData {
  const data = new FormData();
  data.set('email', email);
  data.set('password', password);
  return data;
}

/** Exhaust the (address, IP) tier the way a wrong password would. */
async function failUntilBlocked(email: string): Promise<void> {
  authenticate.mockResolvedValue({ ok: false, reason: 'wrong_password' });
  for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit; attempt += 1) {
    await loginAction({}, form(email, 'incorrecta'));
  }
}

beforeEach(() => {
  __resetRateLimitForTests();
  __resetSaltForTests();
  vi.clearAllMocks();
  findAccountByEmail.mockResolvedValue(null);
  resolveInstitutionScope.mockResolvedValue(null);
});

describe('loginAction — the limiter runs before the database', () => {
  it('does not look an address up once the attempt is rate limited', async () => {
    await failUntilBlocked('persona@ejemplo.test');
    findAccountByEmail.mockClear();
    authenticate.mockClear();

    const state = await loginAction({}, form('persona@ejemplo.test', 'incorrecta'));

    expect(state.error).toBe(LOGIN_RATE_LIMITED);
    // Both claims in one assertion: a flood never reaches MySQL, and the
    // limiter cannot be an enumeration oracle because it never learns whether
    // the address exists.
    expect(findAccountByEmail).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rate limits an unknown address exactly as it does a real one', async () => {
    findAccountByEmail.mockResolvedValue(null);
    await failUntilBlocked('no-existe@ejemplo.test');
    const unknown = await loginAction({}, form('no-existe@ejemplo.test', 'incorrecta'));

    __resetRateLimitForTests();
    findAccountByEmail.mockResolvedValue({
      id: 1,
      passwordHash: 'hash',
      role: 'institution',
      status: 'active',
      mustChangePassword: false,
    });
    await failUntilBlocked('existe@ejemplo.test');
    const existing = await loginAction({}, form('existe@ejemplo.test', 'incorrecta'));

    expect(unknown).toEqual(existing);
  });
});

describe('loginAction — the failure path is untouched', () => {
  it.each([
    'unknown_email',
    'wrong_password',
    'no_password_set',
    'suspended',
    'invalid_input',
  ] as const)('still returns the uniform message for %s', async (reason) => {
    authenticate.mockResolvedValue({ ok: false, reason });

    const state = await loginAction({}, form('persona@ejemplo.test', 'incorrecta'));

    expect(state.error).toBe(LOGIN_ERROR);
    // The reason never reaches the caller.
    expect(JSON.stringify(state)).not.toContain(reason);
  });

  it('never logs the address in plaintext', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    authenticate.mockResolvedValue({ ok: false, reason: 'wrong_password' });

    await loginAction({}, form('persona@ejemplo.test', 'incorrecta'));

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('persona@ejemplo.test');
    warn.mockRestore();
  });
});

describe('loginAction — a concurrent burst is counted as it arrives', () => {
  it('admits no more than the limit even when every request is in flight at once', async () => {
    // The regression this design exists for: peeking now and charging after
    // `authenticate()` leaves three awaits in the window, so every concurrent
    // request peeks before any of them records and the limit stops binding —
    // a burst bounded only by the attacker's connection count, on the one
    // endpoint that runs a deliberately expensive KDF.
    authenticate.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, reason: 'wrong_password' }), 5),
        ),
    );

    const burst = await Promise.all(
      Array.from({ length: 50 }, () => loginAction({}, form('victima@ejemplo.test', 'incorrecta'))),
    );

    const limited = burst.filter((state) => state.error === LOGIN_RATE_LIMITED).length;
    expect(authenticate.mock.calls.length).toBeLessThanOrEqual(LOGIN_ACCOUNT_RULES[0].limit);
    expect(findAccountByEmail.mock.calls.length).toBeLessThanOrEqual(LOGIN_ACCOUNT_RULES[0].limit);
    expect(limited).toBe(50 - authenticate.mock.calls.length);
  });
});

const user = { id: 7, role: 'institution', institutionId: 3, mustChangePassword: false };

describe('loginAction — our own failures cost the user nothing', () => {
  it('refunds the attempt when the database is unreachable', async () => {
    // Otherwise one blip spends the quota of every user waiting on it, and
    // then tells them they tried too often.
    findAccountByEmail.mockRejectedValue(new Error('ECONNREFUSED'));

    for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit + 2; attempt += 1) {
      await expect(loginAction({}, form('persona@ejemplo.test', 'correcta'))).rejects.toThrow(
        'ECONNREFUSED',
      );
    }

    // The outage clears; the user has spent nothing.
    findAccountByEmail.mockResolvedValue(null);
    authenticate.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    const state = await loginAction({}, form('persona@ejemplo.test', 'incorrecta'));

    expect(state.error).toBe(LOGIN_ERROR);
  });
});

describe('loginAction — a burst of correct passwords from one address', () => {
  it('does not refuse legitimate simultaneous sign-ins behind one NAT', async () => {
    // Charging on entry makes the per-minute rule a concurrency cap too: an
    // attempt holds its charge until `authenticate()` returns, and that is the
    // slowest request on the site. A school lab or an institution's office all
    // signing in at the start of the day is the case §6.1 must tolerate.
    authenticate.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, user }), 5)),
    );

    const burst = await Promise.allSettled(
      Array.from({ length: 20 }, (_, index) =>
        loginAction({}, form(`persona-${index}@ejemplo.test`, 'correcta')),
      ),
    );

    // Every one redirects; none is turned away.
    const refused = burst.filter(
      (outcome) => outcome.status === 'fulfilled' && outcome.value?.error === LOGIN_RATE_LIMITED,
    );
    expect(refused).toHaveLength(0);
    expect(startSession).toHaveBeenCalledTimes(20);
  });
});

describe('loginAction — a success', () => {
  it('starts a session and clears the account quota', async () => {
    // Spend most of the account tier, then succeed.
    authenticate.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit - 1; attempt += 1) {
      await loginAction({}, form('persona@ejemplo.test', 'incorrecta'));
    }

    authenticate.mockResolvedValue({ ok: true, user });
    await expect(loginAction({}, form('persona@ejemplo.test', 'correcta'))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(startSession).toHaveBeenCalledWith(user);

    // The quota is forgotten, so a later typo does not resume where it left
    // off. A full run of failures must fit: with the settle, five slots are
    // free; without it the first of these is already refused. One trailing
    // failure would pass either way, which is what made an earlier version of
    // this test prove nothing.
    authenticate.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    for (let attempt = 0; attempt < LOGIN_ACCOUNT_RULES[0].limit; attempt += 1) {
      const state = await loginAction({}, form('persona@ejemplo.test', 'incorrecta'));
      expect(state.error, `#${attempt}`).toBe(LOGIN_ERROR);
    }
  });

  it('does not spend IP budget on a successful sign-in', async () => {
    authenticate.mockResolvedValue({ ok: true, user });

    for (let attempt = 0; attempt < LOGIN_IP_RULES[0].limit * 2; attempt += 1) {
      await expect(
        loginAction({}, form(`persona-${attempt}@ejemplo.test`, 'correcta')),
      ).rejects.toThrow('NEXT_REDIRECT');
    }

    // A shared address — school lab, cyber café, one institution's office —
    // must not lock itself out by signing in (architecture.md §6.1).
    authenticate.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    const state = await loginAction({}, form('otra@ejemplo.test', 'incorrecta'));
    expect(state.error).toBe(LOGIN_ERROR);
  });
});
