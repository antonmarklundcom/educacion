/**
 * Spanish labels for the enum-valued facet groups.
 *
 * Kept here rather than in the components because both the card view (PR-08)
 * and the table view (PR-09) render the same rail and must not invent their
 * own wording. Where `design-system.md` §4 fixes a badge label, this file uses
 * it verbatim — in particular `Sin datos de acreditación`, never
 * `No acreditada` (CLAUDE.md rule 2).
 */

import type {
  AccreditationStatus,
  EnrollmentStatus,
  InstitutionType,
  Level,
  Management,
  Modality,
  Shift,
  SortKey,
} from './contract';

export const LEVEL_LABELS: Record<Level, string> = {
  tecnicatura: 'Tecnicatura',
  grado: 'Grado',
  especializacion: 'Especialización',
  maestria: 'Maestría',
  doctorado: 'Doctorado',
};

export const MANAGEMENT_LABELS: Record<Management, string> = {
  publica: 'Pública',
  privada: 'Privada',
};

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  universidad: 'Universidad',
  instituto_superior: 'Instituto superior',
  instituto_tecnico: 'Instituto técnico',
  ifd: 'Instituto de formación docente',
  otro: 'Otro',
};

export const MODALITY_LABELS: Record<Modality, string> = {
  presencial: 'Presencial',
  semipresencial: 'Semipresencial',
  distancia: 'A distancia',
};

export const SHIFT_LABELS: Record<Shift, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
  noche: 'Noche',
  flexible: 'Flexible',
};

export const ACCREDITATION_STATUS_LABELS: Record<AccreditationStatus, string> = {
  vigente: 'Acreditada',
  en_proceso: 'En proceso de acreditación',
  vencida: 'Acreditación vencida',
  no_acreditada: 'No acreditada',
  sin_datos: 'Sin datos de acreditación',
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  abiertas: 'Inscripciones abiertas',
  proximamente: 'Próximamente',
  cerradas: 'Inscripciones cerradas',
  sin_datos: 'Sin datos',
};

/**
 * Sort options, worded once. The card view and the table view offer the same
 * seven and must not paraphrase each other — a user who switches views should
 * see their sort survive under the same name.
 */
export const SORT_LABELS: Record<SortKey, string> = {
  relevancia: 'Relevancia',
  arancel_asc: 'Arancel: de menor a mayor',
  arancel_desc: 'Arancel: de mayor a menor',
  duracion_asc: 'Duración: más corta primero',
  duracion_desc: 'Duración: más larga primero',
  nombre_asc: 'Carrera: A–Z',
  institucion_asc: 'Institución: A–Z',
};
