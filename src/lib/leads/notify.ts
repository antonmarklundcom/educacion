/**
 * Telling the institution a lead arrived.
 *
 * ### Where the sending happens
 *
 * `src/lib/email/send.ts` — one `fetch` to Resend, shared with the password
 * reset PR-18 added. `architecture.md` §1 names Resend and its SDK is a thin
 * wrapper over one `POST`, so the dependency list is still unchanged; what did
 * change is that there are now two senders, and two copies of one HTTP client
 * is how one of them quietly gains a timeout the other never gets.
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

import { sendEmail } from '@/lib/email/send';

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
  if (!lead.to) {
    console.warn(`[leads] lead ${lead.leadId} stored but not delivered: no email on file.`);
    return false;
  }

  return sendEmail({
    to: lead.to,
    replyTo: lead.email ?? undefined,
    subject: `Solicitud de información — ${lead.programName}`,
    text: body(lead),
    context: `leads/${lead.leadId}`,
  });
}
