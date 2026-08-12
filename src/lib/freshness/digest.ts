/**
 * The weekly staleness digest (PR-33) — one email to the operator with the
 * numbers `/admin/frescura` shows, so the queue is not something you have to
 * remember to look at.
 *
 * Same delivery contract as every other mail in this codebase (`fetch`, no
 * SDK, a missing key degrades to a console warning): a cron that throws on a
 * misconfigured deploy stops doing the rest of its work.
 *
 * **It reports, and never acts.** Nothing here re-verifies, hides or archives
 * anything — re-verification is a person saying "this is still true"
 * (`architecture.md` §14.2), and a job that did it automatically would be
 * exactly the quiet extension of a wrong number that §14.2 exists to prevent.
 */

import { CONTACT_EMAIL } from '@/lib/legal/contact';

import { FRESHNESS_LABELS } from './score';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface DigestCounts {
  pricesExpired: number;
  pricesExpiringSoon: number;
  pricesNeverVerified: number;
  accreditationsStale: number;
  admissionsClosed: number;
  offeringsWithoutPrice: number;
}

/** Pure — the sentence the email says, testable without a network. */
export function stalenessDigestBody(counts: DigestCounts): string {
  const lines = [
    'Estado de los datos de educacion.com.py:',
    '',
    `· ${counts.pricesExpired} aranceles ${FRESHNESS_LABELS.stale.toLowerCase()}s — se muestran con el aviso “dato desactualizado”.`,
    `· ${counts.pricesExpiringSoon} vencen dentro de los próximos 60 días.`,
    `· ${counts.pricesNeverVerified} nunca se verificaron.`,
    `· ${counts.accreditationsStale} acreditaciones sin revisar hace más de 12 meses.`,
    `· ${counts.admissionsClosed} convocatorias siguen activas con la fecha de cierre pasada.`,
    `· ${counts.offeringsWithoutPrice} ofertas publicadas sin ningún arancel.`,
    '',
    'La cola ordenada por prioridad está en https://educacion.com.py/admin/frescura',
  ];
  return lines.join('\n');
}

/** True when there is nothing worth an email this week. */
export function isQuiet(counts: DigestCounts): boolean {
  return (
    counts.pricesExpired === 0 &&
    counts.pricesExpiringSoon === 0 &&
    counts.pricesNeverVerified === 0 &&
    counts.accreditationsStale === 0 &&
    counts.admissionsClosed === 0
  );
}

export async function sendStalenessDigest(
  counts: DigestCounts,
): Promise<{ sent: boolean; reason?: string }> {
  // A weekly "todo está al día" is a mail that trains you to ignore the weekly
  // mail. Silence is the message when there is nothing to do.
  if (isQuiet(counts)) return { sent: false, reason: 'nothing_to_report' };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn('[freshness] RESEND_API_KEY or LEAD_FROM_EMAIL is unset; digest not sent.');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [CONTACT_EMAIL],
        subject: `Datos por reverificar: ${counts.pricesExpired + counts.pricesNeverVerified} aranceles`,
        text: stalenessDigestBody(counts),
      }),
    });
    if (!response.ok) {
      console.error(`[freshness] digest failed: HTTP ${response.status}`);
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('[freshness] digest failed', error);
    return { sent: false, reason: 'exception' };
  }
}
