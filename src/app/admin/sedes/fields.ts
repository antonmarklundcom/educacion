import { PUBLICATION_STATUS } from '@/db/schema';
import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { STATUS_LABELS } from '@/lib/admin/labels';

export function campusFields(institutionOptions: Option[], cityOptions: Option[]): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'institutionId',
      label: 'Institución',
      required: true,
      options: institutionOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    { type: 'text', name: 'name', label: 'Nombre de la sede', required: true, maxLength: 200 },
    { type: 'text', name: 'slug', label: 'Slug (dejalo vacío para generarlo)', maxLength: 160 },
    {
      type: 'select',
      name: 'cityId',
      label: 'Ciudad',
      required: true,
      options: cityOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    { type: 'text', name: 'address', label: 'Dirección', maxLength: 320 },
    { type: 'text', name: 'phoneE164', label: 'Teléfono (número paraguayo)' },
    { type: 'checkbox', name: 'isMain', label: 'Es la sede principal' },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
  ];
}
