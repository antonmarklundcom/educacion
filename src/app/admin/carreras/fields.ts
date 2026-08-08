import { PROGRAM_LEVEL, PUBLICATION_STATUS } from '@/db/schema';
import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { STATUS_LABELS } from '@/lib/admin/labels';
import { LEVEL_LABELS } from '@/lib/search/labels';

/**
 * `salidaLaboralMd` is a free-text field an editor fills by hand, no
 * generator behind it — risks.md §R-11, no fabricated salary/employability
 * claims.
 */
export function careerFields(areaOptions: Option[]): FieldDef[] {
  return [
    { type: 'text', name: 'nameEs', label: 'Nombre', required: true, maxLength: 200 },
    { type: 'text', name: 'slug', label: 'Slug (dejalo vacío para generarlo)', maxLength: 128 },
    {
      type: 'select',
      name: 'areaId',
      label: 'Área',
      options: areaOptions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'levelDefault',
      label: 'Nivel por defecto',
      required: true,
      options: PROGRAM_LEVEL.map((value) => ({ value, label: LEVEL_LABELS[value] })),
    },
    {
      type: 'text',
      name: 'synonyms',
      label: 'Sinónimos (separados por coma) — usados por el emparejador',
    },
    {
      type: 'textarea',
      name: 'descriptionMd',
      label: 'Descripción (editorial, 150+ palabras)',
      rows: 8,
    },
    {
      type: 'textarea',
      name: 'salidaLaboralMd',
      label: 'Salida laboral (cualitativo — sin cifras sin fuente, risks.md §R-11)',
      rows: 6,
    },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
  ];
}
