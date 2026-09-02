/**
 * The daily lead digest — one email per institution with `status='new'`
 * leads, so a lead that a mail provider swallowed silently is not the only
 * way an institution finds out it has one waiting.
 *
 * Same delivery contract as `notify.ts`: `fetch` against Resend, and a missing
 * `RESEND_API_KEY` / `LEAD_FROM_EMAIL` / recipient degrades to a console
 * warning rather than a thrown error — a digest is a convenience on top of the
 * per-lead email, not the record of truth, so it must never be the thing that
 * makes the cron job fail.
 *
 * **Not "new since last digest".** There is no persisted "last sent" clock
 * (`architecture.md` §10 lists no digest-tracking table, and PR-23 was told
 * not to add a schema change without asking first). So this reports a live
 * count — "tenés N solicitudes sin responder" — which is true and re-sendable:
 * firing the cron twice in one day repeats the same honest sentence rather
 * than duplicating or dropping a lead. `architecture.md`'s "all jobs are
 * idempotent" is read that way here: no double-counted data, not "never sent
 * twice".
 */

import { getInstitutionContacts } from '@/db/queries/institutions';
import { listInstitutionsWithNewLeads } from '@/db/queries/leads';

import { LEAD_SLA_HOURS } from './sla';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface DigestEntry {
  institutionId: number;
  newCount: number;
  /**
   * Of `newCount`, how many are past the 48 h SLA (PR-49). The same number the
   * panel banner shows, from the same `slaCutoff` — the digest is the copy of
   * this sentence that reaches an institution that never logs in.
   */
  overdueCount: number;
  oldestCreatedAt: Date;
}

function daysWaiting(oldest: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 86_400_000));
}

/** Pure — the sentence the email says, testable without a database. */
export function digestBody(institutionName: string, entry: DigestEntry, now: Date): string {
  const waiting = daysWaiting(entry.oldestCreatedAt, now);
  const plural = entry.newCount === 1 ? 'solicitud sin responder' : 'solicitudes sin responder';
  const overdue = entry.overdueCount;
  return [
    `Hola, ${institutionName}.`,
    ``,
    `Tenés ${entry.newCount} ${plural} en educacion.com.py.`,
    overdue > 0
      ? overdue === 1
        ? `1 de ellas espera hace más de ${LEAD_SLA_HOURS} horas.`
        : `${overdue} de ellas esperan hace más de ${LEAD_SLA_HOURS} horas.`
      : null,
    waiting > 0
      ? `La más antigua lleva ${waiting} ${waiting === 1 ? 'día' : 'días'} esperando.`
      : null,
    ``,
    `Entrá a tu panel para verlas y responder: https://educacion.com.py/panel/leads`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

async function sendOne(
  to: string,
  institutionName: string,
  entry: DigestEntry,
  apiKey: string,
  from: string,
  now: Date,
): Promise<boolean> {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject:
          entry.newCount === 1
            ? `Tenés 1 solicitud sin responder`
            : `Tenés ${entry.newCount} solicitudes sin responder`,
        text: digestBody(institutionName, entry, now),
      }),
      // Resend is external; without a bound, a stuck peer holds this Node
      // process open for up to 300s. Hostinger's shared account caps total
      // processes across 9 apps (see next.config.ts).
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(
        `[leads] digest to institution ${entry.institutionId} failed: HTTP ${response.status}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[leads] digest to institution ${entry.institutionId} threw`, error);
    return false;
  }
}

export interface DigestRunResult {
  institutions: number;
  sent: number;
}

/** The daily `lead-digest` cron job's whole body. Never throws. */
export async function sendLeadDigests(now: Date = new Date()): Promise<DigestRunResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;

  const entries = await listInstitutionsWithNewLeads(now);
  if (entries.length === 0) return { institutions: 0, sent: 0 };

  if (!apiKey || !from) {
    console.warn(
      `[leads] digest skipped for ${entries.length} institution(s): RESEND_API_KEY or ` +
        `LEAD_FROM_EMAIL is unset (docs/deployment.md §6).`,
    );
    return { institutions: entries.length, sent: 0 };
  }

  const contacts = await getInstitutionContacts(entries.map((entry) => entry.institutionId));

  let sent = 0;
  for (const entry of entries) {
    const contact = contacts.get(entry.institutionId);
    if (!contact?.email) {
      console.warn(
        `[leads] digest skipped for institution ${entry.institutionId}: no email on file.`,
      );
      continue;
    }
    const ok = await sendOne(contact.email, contact.nameOfficial, entry, apiKey, from, now);
    if (ok) sent += 1;
  }

  return { institutions: entries.length, sent };
}
