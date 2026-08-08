'use server';

/**
 * Setting a new password for the signed-in user.
 *
 * This is the other half of the bootstrap guarantee: the script issues a
 * one-time password and marks the account `must_change_password`, and this is
 * where that flag is cleared. Without it the printed credential would simply
 * keep working, which is the failure `pr-plan.md` PR-18 names explicitly.
 *
 * The current password is required even though the user is already signed in.
 * A session is not proof of presence — an unattended laptop is a session — and
 * a password change that needs no password is an account takeover primitive.
 */

import { redirect } from 'next/navigation';

import { findPasswordHash, setPassword } from '@/db/queries/auth';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { currentUser, startSession } from '@/lib/auth/session';

export interface ChangePasswordState {
  error?: string;
}

export async function changePasswordAction(
  _state: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await currentUser();
  if (!user) redirect('/ingresar');

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (next !== confirm) return { error: 'Las contraseñas no coinciden.' };

  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  const passwordHash = await findPasswordHash(user.id);

  if (!(await verifyPassword(current, passwordHash))) {
    return { error: 'La contraseña actual no es correcta.' };
  }
  if (await verifyPassword(next, passwordHash)) {
    return { error: 'La contraseña nueva tiene que ser distinta de la actual.' };
  }

  await setPassword(user.id, await hashPassword(next), { mustChangePassword: false });

  // Re-issue the cookie so the flag does not survive in a stale session and
  // bounce the user straight back here on the next request.
  await startSession({ ...user, mustChangePassword: false });

  redirect(user.role === 'admin' || user.role === 'editor' ? '/admin' : '/panel');
}
