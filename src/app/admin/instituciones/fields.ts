import { INSTITUTION_TYPE, MANAGEMENT, PUBLICATION_STATUS } from '@/db/schema';
import type { FieldDef } from '@/components/admin/AdminForm';
import { INSTITUTION_TYPE_LABELS, MANAGEMENT_LABELS } from '@/lib/search/labels';
import { STATUS_LABELS } from '@/lib/admin/labels';

/**
 * `management` has no `placeholder` fallback and no `<option selected>` —
 * the empty option is the only unselected state, which is what forces a
 * human to pick rather than defaulting to 'privada' (CLAUDE.md rule 1).
 * Accreditation is not in this list at all: it is not editable from PR-19.
 */
export function institutionFields(): FieldDef[] {
  return [
    { type: 'text', name: 'nameOfficial', label: 'Nombre oficial', required: true, maxLength: 320 },
    { type: 'text', name: 'nameShort', label: 'Nombre corto', required: true, maxLength: 120 },
    { type: 'text', name: 'acronym', label: 'Sigla', maxLength: 32 },
    { type: 'text', name: 'slug', label: 'Slug (dejalo vacío para generarlo)', maxLength: 160 },
    {
      type: 'select',
      name: 'management',
      label: 'Gestión',
      required: true,
      options: MANAGEMENT.map((value) => ({ value, label: MANAGEMENT_LABELS[value] })),
    },
    {
      type: 'select',
      name: 'type',
      label: 'Tipo de institución',
      required: true,
      options: INSTITUTION_TYPE.map((value) => ({ value, label: INSTITUTION_TYPE_LABELS[value] })),
    },
    { type: 'text', name: 'conesCode', label: 'Código CONES', maxLength: 64 },
    { type: 'number', name: 'foundedYear', label: 'Año de fundación', min: 1800 },
    { type: 'url', name: 'website', label: 'Sitio web' },
    { type: 'email', name: 'email', label: 'Email' },
    { type: 'text', name: 'phoneE164', label: 'Teléfono (número paraguayo)' },
    { type: 'text', name: 'whatsappE164', label: 'WhatsApp (número paraguayo)' },
    { type: 'text', name: 'brandColor', label: 'Color de marca (hex, ej. #0d6e86)', maxLength: 9 },
    { type: 'textarea', name: 'descriptionMd', label: 'Descripción', rows: 6 },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
    {
      type: 'file',
      name: 'logo',
      label: 'Logo',
      accept: 'image/png,image/jpeg,image/webp',
      hint: 'PNG, JPG o WEBP, hasta 2 MB. Se sube a almacenamiento externo (R-08) y sobrevive a los redeploys.',
    },
  ];
}
