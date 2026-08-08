import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { ACCREDITATION_SCOPE } from '@/db/schema';

const SCOPE_LABELS: Record<(typeof ACCREDITATION_SCOPE)[number], string> = {
  institution: 'Toda la institución',
  program: 'Un programa',
  offering: 'Una oferta puntual',
};

/**
 * `admissions` reuses `ACCREDITATION_SCOPE` — the same three-way polymorphic
 * enum, not a coincidence: a convocatoria, like an accreditation, can belong to
 * an institution, a programme or one concrete offering.
 *
 * Saving one restates `offerings.enrollment_status` for everything it covers,
 * so there is no enrolment field on this form and there must not be:
 * `data-model.md` §2 makes that column derived, and a hand-typed value would be
 * overwritten by the next cron run.
 */
export function admissionFields(
  institutionOptions: Option[],
  programOptions: Option[],
  offeringOptions: Option[],
): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'scope',
      label: '¿A qué se aplica?',
      required: true,
      options: ACCREDITATION_SCOPE.map((value) => ({ value, label: SCOPE_LABELS[value] })),
    },
    {
      type: 'select',
      name: 'institutionId',
      label: 'Institución (si el alcance es la institución)',
      options: institutionOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'programId',
      label: 'Programa (si el alcance es un programa)',
      options: programOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'offeringId',
      label: 'Oferta (si el alcance es una oferta)',
      options: offeringOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'text',
      name: 'periodLabel',
      label: 'Período ("Convocatoria 2027 - 1er llamado")',
      required: true,
      maxLength: 160,
    },
    { type: 'text', name: 'registrationOpens', label: 'Inscripciones abren (AAAA-MM-DD)' },
    { type: 'text', name: 'registrationCloses', label: 'Inscripciones cierran (AAAA-MM-DD)' },
    { type: 'text', name: 'examDate', label: 'Fecha del examen (AAAA-MM-DD)' },
    { type: 'text', name: 'classesStart', label: 'Inicio de clases (AAAA-MM-DD)' },
    { type: 'url', name: 'url', label: 'Enlace a la convocatoria' },
    {
      type: 'textarea',
      name: 'requirementsMd',
      label: 'Requisitos (CPI, CBA, examen, ingreso directo)',
      rows: 5,
    },
    { type: 'textarea', name: 'processMd', label: 'Proceso de inscripción', rows: 5 },
    {
      type: 'checkbox',
      name: 'isActive',
      label: 'Activa — define el estado de inscripción de las ofertas que cubre',
    },
  ];
}
