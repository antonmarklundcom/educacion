/**
 * Copying a lead into Anton's VenderCRM (`POST {VENDERCRM_URL}/api/v1/leads`).
 *
 * Server-only: it reads `VENDERCRM_API_KEY`, which is never `NEXT_PUBLIC_` and
 * never reaches the browser. Like `notifyInstitution`, this runs after the row
 * is committed, never throws, and is bounded to 10 s — the student's success
 * does not depend on the CRM being up. Unset key = the copy is skipped.
 *
 * Never sends pipeline, stage, owner or tag: routing lives on the site record
 * inside the CRM.
 */

import { createHash } from 'node:crypto';

const DEFAULT_CRM_URL = 'https://crm.clientes.com.py';

export interface VenderCrmLead {
  leadId: number;
  phoneE164: string;
  name: string;
  email: string | null;
  message: string | null;
  institutionName: string;
  programName: string;
  offeringId: number;
  ageBracket: string;
  sourcePage: string | null;
}

/**
 * Same phone + same carrera within the same hour is the same submission. The
 * offering is part of the key on purpose: a student asking five universities in
 * one sitting is five enquiries, not one.
 */
export function venderCrmIdempotencyKey(phoneE164: string, offeringId: number, now = new Date()): string {
  const hour = now.toISOString().slice(0, 13).replace('T', '-'); // YYYY-MM-DD-HH
  return createHash('sha256').update(`${phoneE164}|${offeringId}|${hour}`).digest('hex');
}

export function venderCrmPayload(lead: VenderCrmLead, now = new Date()): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    phone: lead.phoneE164,
    idempotency_key: venderCrmIdempotencyKey(lead.phoneE164, lead.offeringId, now),
    name: lead.name,
    email: lead.email ?? undefined,
    message: lead.message ?? undefined,
    source: 'solicitud-informacion',
    page_url: lead.sourcePage ?? undefined,
    fields: {
      institucion: lead.institutionName,
      carrera: lead.programName,
      edad: lead.ageBracket,
      lead_id: String(lead.leadId),
    },
  };
  // Omit empties: an empty string fails the CRM's validation (e.g. `email`).
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

/** `true` when the CRM accepted the lead (201, or 200 on an idempotent replay). Never throws. */
export async function sendLeadToVenderCrm(lead: VenderCrmLead): Promise<boolean> {
  const apiKey = process.env.VENDERCRM_API_KEY;
  if (!apiKey) return false;
  const base = (process.env.VENDERCRM_URL || DEFAULT_CRM_URL).replace(/\/+$/, '');

  try {
    const response = await fetch(`${base}/api/v1/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(venderCrmPayload(lead)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // The body names the failing field (422) or the problem (401/403); it
      // never contains the key. Truncated so a lead's own text cannot flood the log.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      console.error(`[leads] lead ${lead.leadId} VenderCRM failed: HTTP ${response.status} ${detail}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      `[leads] lead ${lead.leadId} VenderCRM unreachable`,
      error instanceof Error ? error.name : 'error',
    );
    return false;
  }
}
