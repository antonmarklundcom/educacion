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
import { listUndeliveredLeads, markLeadsDelivered, type LeadRecord } from '@/db/queries/leads';
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

/** Never throws — a bad row must not stop the rest of the batch. */
export async function retryLeadDelivery(limit = 200): Promise<RetryRunResult> {
  const pending = await listUndeliveredLeads(limit);
  if (pending.length === 0) return { attempted: 0, delivered: 0 };

  const institutionIds = [...new Set(pending.map((lead) => lead.institutionId))];
  const contacts = await getInstitutionContacts(institutionIds);

  const delivered: number[] = [];
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
      if (ok) delivered.push(lead.id);
    } catch (error) {
      console.error(`[leads] retry threw for lead ${lead.id}`, error);
    }
  }

  await markLeadsDelivered(delivered);
  return { attempted: pending.length, delivered: delivered.length };
}
