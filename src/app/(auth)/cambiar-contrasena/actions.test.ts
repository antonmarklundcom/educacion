/**
 * `changePasswordAction`'s input handling (PR-51).
 *
 * The action guards an account takeover primitive: a password change that needs
 * no password. Three refusals have to happen before anything is written, and
 * one of them is not about validation at all — an unauthenticated caller must
 * be bounced, because a Server Action is a POST endpoint that never renders the
 * page's own guard.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPasswordHash = vi.fn();
const setPassword = vi.fn();
const verifyPassword = vi.fn();
let sessionUser: unknown = { id: 4, role: 'editor', institutionId: null, mustChangePassword: true };

vi.mock('@/db/queries/auth', () => ({
  findPasswordHash: (...a: unknown[]) => findPasswordHash(...a),
  setPassword: (...a: unknown[]) => setPassword(...a),
}));
vi.mock('@/lib/auth/password', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/password')>('@/lib/auth/password');
  return {
    ...actual,
    hashPassword: async () => 'scrypt$hash',
    verifyPassword: (...a: unknown[]) => verifyPassword(...a),
  };
});
vi.mock('@/lib/auth/session', () => ({
  currentUser: async () => sessionUser,
  startSession: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { changePasswordAction } = await import('./actions');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const GOOD = 'una contraseña bien larga';

beforeEach(() => {
  sessionUser = { id: 4, role: 'editor', institutionId: null, mustChangePassword: true };
  findPasswordHash.mockReset().mockResolvedValue('scrypt$old');
  setPassword.mockReset();
  verifyPassword.mockReset().mockResolvedValue(false);
});

describe('who may change a password', () => {
  it('redirects an unauthenticated caller instead of writing anything', async () => {
    sessionUser = null;
    await expect(
      changePasswordAction({}, form({ current: 'x', password: GOOD, confirm: GOOD })),
    ).rejects.toThrow('redirect:/ingresar');
    expect(setPassword).not.toHaveBeenCalled();
    expect(findPasswordHash).not.toHaveBeenCalled();
  });
});

describe('bad input never reaches a query', () => {
  it.each([
    ['the two new passwords differ', { current: 'x', password: GOOD, confirm: `${GOOD}!` }],
    ['the new password is too short', { current: 'x', password: 'corta', confirm: 'corta' }],
    ['nothing was submitted', {}],
  ])('refuses when %s', async (_case, entries) => {
    const state = await changePasswordAction({}, form(entries as Record<string, string>));
    expect(state.error).toBeTruthy();
    expect(findPasswordHash).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });
});

describe('the current password is still required', () => {
  it('refuses when it does not verify, even though the session is valid', async () => {
    verifyPassword.mockResolvedValue(false);
    const state = await changePasswordAction(
      {},
      form({ current: 'mal', password: GOOD, confirm: GOOD }),
    );
    expect(state.error).toBe('La contraseña actual no es correcta.');
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('refuses a new password identical to the current one', async () => {
    verifyPassword.mockResolvedValue(true);
    const state = await changePasswordAction(
      {},
      form({ current: GOOD, password: GOOD, confirm: GOOD }),
    );
    expect(state.error).toContain('distinta');
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('writes the new hash and clears the flag once both checks pass', async () => {
    verifyPassword.mockImplementation(async (candidate: string) => candidate === 'actual');
    await expect(
      changePasswordAction({}, form({ current: 'actual', password: GOOD, confirm: GOOD })),
    ).rejects.toThrow('redirect:/admin');
    expect(setPassword).toHaveBeenCalledWith(4, 'scrypt$hash', { mustChangePassword: false });
  });
});
