/**
 * The lead pipeline's server surface — one function, `submitLead()`.
 *
 * The route handler is deliberately thin: everything that decides whether a
 * lead exists happens here, in order, and the order is the design
 * (`architecture.md` §6).
 *
 *  1. **Origin.** A browser always sends `Origin` on a cross-site POST, so a
 *     mismatch means the form is not ours. Cheap, and first.
 *  2. **In-process rate limit.** Absorbs floods, and it is the only tier that
 *     can see attempts that never become rows.
 *  3. **Validation**, including consent — pure, and the honeypot answers 200.
 *  4. **Resolve the offering.** `institutionId` comes from the index, never
 *     from the client, so a lead cannot be addressed at an institution the
 *     carrera does not belong to.
 *  5. **Durable quota**, derived from `leads` itself.
 *  6. **Insert**, then the `lead_submit` event, then the notification.
 *
 * Steps 6's tail is intentionally after the commit: the row is the deliverable
 * and a mail provider having a bad afternoon must not lose a student.
 *
 * **Never import this from a client component** — it reaches mysql2. The modal
 * imports `@/lib/leads/contract`, which is types and copy only.
 */

import {
  createLead,
  countRecentByIpHash,
  countRecentByPhone,
  markLeadDelivered,
} from '@/db/queries/leads';
import { getInstitutionContacts } from '@/db/queries/institutions';
import { recordEvent } from '@/lib/events';
import { hashIp } from '@/lib/privacy/hash';
import { clientIp, isSameOrigin, userAgent } from '@/lib/privacy/request';
import { getOfferingsByIds } from '@/lib/search';

import type { LeadErrorCode } from './contract';
import { notifyInstitution } from './notify';
import { checkRate } from './rate-limit';
import { validateLead } from './validate';

export type { LeadRecord, LeadInsert } from '@/db/queries/leads';
export { listLeadsForInstitution, markLeadDelivered } from '@/db/queries/leads';

/* -------------------------------------------------------------------------- */
/* The durable quota (architecture.md §6.1, tier two)                         */
/* -------------------------------------------------------------------------- */

/**
 * Per phone, per day.
 *
 * Five is generous on purpose: a student comparing five universities and asking
 * all of them is the behaviour this site exists to produce, and a limit that
 * punishes it would be a limit against our own users. What it stops is the
 * hundred-submission script, which is the actual threat.
 */
export const MAX_LEADS_PER_PHONE_PER_DAY = 5;

/**
 * Per hashed IP, per day. Higher than the phone limit because a school computer
 * lab, a cyber café and a mobile carrier's NAT all put many genuine students
 * behind one address — the per-IP tier must not be the one that decides.
 */
export const MAX_LEADS_PER_IP_PER_DAY = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */

export type SubmitLeadResult =
  | { ok: true; leadId: number | null; delivered: boolean }
  | { ok: false; error: LeadErrorCode; retryAfterSeconds?: number };

/**
 * `leadId: null` with `ok: true` is the honeypot outcome: the caller answers
 * exactly as it would for a real lead, and nothing was stored. A bot that can
 * tell the difference learns which field to leave alone.
 */
export async function submitLead(request: Request, payload: unknown): Promise<SubmitLeadResult> {
  if (!isSameOrigin(request)) return { ok: false, error: 'invalid_origin' };

  const ip = clientIp(request);
  const ipHash = hashIp(ip);

  const burst = checkRate(`lead:${ipHash}`);
  if (!burst.allowed) {
    return { ok: false, error: 'rate_limited', retryAfterSeconds: burst.retryAfterSeconds };
  }

  const validated = validateLead(payload);
  if (!validated.ok) {
    if (validated.honeypot) return { ok: true, leadId: null, delivered: false };
    return { ok: false, error: validated.error };
  }
  const lead = validated.lead;

  const [offering] = await getOfferingsByIds([lead.offeringId]);
  if (!offering) return { ok: false, error: 'unknown_offering' };

  const since = new Date(Date.now() - DAY_MS);
  const [phoneCount, ipCount] = await Promise.all([
    countRecentByPhone(lead.phoneE164, since),
    countRecentByIpHash(ipHash, since),
  ]);
  if (phoneCount >= MAX_LEADS_PER_PHONE_PER_DAY || ipCount >= MAX_LEADS_PER_IP_PER_DAY) {
    return { ok: false, error: 'rate_limited' };
  }

  const leadId = await createLead({
    institutionId: offering.institutionId,
    offeringId: offering.offeringId,
    name: lead.name,
    phoneE164: lead.phoneE164,
    email: lead.email,
    message: lead.message,
    ageBracket: lead.ageBracket,
    consentTextVersion: lead.consentTextVersion,
    consentAt: lead.consentAt,
    sourcePage: lead.sourcePage,
    ipHash,
    userAgent: userAgent(request) || null,
  });

  // Server-side, from the path that created the row — a client can never claim
  // a `lead_submit`, which is the number an institution is invoiced against.
  await recordEvent({
    type: 'lead_submit',
    offeringId: offering.offeringId,
    institutionId: offering.institutionId,
    request,
  });

  const contact = (await getInstitutionContacts([offering.institutionId])).get(
    offering.institutionId,
  );
  const delivered = await notifyInstitution({
    leadId,
    institutionName: contact?.nameOfficial ?? offering.institutionName,
    to: contact?.email ?? null,
    programName: offering.programName,
    name: lead.name,
    phoneE164: lead.phoneE164,
    email: lead.email,
    message: lead.message,
    sourcePage: lead.sourcePage,
  });
  if (delivered) await markLeadDelivered(leadId);

  return { ok: true, leadId, delivered };
}
