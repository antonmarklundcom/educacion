/**
 * The admission calendar, as far as the index knows it.
 *
 * Paraguay has no central admission (plan.md §1): every faculty runs its own
 * convocatoria and its own examen de ingreso. So this block says what we
 * verified and nothing more — never an inferred "las inscripciones suelen
 * abrir en febrero", which would be a fabricated date wearing a hedge.
 */

import { EnrollmentBadge } from '@/components/browse';
import { Card } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { OfferingSummary } from '@/lib/search';

const NOTES: Record<OfferingSummary['enrollmentStatus'], string> = {
  abiertas: 'La convocatoria está abierta según el último dato que verificamos.',
  proximamente: 'La institución anunció la convocatoria, pero todavía no abrió la inscripción.',
  cerradas: 'La convocatoria está cerrada. Consultá con la institución por el próximo llamado.',
  sin_datos:
    'Todavía no tenemos fechas verificadas para esta convocatoria. Cada facultad publica su propio calendario, así que conviene confirmarlo con la institución.',
};

export function AdmissionBlock({ offering }: { offering: OfferingSummary }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">Inscripción</h2>

      <EnrollmentBadge status={offering.enrollmentStatus} className="self-start" />

      {offering.admissionClosesOn && (
        <p className="text-ink font-mono text-sm">
          Cierra el {formatDate(offering.admissionClosesOn)}
        </p>
      )}

      <p className="text-body text-sm">{NOTES[offering.enrollmentStatus]}</p>
    </Card>
  );
}
