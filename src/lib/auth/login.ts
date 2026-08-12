/**
 * The sign-in decision, as one pure-ish function.
 *
 * Split out of the route so the rules below can be read — and tested — without
 * a request, a cookie or a form. The route's job is to call this and set a
 * cookie; every judgement about whether a sign-in is allowed is here.
 *
 * ### Why every failure returns the same message
 *
 * "Ese correo no existe" tells an attacker which addresses are worth attacking,
 * and "tu cuenta está suspendida" confirms an account exists. So a wrong
 * password, an unknown address, a suspended account and an account that has
 * never set a password all produce the identical string. The `reason` field is
 * for our logs, never for the response body.
 *
 * ### Why an unknown email still hashes something
 *
 * Returning early on "no such user" makes the unknown-email path measurably
 * faster than the wrong-password path, which is a user-enumeration oracle over
 * a slow KDF. So a miss verifies the password against a dummy hash of the same
 * cost before failing.
 */

import { hashPassword, needsRehash, verifyPassword } from './password';
import type { SessionUser } from './session';

export type LoginFailure =
  'unknown_email' | 'wrong_password' | 'no_password_set' | 'suspended' | 'invalid_input';

export type LoginResult =
  { ok: true; user: SessionUser; rehashTo?: string } | { ok: false; reason: LoginFailure };

/** Shown for every failure, whatever the reason. Voseo, per CLAUDE.md §8. */
export const LOGIN_ERROR = 'Correo o contraseña incorrectos.';

export interface LoginAccount {
  id: number;
  passwordHash: string | null;
  role: SessionUser['role'];
  status: string;
  mustChangePassword: boolean;
}

/**
 * A hash of the right shape and cost to compare against when no account
 * matched. Computed once, lazily — building it at module load would slow every
 * cold start for a path most requests never take.
 */
let decoyHash: Promise<string> | null = null;
function decoy(): Promise<string> {
  decoyHash ??= hashPassword('una contraseña que nadie va a usar jamás');
  return decoyHash;
}

export async function authenticate(
  account: LoginAccount | null,
  password: string,
  institutionId: number | null,
): Promise<LoginResult> {
  if (!password) return { ok: false, reason: 'invalid_input' };

  if (!account) {
    // Burn the same time an existing account would have cost.
    await verifyPassword(password, await decoy());
    return { ok: false, reason: 'unknown_email' };
  }

  if (!account.passwordHash) {
    await verifyPassword(password, await decoy());
    return { ok: false, reason: 'no_password_set' };
  }

  const correct = await verifyPassword(password, account.passwordHash);
  if (!correct) return { ok: false, reason: 'wrong_password' };

  // Checked *after* the password, so a suspended account cannot be told apart
  // from a wrong password by how long the request takes.
  if (account.status === 'suspended') return { ok: false, reason: 'suspended' };

  const result: LoginResult = {
    ok: true,
    user: {
      id: account.id,
      role: account.role,
      institutionId,
      mustChangePassword: account.mustChangePassword,
    },
  };

  if (needsRehash(account.passwordHash)) {
    return { ...result, rehashTo: await hashPassword(password) };
  }
  return result;
}
