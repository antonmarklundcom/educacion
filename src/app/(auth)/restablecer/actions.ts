'use server';

/**
 * Spending a reset link.
 *
 * The order of operations is the security property here: the token is
 * **claimed before the password is written**, by an UPDATE whose predicate
 * includes `used_at IS NULL`. If two submissions of the same link race, the
 * database picks one; the loser is told the link is no longer valid rather
 * than both of them setting a password.
 *
 * A failed write after a successful claim burns the link, and that is the
 * right way round: the user requests another one, which costs an email. The
 * alternative — write first, mark used after — leaves a window in which a
 * replayed link sets the password twice.
 */

import { redirect } from 'next/navigation';

import { consumeResetToken, findResetToken, setPassword } from '@/db/queries/auth';
import { hashPassword, passwordProblem } from '@/lib/auth/password';
import { RESET_LINK_INVALID, hashResetToken, resetTokenProblem } from '@/lib/auth/reset';
import { endSession } from '@/lib/auth/session';

export interface ResetState {
  error?: string;
}

export async function resetPasswordAction(
  _state: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get('token') ?? '');
  const next = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!token) return { error: RESET_LINK_INVALID };
  if (next !== confirm) return { error: 'Las contraseñas no coinciden.' };

  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  const tokenHash = hashResetToken(token);
  const row = await findResetToken(tokenHash);

  // One message for unknown, expired and already-used: telling someone their
  // stolen link was merely too late is itself information.
  if (resetTokenProblem(row) || !row) return { error: RESET_LINK_INVALID };

  if (!(await consumeResetToken(tokenHash))) {
    // Someone — possibly this same user, double-clicking — got there first.
    return { error: RESET_LINK_INVALID };
  }

  await setPassword(row.userId, await hashPassword(next), { mustChangePassword: false });

  // Whoever is holding this browser has just proven control of the mailbox,
  // not of the previous session. Any session in this browser is discarded so
  // the user signs in fresh with the password they just chose.
  await endSession();

  redirect('/ingresar?restablecida=1');
}
