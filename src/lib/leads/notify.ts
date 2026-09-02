/**
 * Telling the institution a lead arrived.
 *
 * ### Why there is no email dependency
 *
 * `architecture.md` §1 names Resend, and Resend is an HTTP API. Its SDK is a
 * thin wrapper over one `POST`, and the "deliberately excluded" list exists to
 * stop exactly this kind of unexamined addition — so this is `fetch`, and the
 * dependency list is unchanged.
 *
 * ### Failure is expected and is not the student's problem
 *
 * The lead row is committed before this runs. If the mail fails — no API key on
 * this deploy, Resend down, the institution has no address on file — the row
 * stays `status='new'` with a null `delivered_at`, the student still gets a
 * success, and PR-23's hourly `lead-retry` cron picks it up
 * (`architecture.md` §10). Nothing here throws into the request path.
 *
 * ### What is in the mail
 *
 * The lead's own contact details, to the institution the student chose, and
 * nowhere else (`risks.md` §R-06). Not `ip_hash`, not `user_agent`, and never a
 * lead belonging to a different institution.
 */

import { formatParaguayanPhone } from './phone';

export interface LeadNotification {
  leadId: number;
  institutionName: string;
  /** The institution's address from `institutions.email`. */
  to: string | null;
  programName: string;
  name: string;
  phoneE164: string;
  email: string | null;
  message: string | null;
  /** Absolute URL of the page the lead came from, when known. */
  sourcePage: string | null;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function body(lead: LeadNotification): string {
  return [
    `Nueva solicitud de información desde educacion.com.py`,
    ``,
    `Carrera: ${lead.programName}`,
    `Nombre: ${lead.name}`,
    `Teléfono: ${formatParaguayanPhone(lead.phoneE164)} (${lead.phoneE164})`,
    lead.email ? `Email: ${lead.email}` : null,
    lead.message ? `Mensaje: ${lead.message}` : null,
    lead.sourcePage ? `Página: ${lead.sourcePage}` : null,
    ``,
    `Esta persona autorizó que le envíes información sobre esta carrera. ` +
      `No compartas ni revendas sus datos.`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** `true` when the mail was accepted for delivery. Never throws. */
export async function notifyInstitution(lead: LeadNotification): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[leads] lead ${lead.leadId} stored but not delivered: RESEND_API_KEY or ` +
        `LEAD_FROM_EMAIL is unset (docs/deployment.md §6).`,
    );
    return false;
  }
  if (!lead.to) {
    console.warn(`[leads] lead ${lead.leadId} stored but not delivered: no email on file.`);
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [lead.to],
        reply_to: lead.email ?? undefined,
        subject: `Solicitud de información — ${lead.programName}`,
        text: body(lead),
      }),
      // Resend is external; without a bound, a stuck peer holds this Node
      // process open for up to 300s. Hostinger's shared account caps total
      // processes across 9 apps (see next.config.ts).
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[leads] lead ${lead.leadId} delivery failed: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[leads] lead ${lead.leadId} delivery threw`, error);
    return false;
  }
}
