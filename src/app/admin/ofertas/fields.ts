import { MODALITY, PUBLICATION_STATUS, SHIFT } from '@/db/schema';
import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { STATUS_LABELS } from '@/lib/admin/labels';
import { MODALITY_LABELS, SHIFT_LABELS } from '@/lib/search/labels';

/**
 * No `enrollmentStatus` field here — data-model.md §2 says it is derived
 * daily from the active admission window, not hand-maintained, and
 * admissions are PR-20's. No accreditation field either.
 */
export function offeringFields(programOptions: Option[], campusOptions: Option[]): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'programId',
      label: 'Programa',
      required: true,
      options: programOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'campusId',
      label: 'Sede',
      required: true,
      options: campusOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'modality',
      label: 'Modalidad',
      required: true,
      options: MODALITY.map((value) => ({ value, label: MODALITY_LABELS[value] })),
    },
    {
      type: 'select',
      name: 'shift',
      label: 'Turno',
      required: true,
      options: SHIFT.map((value) => ({ value, label: SHIFT_LABELS[value] })),
    },
    { type: 'number', name: 'durationMonths', label: 'Duración (meses)', min: 1 },
    { type: 'number', name: 'credits', label: 'Créditos', min: 1 },
    { type: 'url', name: 'planUrl', label: 'Plan de estudio (URL)' },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
  ];
}
