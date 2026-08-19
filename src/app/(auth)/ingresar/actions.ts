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
import {
  LOGIN_RATE_LIMITED,
  chargeLoginAttempt,
  loginAllowed,
  refundLoginAttempt,
  settleLoginSuccess,
  shouldLogRefusal,
} from '@/lib/auth/rate-limit';
import { clientIpHash } from '@/lib/privacy/server-request';
import { startSession } from '@/lib/auth/session';
import { hashEmail } from '@/lib/privacy/hash';

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
  // limited and this one, where a guess actually succeeds, was not. Decided
  // before the lookup, so a flood never reaches the database, and keyed on the
  // *submitted* address, so the answer cannot tell an attacker which addresses
  // exist. `rate-limit.ts` has the reasoning for the charge/refund order and
  // for why there is no global per-address counter.
  const ipHash = await clientIpHash();
  const at = Date.now();
  if (!loginAllowed(ipHash, email, at)) {
    // Logged so an operator answering "why can nobody at this university sign
    // in?" can see whether one address is tripping it (risks.md §R-16). The
    // IP is already a hash; the address is hashed here too. Throttled per key,
    // because refusal is the cheapest path here and would otherwise be an
    // unbounded log-volume amplifier — see `shouldLogRefusal`.
    if (shouldLogRefusal(ipHash, at)) {
      console.warn(`Login rate limited: ip=${ipHash} account=${hashEmail(email)}`);
    }
    return { error: LOGIN_RATE_LIMITED };
  }
  // Charged before the outcome is known. `loginAllowed` and this call are
  // synchronous and adjacent, so no other request can interleave between them;
  // peeking now and charging after `authenticate()` would leave three `await`s
  // in the window, and a concurrent burst would pass the limit wholesale. A
  // success refunds it below; so does a failure of ours.
  chargeLoginAttempt(ipHash, email, at);

  let account: Awaited<ReturnType<typeof findAccountByEmail>>;
  let result: Awaited<ReturnType<typeof authenticate>>;
  try {
    account = await findAccountByEmail(email);
    const institutionId = account
      ? await resolveInstitutionScope(account.id, account.institutionId)
      : null;

    result = await authenticate(account, password, institutionId);
  } catch (error) {
    // Nothing was verified, so nothing should be charged. Without this, one
    // database blip spends the quota of every user waiting on it and then
    // tells them they tried too often.
    refundLoginAttempt(ipHash, email, at);
    throw error;
  }

  if (!result.ok) {
    // Already charged above; a failure simply keeps it.
    // One message for every failure — see `login.ts`. The reason stays
    // server-side, and the address is hashed: a log line outlives the
    // in-process limiter that `hashEmail` exists to keep addresses out of.
    console.warn(`Login failed (${result.reason}) for ${hashEmail(email)}`);
    return { error: LOGIN_ERROR };
  }

  // Somebody who mistyped twice and then got it right starts clean, and the
  // sign-in itself costs nothing once settled — a busy shared address must not
  // lock itself out by succeeding (architecture.md §6.1.1).
  settleLoginSuccess(ipHash, email, at);

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
