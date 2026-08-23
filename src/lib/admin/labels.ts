/** Spanish labels the admin forms need that `lib/search/labels.ts` has no reason to carry. */

import type { PublicationStatus } from './validation';

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

/**
 * `activity_log.entity_type` → Spanish (PR-44).
 *
 * `entity_type` is a `varchar` each caller of `logActivity` picks for itself,
 * so this map is a *display* convenience and never a vocabulary: the viewer
 * falls back to the raw value, which is what keeps a newly logged entity
 * visible on the day it starts being written instead of on the day somebody
 * remembers to add it here.
 */
export const ENTITY_LABELS: Record<string, string> = {
  accreditation: 'Acreditación',
  admission: 'Convocatoria',
  area: 'Área',
  beca: 'Beca',
  campus: 'Sede',
  career: 'Carrera',
  claim: 'Reclamo',
  cron_job: 'Trabajo programado',
  curation_conflict: 'Conflicto de curaduría',
  import_run: 'Importación',
  institution: 'Institución',
  institution_member: 'Miembro de institución',
  job_posting: 'Empleo',
  lead: 'Solicitud',
  personal_data: 'Datos personales',
  post: 'Artículo',
  price: 'Arancel',
  program: 'Programa',
  subscription: 'Suscripción',
  user: 'Cuenta',
};

/** `activity_log.action` → Spanish. Same fallback rule as above. */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  approve: 'Aprobó',
  archive: 'Archivó',
  create: 'Creó',
  delete: 'Borró',
  run: 'Ejecutó',
  update: 'Editó',
};
