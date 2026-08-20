/**
 * `leads.status` in Spanish, in one place.
 *
 * Two screens render it — `/panel/leads` for the institution and
 * `/admin/privacidad` for the operator servicing an R-06 request — and a raw
 * `discarded` on either of them is an English enum shown to a Spanish speaker
 * (CLAUDE.md rule 8). The tone map stays with `/panel/leads`: colour is that
 * screen's judgement about urgency, not a property of the status.
 */

import type { LeadStatus } from './contract';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nueva',
  sent: 'Enviada',
  contacted: 'Contactada',
  qualified: 'Calificada',
  discarded: 'Descartada',
};
