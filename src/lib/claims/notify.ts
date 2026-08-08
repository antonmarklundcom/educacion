/**
 * The two mails the claim flow sends.
 *
 * Same shape and same reasoning as `src/lib/leads/notify.ts`: Resend is an HTTP
 * API and its SDK is a wrapper over one `POST`, so this is `fetch` and the
 * dependency list in `architecture.md` §1 is unchanged.
 *
 * ### Where this differs from the lead mail, and why it matters
 *
 * A lead mail failing is a delivery problem: the row is committed, the student
 * got their confirmation, and PR-23's retry picks it up. **A claim mail failing
 * is the flow failing** — the token exists only in that message, so a claim
 * whose mail did not go out is a claim nobody can complete. So `sendClaimLink`
 * reports whether the mail was accepted, and the caller tells the claimant the
 * truth ("no pudimos enviarte el correo") instead of a success screen for a
 * message that is not coming. It still never throws into the request path.
 *
 * ### What is in the mail
 *
 * The link, the institution being claimed, and when the link dies. No password,
 * no session, nothing about the institution's data. The link is the credential,
 * which is why it goes to one address — the one whose control is the thing
 * being proven — and never to `institutions.email` as a copy.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.PUBLIC_SITE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** The absolute URL that redeems a claim. Built in one place so it cannot drift. */
export function claimUrl(token: string): string {
  return `${siteUrl()}/reclamar/${encodeURIComponent(token)}`;
}

async function send(options: {
  to: string;
  subject: string;
  text: string;
  context: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[claims] ${options.context} not delivered: RESEND_API_KEY or LEAD_FROM_EMAIL is ` +
        `unset (docs/deployment.md §6).`,
    );
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        text: options.text,
      }),
    });

    if (!response.ok) {
      console.error(`[claims] ${options.context} failed: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[claims] ${options.context} threw`, error);
    return false;
  }
}

export interface ClaimLinkMail {
  claimId: number;
  to: string;
  institutionName: string;
  token: string;
  expiresAt: Date;
}

/** `true` when the mail carrying the token was accepted for delivery. */
export async function sendClaimLink(mail: ClaimLinkMail): Promise<boolean> {
  const expires = new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Asuncion',
  }).format(mail.expiresAt);

  return send({
    to: mail.to,
    context: `claim ${mail.claimId} link`,
    subject: `Reclamá el perfil de ${mail.institutionName} en educacion.com.py`,
    text: [
      `Pediste administrar el perfil de ${mail.institutionName} en educacion.com.py.`,
      ``,
      `Entrá acá para completarlo:`,
      claimUrl(mail.token),
      ``,
      `El enlace sirve una sola vez y vence el ${expires}.`,
      ``,
      `Si no pediste esto, ignorá este correo: sin abrir el enlace no pasa nada.`,
      ``,
      `educacion.com.py es un sitio privado e independiente. No es un portal oficial ` +
        `del MEC, CONES ni ANEAES.`,
    ].join('\n'),
  });
}

/** Told to the claimant when an admin refuses. No reason is quoted back to them. */
export async function sendClaimRejected(mail: {
  claimId: number;
  to: string;
  institutionName: string;
}): Promise<boolean> {
  return send({
    to: mail.to,
    context: `claim ${mail.claimId} rejection`,
    subject: `Tu solicitud para ${mail.institutionName}`,
    text: [
      `Revisamos tu solicitud para administrar el perfil de ${mail.institutionName} en ` +
        `educacion.com.py y no pudimos confirmarla.`,
      ``,
      `Si trabajás en la institución, escribinos desde tu correo institucional y lo ` +
        `resolvemos.`,
      ``,
      `educacion.com.py es un sitio privado e independiente. No es un portal oficial ` +
        `del MEC, CONES ni ANEAES.`,
    ].join('\n'),
  });
}
