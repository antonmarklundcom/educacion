/**
 * Enrolment status, with the dot the prototypes use.
 *
 * `sin_datos` is a real state and says so — we do not guess that a convocatoria
 * is open because the season suggests it.
 */

import { Badge, type BadgeTone } from '@/components/ui';
import { ENROLLMENT_STATUS_LABELS, type OfferingSummary } from '@/lib/search';

const TONES: Record<OfferingSummary['enrollmentStatus'], BadgeTone> = {
  abiertas: 'ok',
  proximamente: 'warn',
  cerradas: 'danger',
  sin_datos: 'neutral',
};

export function EnrollmentBadge({
  status,
  className,
}: {
  status: OfferingSummary['enrollmentStatus'];
  className?: string;
}) {
  return (
    <Badge tone={TONES[status]} dot className={className}>
      {status === 'sin_datos' ? 'Sin datos de inscripción' : ENROLLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
