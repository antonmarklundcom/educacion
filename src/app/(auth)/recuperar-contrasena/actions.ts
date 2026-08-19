'use server';

import { consumePasswordReset, requestPasswordReset } from '@/db/queries/password-reset';
import { sendPasswordResetEmail } from '@/lib/auth/notify';
import { passwordProblem } from '@/lib/auth/password';
import { RESET_TTL_MINUTES } from '@/lib/auth/reset-token';
import { clientIpHash } from '@/lib/privacy/request';
import { checkRate } from '@/lib/leads/rate-limit';

export interface RequestResetState {
  /** The neutral sentence, shown whether or not the address exists. */
  message?: string;
  error?: string;
}

/**
 * The same answer for every address (PR-35).
 *
 * Unknown, suspended, and "we sent it" are indistinguishable in the response —
 * anything else turns this form into a list of who has an account here. The
 * one exception is a *send failure* on a real address, which is reported,
 * because an operator can fix a mail outage they are told about and cannot fix
 * one they are not.
 */
const NEUTRAL =
  'Si existe una cuenta con ese correo, te mandamos un enlace para restablecer la contraseña. Revisá también el spam.';

export async function requestResetAction(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const email = String(formData.get('email') ?? '').trim();

  // Two tiers, same as the lead form and the claim request: an in-process
  // window absorbs a flood before the database is touched. Rate limiting here
  // protects somebody else's inbox, not our data.
  const ipHash = await clientIpHash();
  // Stricter than the lead form's: nobody legitimately asks for three reset
  // links a minute, and every extra request is a mail into somebody else's
  // inbox — the same argument §16.6 makes for the claim form.
  const decision = checkRate(`reset:${ipHash}`, Date.now(), [
    { limit: 3, windowMs: 60_000 },
    { limit: 10, windowMs: 3_600_000 },
  ]);
  if (!decision.allowed) {
    return { error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' };
  }

  if (!email.includes('@')) return { error: 'Escribí un correo válido.' };

  const request = await requestPasswordReset(email);
  if (!request) return { message: NEUTRAL };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://educacion.com.py';
  const sent = await sendPasswordResetEmail({
    to: request.email,
    name: request.name,
    link: `${base.replace(/\/$/, '')}/recuperar-contrasena/${request.token}`,
    ttlMinutes: RESET_TTL_MINUTES,
  });

  if (!sent) {
    return {
      error:
        'No pudimos enviar el correo en este momento. Probá de nuevo en unos minutos o escribinos a contacto@educacion.com.py.',
    };
  }

  return { message: NEUTRAL };
}

export interface CompleteResetState {
  error?: string;
  /** Set only on success — the form renders the confirmation off this. */
  done?: true;
}

export async function completeResetAction(
  token: string,
  _prev: CompleteResetState,
  formData: FormData,
): Promise<CompleteResetState> {
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');

  if (password !== confirmation) return { error: 'Las dos contraseñas no coinciden.' };

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const outcome = await consumePasswordReset(token, password);
  if (!outcome.ok) {
    return {
      error:
        outcome.reason === 'used'
          ? 'Ese enlace ya se usó. Pedí uno nuevo.'
          : outcome.reason === 'expired'
            ? 'Ese enlace venció. Pedí uno nuevo.'
            : 'Ese enlace no es válido. Pedí uno nuevo.',
    };
  }

  // No session is started here — the ordinary login path already has PR-18's
  // uniform failure message and its timing defence (§16.4's reasoning).
  return { done: true };
}
