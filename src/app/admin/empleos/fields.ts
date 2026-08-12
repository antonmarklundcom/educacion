import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { JOB_SOURCE, PUBLICATION_STATUS } from '@/db/schema';
import { STATUS_LABELS } from '@/lib/admin/labels';
import { DEFAULT_TTL_DAYS } from '@/db/queries/jobs';

const SOURCE_LABELS: Record<(typeof JOB_SOURCE)[number], string> = {
  manual: 'Cargado a mano',
  trabajo_com_py: 'trabajo.com.py',
  empleos_com_py: 'empleos.com.py',
  institucion: 'Sitio de la institución o la empresa',
  otra: 'Otra',
};

export function jobFields(careers: Option[]): FieldDef[] {
  return [
    {
      type: 'select',
      name: 'careerId',
      label: 'Carrera',
      required: true,
      options: careers.map((o) => ({ value: String(o.id), label: o.label })),
      placeholder: 'Elegí la carrera…',
    },
    { type: 'text', name: 'title', label: 'Título del aviso', required: true, maxLength: 240 },
    { type: 'text', name: 'employerName', label: 'Empresa', required: true, maxLength: 200 },
    { type: 'text', name: 'locationLabel', label: 'Ubicación (como la dice el aviso)' },
    { type: 'url', name: 'url', label: 'Enlace al aviso original', required: true },
    {
      type: 'select',
      name: 'source',
      label: 'Origen',
      required: true,
      options: JOB_SOURCE.map((value) => ({ value, label: SOURCE_LABELS[value] })),
    },
    {
      type: 'text',
      name: 'sourceLabel',
      label: 'Cómo se acredita la fuente en la página (ej. "trabajo.com.py")',
      required: true,
      maxLength: 120,
    },
    { type: 'text', name: 'postedOn', label: 'Publicado el (AAAA-MM-DD)', required: true },
    {
      type: 'text',
      name: 'expiresOn',
      label: `Vence el (AAAA-MM-DD) — vacío: se deja de mostrar ${DEFAULT_TTL_DAYS} días después de publicado`,
    },
    { type: 'textarea', name: 'summary', label: 'Resumen breve (opcional)', rows: 3 },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
  ];
}
