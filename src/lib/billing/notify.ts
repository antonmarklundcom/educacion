/**
 * Renewal notices (PR-29).
 *
 * ### They go to us, not to the institution — and why
 *
 * `monetization.md` §5 describes a sales motion made of a WhatsApp thread, a
 * meeting in Asunción and a factura issued by hand from FacturaPY. In that
 * motion the useful artefact 90 days out is **the operator knowing** which
 * contracts are coming up, so the conversation happens before the budget is
 * set (§5: sell Aug–Oct, run Nov–Oct). An automated "tu suscripción vence"
 * email to a university, before anybody has quoted them a renewal price, is a
 * dunning notice in a relationship that is not transactional — and it would
 * arrive from a system the institution has no billing account in.
 *
 * So the cron sends **one digest to the operator** listing everything that
 * crossed a threshold since it last ran. Sending to the institution as well is
 * a one-line change to the recipient list once there is a renewal quote to put
 * in the mail; the plumbing (thresholds, idempotency) does not change.
 *
 * ### Same delivery contract as the lead mail
 *
 * `fetch` against Resend, no SDK (`lib/leads/notify.ts`), and a missing
 * `RESEND_API_KEY` / `LEAD_FROM_EMAIL` degrades to a console warning rather
 * than a thrown error: a cron job that throws on a misconfigured deploy stops
 * doing the rest of its work, and the rest of its work here includes the
 * past-due sweep.
 */

import { CONTACT_EMAIL } from '@/lib/legal/contact';

import type { DueReminder } from './renewals';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Pure — the sentence the digest says. Testable without a network. */
export function renewalDigestBody(reminders: readonly DueReminder[]): string {
  const lines = ['Renovaciones que necesitan una conversación:', ''];

  for (const { subscription, threshold, daysLeft } of reminders) {
    lines.push(
      `· ${subscription.institutionName} — ${subscription.planName}. ` +
        `Vence el ${subscription.endsOn} (faltan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}, aviso de ${threshold}). ` +
        (subscription.invoiceRef
          ? `Última factura: ${subscription.invoiceRef}.`
          : 'Sin referencia de factura cargada.'),
    );
  }

  lines.push('', 'Panel: https://educacion.com.py/admin/facturacion');
  return lines.join('\n');
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendRenewalDigest(reminders: readonly DueReminder[]): Promise<SendResult> {
  if (reminders.length === 0) return { sent: false, reason: 'nothing_due' };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn('[billing] RESEND_API_KEY or LEAD_FROM_EMAIL is unset; renewal digest not sent.');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [CONTACT_EMAIL],
        subject: `${reminders.length} ${reminders.length === 1 ? 'renovación' : 'renovaciones'} por vencer`,
        text: renewalDigestBody(reminders),
      }),
    });
    if (!response.ok) {
      console.error(`[billing] renewal digest failed: HTTP ${response.status}`);
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('[billing] renewal digest failed', error);
    return { sent: false, reason: 'exception' };
  }
}
