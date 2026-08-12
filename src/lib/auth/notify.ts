/**
 * The password-reset email (PR-35).
 *
 * Same delivery contract as every other mail here (`fetch` against Resend, no
 * SDK) with one difference that matters: **a failure to send must be visible
 * to the person who asked.** A lead that fails to deliver is retried by a cron
 * and nothing is lost; a reset link that silently never arrives leaves a
 * locked-out user waiting for a mail that is not coming, and PR-18's fallback
 * — "an admin recovers you" — is exactly what this flow exists to replace.
 *
 * So this returns a result rather than swallowing the error, and the page says
 * "no pudimos enviar el correo" when it is false. That does leak one bit
 * (whether a send was attempted, i.e. whether the address exists) — so the
 * caller reports a send failure **only** when it had a real address, and
 * reports the same neutral sentence in every other case. The trade is
 * deliberate: an operator can fix a mail outage they are told about, and cannot
 * fix one they are not.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResetEmail {
  to: string;
  name: string | null;
  /** Absolute URL of the reset page, token included. */
  link: string;
  ttlMinutes: number;
}

/** Pure — the words the mail says. Testable without a network. */
export function resetEmailBody(mail: ResetEmail): string {
  return [
    mail.name ? `Hola, ${mail.name}.` : 'Hola.',
    '',
    'Pediste restablecer tu contraseña de educacion.com.py. Entrá acá para elegir una nueva:',
    '',
    mail.link,
    '',
    `El enlace sirve una sola vez y vence en ${mail.ttlMinutes} minutos.`,
    '',
    'Si no lo pediste vos, ignorá este correo: tu contraseña sigue siendo la misma y este enlace no sirve para nada sin tu correo.',
  ].join('\n');
}

export async function sendPasswordResetEmail(mail: ResetEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn('[auth] RESEND_API_KEY or LEAD_FROM_EMAIL is unset; reset email not sent.');
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: 'Restablecé tu contraseña de educacion.com.py',
        text: resetEmailBody(mail),
      }),
    });
    if (!response.ok) {
      console.error(`[auth] reset email failed: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[auth] reset email failed', error);
    return false;
  }
}
