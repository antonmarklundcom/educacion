/**
 * The hourly `lead-retry` cron job's whole body (`architecture.md` §10).
 *
 * `submitLead` already calls `notifyInstitution` once, inline, and only
 * leaves a row `status='new'` / `delivered_at` null when that call failed —
 * missing `RESEND_API_KEY`, Resend down, no email on file. This is the second
 * (and third, and Nth) attempt: `listUndeliveredLeads` finds exactly those
 * rows, and each one that succeeds now is marked delivered so it is not
 * retried again. **Idempotent by construction** — a lead already marked
 * `sent` never reappears in `listUndeliveredLeads`'s query, so firing this
 * twice in the same hour is a wasted read, not a duplicate email.
 */

import { getInstitutionContacts } from '@/db/queries/institutions';
import { listUndeliveredLeads, markLeadDelivered, type LeadRecord } from '@/db/queries/leads';
import { getOfferingsByIds } from '@/lib/search';

import { notifyInstitution } from './notify';

export interface RetryRunResult {
  attempted: number;
  delivered: number;
}

async function programNameFor(record: LeadRecord): Promise<string> {
  if (record.offeringId == null) return 'una carrera';
  const [offering] = await getOfferingsByIds([record.offeringId]);
  return offering?.programName ?? 'una carrera';
}

/**
 * Never throws — a bad row must not stop the rest of the batch.
 *
 * ### Each lead is marked the moment it is sent
 *
 * This used to collect the delivered ids and write them in **one** `UPDATE`
 * after the loop. The independent review of PR-23 (PR-46) named what that
 * costs: if that single write fails — a connection recycled, the process
 * killed mid-batch — up to `limit` institutions have already been emailed and
 * every one of those leads is sent **again** on the next tick, and the tick
 * after that, for as long as the write keeps failing. Nothing bounded the
 * repeat. A student's phone number arriving in an inbox four times is not a
 * cosmetic failure.
 *
 * Marking inside the loop, inside the `try`, bounds the damage to the one lead
 * whose write failed — which is the same shape `submitLead` already uses on the
 * first-attempt path. The batched helper is kept for callers that genuinely
 * have a set in hand.
 *
 * ### What it still does not do
 *
 * Two overlapping cron invocations read the same `status='new'` set and both
 * send: there is no claim step, and adding one would turn a send failure into a
 * lost lead rather than a repeated one. At one hourly hPanel entry that
 * overlap does not happen, and `architecture.md` §10.1 states the trade
 * explicitly rather than calling this "idempotent by construction".
 */
export async function retryLeadDelivery(limit = 200): Promise<RetryRunResult> {
  const pending = await listUndeliveredLeads(limit);
  if (pending.length === 0) return { attempted: 0, delivered: 0 };

  const institutionIds = [...new Set(pending.map((lead) => lead.institutionId))];
  const contacts = await getInstitutionContacts(institutionIds);

  let delivered = 0;
  for (const lead of pending) {
    try {
      const contact = contacts.get(lead.institutionId);
      const ok = await notifyInstitution({
        leadId: lead.id,
        institutionName: contact?.nameOfficial ?? 'tu institución',
        to: contact?.email ?? null,
        programName: await programNameFor(lead),
        name: lead.name,
        phoneE164: lead.phoneE164,
        email: lead.email,
        message: lead.message,
        sourcePage: lead.sourcePage,
      });
      if (ok) {
        // Immediately, and inside the try: the window between "the mail is
        // gone" and "we know it is gone" is the whole bug.
        await markLeadDelivered(lead.id);
        delivered += 1;
      }
    } catch (error) {
      console.error(`[leads] retry threw for lead ${lead.id}`, error);
    }
  }

  return { attempted: pending.length, delivered };
}
