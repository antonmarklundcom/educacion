/**
 * Telling staff an institution disputed an accreditation record.
 *
 * Same delivery contract as `lib/leads/notify.ts`: `fetch` against Resend,
 * degrading to a console warning rather than throwing when `RESEND_API_KEY` /
 * `LEAD_FROM_EMAIL` is unset. The dispute itself is already committed by the
 * time this runs (`db/queries/panel/disputes.ts`'s `fileAccreditationDispute`
 * calls it last) — a mail provider having a bad afternoon must not make the
 * institution's dispute disappear, only delay staff finding out about it.
 * `/admin/disputas` is the record of truth either way.
 */

import { CONTACT_EMAIL } from '@/lib/legal/contact';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface DisputeNotification {
  accreditationId: number;
  institutionId: number;
  agency: string;
  status: string;
  reason: string;
}

function body(dispute: DisputeNotification): string {
  return [
    `Una institución disputó una acreditación.`,
    ``,
    `Acreditación: #${dispute.accreditationId} (${dispute.agency}, ${dispute.status})`,
    `Institución: #${dispute.institutionId}`,
    `Motivo: ${dispute.reason}`,
    ``,
    `Revisala en /admin/disputas.`,
  ].join('\n');
}

/** `true` when the mail was accepted for delivery. Never throws. */
export async function notifyAdminOfDispute(dispute: DisputeNotification): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(
      `[disputes] dispute on accreditation ${dispute.accreditationId} filed but not emailed: ` +
        `RESEND_API_KEY or LEAD_FROM_EMAIL is unset (docs/deployment.md §6).`,
    );
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [CONTACT_EMAIL],
        subject: `Disputa de acreditación — institución #${dispute.institutionId}`,
        text: body(dispute),
      }),
      // Resend is external; without a bound, a stuck peer holds this Node
      // process open for up to 300s. Hostinger's shared account caps total
      // processes across 9 apps (see next.config.ts).
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[disputes] notification failed: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[disputes] notification threw`, error);
    return false;
  }
}
