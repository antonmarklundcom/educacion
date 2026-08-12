import type { FieldDef } from '@/components/admin/AdminForm';
import { PUBLICATION_STATUS } from '@/db/schema';
import { STATUS_LABELS } from '@/lib/admin/labels';

/**
 * The blog form. `bodyMd` accepts the subset `lib/content/markdown` renders —
 * the hint says which, because an editor typing a table and seeing literal
 * pipes deserves to know why before they save.
 */
export function postFields(): FieldDef[] {
  return [
    { type: 'text', name: 'title', label: 'Título', required: true, maxLength: 200 },
    { type: 'text', name: 'slug', label: 'Slug (vacío = generado del título)', maxLength: 160 },
    {
      type: 'textarea',
      name: 'excerpt',
      label: 'Resumen (se usa en el listado y como meta description, ≤320)',
      rows: 3,
    },
    {
      type: 'textarea',
      name: 'bodyMd',
      label:
        'Cuerpo — markdown: ## y ### para títulos, - para listas, **negrita**, [texto](/carreras/medicina) para enlaces. Antes de publicar necesita al menos un enlace a /carreras, /universidades, /areas, /becas o /acreditacion.',
      rows: 22,
    },
    { type: 'text', name: 'authorName', label: 'Autor (nombre visible)', required: true },
    { type: 'text', name: 'authorBio', label: 'Bio del autor (una o dos frases)', maxLength: 320 },
    {
      type: 'select',
      name: 'status',
      label: 'Estado',
      required: true,
      options: PUBLICATION_STATUS.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
    {
      type: 'text',
      name: 'publishedAt',
      label: 'Fecha de publicación (AAAA-MM-DD) — vacío: se sella sola al publicar',
    },
  ];
}
