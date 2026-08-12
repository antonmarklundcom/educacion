import type { FieldDef } from '@/components/admin/AdminForm';
import type { Option } from '@/db/queries/admin/options';
import { BECA_COVERAGE, BECA_TYPE, PUBLICATION_STATUS } from '@/db/schema';
import { STATUS_LABELS } from '@/lib/admin/labels';

export const BECA_TYPE_LABELS: Record<(typeof BECA_TYPE)[number], string> = {
  institucional: 'De la propia institución',
  estatal: 'Del Estado (MEC, Itaipú, Becal…)',
  privada: 'De una empresa o fundación',
  internacional: 'Internacional',
};

export const BECA_COVERAGE_LABELS: Record<(typeof BECA_COVERAGE)[number], string> = {
  total: 'Cubre el 100% del arancel',
  parcial: 'Cubre un porcentaje',
  monto_fijo: 'Un monto fijo en guaraníes',
  sin_datos: 'No sabemos cuánto cubre',
};

export function becaFields(institutions: Option[], areas: Option[]): FieldDef[] {
  return [
    { type: 'text', name: 'title', label: 'Título', required: true, maxLength: 240 },
    { type: 'text', name: 'slug', label: 'Slug (vacío = generado del título)', maxLength: 160 },
    {
      type: 'textarea',
      name: 'summary',
      label: 'Resumen (una o dos frases, se ve en el listado)',
      rows: 3,
    },
    {
      type: 'select',
      name: 'institutionId',
      label: 'Institución que la otorga (si está en el índice)',
      options: institutions.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'text',
      name: 'providerName',
      label: 'O el nombre de quien la otorga (Itaú, MEC, Becal…)',
      maxLength: 200,
    },
    {
      type: 'select',
      name: 'areaId',
      label: 'Área (si aplica a una sola)',
      options: areas.map((o) => ({ value: String(o.id), label: o.label })),
    },
    {
      type: 'select',
      name: 'type',
      label: 'Tipo',
      required: true,
      options: BECA_TYPE.map((value) => ({ value, label: BECA_TYPE_LABELS[value] })),
    },
    {
      type: 'select',
      name: 'coverage',
      label: 'Cobertura',
      required: true,
      options: BECA_COVERAGE.map((value) => ({ value, label: BECA_COVERAGE_LABELS[value] })),
    },
    { type: 'text', name: 'amountPyg', label: 'Monto en guaraníes (solo si es monto fijo)' },
    {
      type: 'number',
      name: 'percentage',
      label: 'Porcentaje (solo si es parcial)',
      min: 1,
      max: 99,
    },
    { type: 'text', name: 'deadline', label: 'Fecha límite (AAAA-MM-DD) — vacío: permanente' },
    {
      type: 'url',
      name: 'sourceUrl',
      label: 'Fuente (obligatoria: de dónde sacamos esta beca)',
      required: true,
    },
    { type: 'url', name: 'applyUrl', label: 'Enlace para postularse' },
    { type: 'textarea', name: 'detailsMd', label: 'Detalle (markdown)', rows: 10 },
    { type: 'textarea', name: 'requirementsMd', label: 'Requisitos (markdown)', rows: 8 },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
  ];
}
