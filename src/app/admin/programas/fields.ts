import { PROGRAM_LEVEL, PUBLICATION_STATUS } from '@/db/schema';
import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { STATUS_LABELS } from '@/lib/admin/labels';
import { LEVEL_LABELS } from '@/lib/search/labels';

export function programFields(institutionOptions: Option[], careerOptions: Option[]): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'institutionId',
      label: 'Institución',
      required: true,
      options: institutionOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'careerId',
      label: 'Carrera canónica',
      options: careerOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'text',
      name: 'nameOfficial',
      label: 'Nombre oficial (como fue habilitado)',
      required: true,
      maxLength: 320,
    },
    { type: 'text', name: 'slug', label: 'Slug (dejalo vacío para generarlo)', maxLength: 160 },
    {
      type: 'select',
      name: 'level',
      label: 'Nivel',
      required: true,
      options: PROGRAM_LEVEL.map((value) => ({ value, label: LEVEL_LABELS[value] })),
    },
    { type: 'text', name: 'titleAwarded', label: 'Título que otorga', maxLength: 320 },
    { type: 'textarea', name: 'descriptionMd', label: 'Descripción', rows: 6 },
    { type: 'text', name: 'conesResolution', label: 'Resolución CONES', maxLength: 120 },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
  ];
}
