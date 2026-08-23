/**
 * The password-reset actions' input handling (PR-51).
 *
 * Both halves of this form are places where a malformed submission must stop
 * before the database: `requestResetAction` sends mail to whatever address it
 * is handed, and `completeResetAction` consumes a single-use token.
 *
 * The neutral answer is the other property under test. It is the whole reason
 * the request form exists in this shape — a distinguishable response turns it
 * into a list of who has an account here — and a schema that reported "correo
 * inválido" for one address and the neutral sentence for another would give
 * that away for the malformed case, which is why the schema only refuses what
 * cannot be an address at all.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestPasswordReset = vi.fn();
const consumePasswordReset = vi.fn();
const sendPasswordResetEmail = vi.fn();

vi.mock('@/db/queries/password-reset', () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
  consumePasswordReset: (...a: unknown[]) => consumePasswordReset(...a),
}));
vi.mock('@/lib/auth/notify', () => ({
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
}));
vi.mock('@/lib/privacy/server-request', () => ({ clientIpHash: async () => `ip-${counter}` }));

/** A fresh rate-limit bucket per test: the limiter is in-process and strict. */
let counter = 0;

const { completeResetAction, requestResetAction } = await import('./actions');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  counter += 1;
  requestPasswordReset.mockReset().mockResolvedValue(null);
  consumePasswordReset.mockReset().mockResolvedValue({ ok: true });
  sendPasswordResetEmail.mockReset().mockResolvedValue(true);
});

describe('requestResetAction', () => {
  it.each([
    ['an absent field', {}],
    ['a blank string', { email: '  ' }],
    ['something with no @', { email: 'ana' }],
    ['something with no domain dot', { email: 'ana@example' }],
    ['an address longer than the column', { email: `${'a'.repeat(260)}@example.com` }],
  ])('refuses %s without touching the database', async (_case, entries) => {
    const state = await requestResetAction({}, form(entries as Record<string, string>));
    expect(state.error).toBeTruthy();
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('hands a well-formed address through, trimmed', async () => {
    await requestResetAction({}, form({ email: '  ana@example.com ' }));
    expect(requestPasswordReset).toHaveBeenCalledWith('ana@example.com');
  });

  it('answers the same sentence whether or not the account exists', async () => {
    const unknown = await requestResetAction({}, form({ email: 'nadie@example.com' }));

    requestPasswordReset.mockResolvedValue({
      email: 'ana@example.com',
      name: 'Ana',
      token: 'tok',
    });
    const known = await requestResetAction({}, form({ email: 'ana@example.com' }));

    expect(known.message).toBe(unknown.message);
    expect(known.error).toBeUndefined();
  });
});

describe('completeResetAction', () => {
  it('refuses two passwords that do not match, without spending the token', async () => {
    const state = await completeResetAction(
      'tok',
      {},
      form({ password: 'a'.repeat(14), confirmation: 'b'.repeat(14) }),
    );
    expect(state.error).toBe('Las dos contraseñas no coinciden.');
    expect(consumePasswordReset).not.toHaveBeenCalled();
  });

  it('refuses a password that is too short, without spending the token', async () => {
    const state = await completeResetAction(
      'tok',
      {},
      form({ password: 'corta', confirmation: 'corta' }),
    );
    expect(state.error).toContain('al menos');
    expect(consumePasswordReset).not.toHaveBeenCalled();
  });

  it('refuses an absent password rather than consuming the token with an empty one', async () => {
    const state = await completeResetAction('tok', {}, form({}));
    expect(state.error).toBeTruthy();
    expect(consumePasswordReset).not.toHaveBeenCalled();
  });

  it('passes the token and the new password through unchanged', async () => {
    const password = 'una contraseña larguísima';
    await completeResetAction('tok-123', {}, form({ password, confirmation: password }));
    expect(consumePasswordReset).toHaveBeenCalledWith('tok-123', password);
  });
});
