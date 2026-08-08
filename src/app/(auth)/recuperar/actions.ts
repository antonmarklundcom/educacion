'use server';

/**
 * "Olvidé mi contraseña" — issuing a reset link.
 *
 * The whole design of this action is one property: **it answers the same way
 * whether or not the address has an account.** Login goes to some trouble not
 * to be an enumeration oracle; a reset form that says "no encontramos ese
 * correo" hands back everything login refused to give. So the response text is
 * a constant, and the work done for a miss is the same shape as the work done
 * for a hit.
 *
 * Mail failure is deliberately invisible to the requester too. If Resend is
 * unconfigured or down, the server logs it and the user still sees the neutral
 * message — because "el correo no pudo enviarse" also confirms the account.
 */

import {
  createResetToken,
  findAccountByEmail,
  type AccountRow,
} from '@/db/queries/auth';
import {
  RESET_REQUESTED,
  generateResetToken,
  hashResetToken,
  resetEmailBody,
  resetExpiry,
} from '@/lib/auth/reset';
import { sendEmail } from '@/lib/email/send';

export interface RecoverState {
  sent?: boolean;
  message?: string;
}

function resetLink(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? '';
  const path = `/restablecer?token=${encodeURIComponent(token)}`;
  try {
    return new URL(path, base).toString();
  } catch {
    // No configured origin (CI, a bare local run): the relative path still
    // tells a developer reading the log what the link would have been.
    return path;
  }
}

/** Suspended accounts get no link. Everyone else who exists does. */
function mayReset(account: AccountRow | null): account is AccountRow {
  return account != null && account.status !== 'suspended';
}

export async function recoverAction(
  _state: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { sent: true, message: RESET_REQUESTED };

  const account = await findAccountByEmail(email);

  if (mayReset(account)) {
    const token = generateResetToken();
    await createResetToken(account.id, hashResetToken(token), resetExpiry());

    await sendEmail({
      to: account.email,
      subject: 'Restablecer tu contraseña — educacion.com.py',
      text: resetEmailBody(resetLink(token)),
      context: 'auth/reset',
    });
  } else {
    console.warn(`[auth/reset] no link issued for "${email.slice(0, 64)}"`);
  }

  return { sent: true, message: RESET_REQUESTED };
}
