'use server';

/**
 * The sign-in and sign-out server actions.
 *
 * Thin on purpose: every rule about *whether* a sign-in is allowed lives in
 * `src/lib/auth/login.ts`, and every rule about what a session may then do
 * lives in `src/lib/auth/roles.ts`. What is left here is the request-shaped
 * work — read the form, set the cookie, redirect — which is the part that
 * cannot be unit-tested and therefore should contain no decisions.
 */

import { redirect } from 'next/navigation';

import {
  findAccountByEmail,
  recordLogin,
  resolveInstitutionScope,
  setPassword,
} from '@/db/queries/auth';
import { LOGIN_ERROR, authenticate } from '@/lib/auth/login';
import { LOGIN_RATE_LIMITED, checkLoginRate, clientIpHash } from '@/lib/auth/rate-limit';
import { startSession } from '@/lib/auth/session';

export interface LoginState {
  error?: string;
}

/** Where a signed-in user lands, by role. */
function landingFor(role: string): string {
  return role === 'admin' || role === 'editor' ? '/admin' : '/panel';
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  // The audit's one security inconsistency: every other public write was rate
  // limited and this one, where a guess actually succeeds, was not. Checked
  // before the lookup, so a flood never reaches the database — and keyed on
  // the *submitted* address, so the rejection cannot tell an attacker which
  // addresses exist. `rate-limit.ts` has the reasoning.
  if (!checkLoginRate(await clientIpHash(), email).allowed) {
    return { error: LOGIN_RATE_LIMITED };
  }

  const account = await findAccountByEmail(email);
  const institutionId = account
    ? await resolveInstitutionScope(account.id, account.institutionId)
    : null;

  const result = await authenticate(account, password, institutionId);

  if (!result.ok) {
    // One message for every failure — see `login.ts`. The reason stays server-side.
    console.warn(`Login failed (${result.reason}) for "${email.slice(0, 64)}"`);
    return { error: LOGIN_ERROR };
  }

  if (result.rehashTo && account) {
    await setPassword(account.id, result.rehashTo, {
      mustChangePassword: result.user.mustChangePassword,
    });
  }

  await startSession(result.user);
  // Best-effort: a failed bookkeeping write must not cost a valid sign-in.
  try {
    await recordLogin(result.user.id);
  } catch (error) {
    console.warn('Could not record last_login_at', error);
  }

  redirect(result.user.mustChangePassword ? '/cambiar-contrasena' : landingFor(result.user.role));
}
