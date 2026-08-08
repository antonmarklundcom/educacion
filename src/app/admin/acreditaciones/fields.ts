import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import {
  ACCREDITATION_AGENCY,
  ACCREDITATION_KIND,
  ACCREDITATION_SCOPE,
  ACCREDITATION_STATUS,
} from '@/db/schema';
import { ACCREDITATION_STATUS_LABELS } from '@/lib/search/labels';

const SCOPE_LABELS: Record<(typeof ACCREDITATION_SCOPE)[number], string> = {
  institution: 'Toda la institución',
  program: 'Un programa',
  offering: 'Una oferta puntual',
};

const KIND_LABELS: Record<(typeof ACCREDITATION_KIND)[number], string> = {
  acreditacion: 'Acreditación (ANEAES / ARCU-SUR)',
  habilitacion: 'Habilitación (CONES)',
  en_proceso: 'En proceso',
};

/**
 * The form the acceptance criteria single out: *it refuses to save a positive
 * status without a source*.
 *
 * The refusal is server-side, in `parseAccreditationInput`. What this file
 * contributes is that the fields which satisfy it — `resolutionNumber` and
 * `sourceUrl` — sit directly under the status select and say so, so the
 * requirement is visible before the save rather than only after it.
 *
 * The status select carries every value including `no_acreditada`, which is
 * held to the same citation bar as a positive claim: unknown is `sin_datos`
 * ("Sin datos de acreditación"), never "No acreditada" (`risks.md` §R-09).
 */
export function accreditationFields(
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
      type: 'select',
      name: 'agency',
      label: 'Agencia',
      required: true,
      options: ACCREDITATION_AGENCY.map((value) => ({ value, label: value })),
    },
    {
      type: 'select',
      name: 'kind',
      label: 'Tipo — el CONES habilita, la ANEAES acredita',
      required: true,
      options: ACCREDITATION_KIND.map((value) => ({ value, label: KIND_LABELS[value] })),
    },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: ACCREDITATION_STATUS.map((value) => ({
        value,
        label: ACCREDITATION_STATUS_LABELS[value],
      })),
    },
    {
      type: 'text',
      name: 'resolutionNumber',
      label: 'Número de resolución — obligatorio si el estado afirma algo',
      maxLength: 120,
    },
    {
      type: 'url',
      name: 'sourceUrl',
      label: 'Enlace a la fuente — vale como alternativa al número de resolución',
    },
    { type: 'text', name: 'resolutionDate', label: 'Fecha de la resolución (AAAA-MM-DD)' },
    {
      type: 'text',
      name: 'model',
      label: 'Modelo ("Modelo Nacional", "ARCU-SUR")',
      maxLength: 120,
    },
    { type: 'text', name: 'validFrom', label: 'Vigente desde (AAAA-MM-DD)' },
    { type: 'text', name: 'validTo', label: 'Vigente hasta (AAAA-MM-DD)' },
  ];
}
