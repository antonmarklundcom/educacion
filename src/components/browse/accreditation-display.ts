/**
 * How an accreditation is worded and coloured — the two rules from CLAUDE.md
 * rule 2 and design-system.md §4, in plain functions so they can be unit
 * tested without rendering anything.
 *
 *  - `sin_datos` is **"Sin datos de acreditación"**. Never "No acreditada":
 *    an unverified negative is the legally dangerous claim (risks.md §R-09).
 *  - A CONES record is a *habilitación*, not an acreditación. Calling it one
 *    is the exact conflation the accreditation hub exists to correct.
 */

import type { BadgeTone } from '@/components/ui';
import { ACCREDITATION_STATUS_LABELS, type AccreditationSummary } from '@/lib/search';

const TONES: Record<AccreditationSummary['status'], BadgeTone> = {
  vigente: 'ok',
  en_proceso: 'warn',
  vencida: 'warn',
  no_acreditada: 'danger',
  sin_datos: 'neutral',
};

export function accreditationLabel(accreditation: AccreditationSummary): string {
  const { status, agency } = accreditation;
  if (status === 'vigente') {
    if (agency === 'CONES') return 'Habilitada CONES';
    return agency ? `Acreditada ${agency}` : 'Acreditada';
  }
  return ACCREDITATION_STATUS_LABELS[status];
}

export function accreditationTone(accreditation: AccreditationSummary): BadgeTone {
  if (accreditation.status === 'vigente' && accreditation.agency === 'CONES') return 'info';
  return TONES[accreditation.status];
}
