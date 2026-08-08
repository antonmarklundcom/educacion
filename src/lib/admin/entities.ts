/**
 * The admin's five core entities, described once (PR-19).
 *
 * ### Why a registry instead of ten hand-written forms
 *
 * `pr-plan.md` asks for "a shared table/list component, one form component for
 * create+edit". Five entities × (list + create + edit) is fifteen screens if
 * each is written out, and fifteen places for the accent rule, the enum
 * vocabulary or a required-field check to drift. A field descriptor is the
 * smallest thing that both the table and the form can read, and it is pure, so
 * the parsing and derivation rules below are unit-testable without a browser or
 * a database.
 *
 * ### What is deliberately not editable here
 *
 * - `enrollment_status` on an offering is **derived** from the active admission
 *   window by the daily cron (`data-model.md` §2). It renders read-only; a hand
 *   edit would be overwritten within a day and would read as a bug.
 * - `match_key` and `slug` are derived from the name unless typed. They are the
 *   matcher's key and the URL, not free-text fields, and a typo in either is
 *   expensive to notice.
 * - Prices, accreditations and admissions are **PR-20's**, not omissions.
 *   Accreditation in particular must pass the citation invariant, which is a
 *   form of its own.
 */

import {
  INSTITUTION_TYPE,
  MANAGEMENT,
  MODALITY,
  PROGRAM_LEVEL,
  PUBLICATION_STATUS,
  SHIFT,
} from '@/db/schema';
import { buildCareerMatchKey, buildMatchKey, slugify } from '@/lib/curate';
import {
  INSTITUTION_TYPE_LABELS,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
} from '@/lib/search/labels';

export const ADMIN_ENTITIES = [
  'instituciones',
  'sedes',
  'carreras',
  'programas',
  'ofertas',
] as const;
export type AdminEntity = (typeof ADMIN_ENTITIES)[number];

export function isAdminEntity(value: string): value is AdminEntity {
  return (ADMIN_ENTITIES as readonly string[]).includes(value);
}

/** Lists the admin loads once per form so a reference field can be a `<select>`. */
export type ReferenceKind = 'institution' | 'campus' | 'career' | 'area' | 'city' | 'program';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'enum'
  | 'boolean'
  | 'reference'
  | 'url'
  | 'email'
  | 'phone'
  | 'color';

export interface FieldDef {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  reference?: ReferenceKind;
  help?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Rendered, never submitted. Used for fields the system owns. */
  readOnly?: boolean;
}

export interface EntityDef {
  key: AdminEntity;
  /** The Drizzle table name, and what `activity_log.entity_type` records. */
  table: 'institution' | 'campus' | 'career' | 'program' | 'offering';
  singular: string;
  plural: string;
  /** The field whose value names a row in the list and in the log. */
  titleField: string;
  fields: readonly FieldDef[];
  listColumns: readonly string[];
  /** Reference fields shown as a filter above the list. */
  listFilter?: { field: string; reference: ReferenceKind };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const statusField: FieldDef = {
  name: 'status',
  label: 'Estado',
  kind: 'enum',
  required: true,
  options: PUBLICATION_STATUS,
  optionLabels: STATUS_LABELS,
  help: 'Solo lo publicado entra en el índice de búsqueda.',
};

export const ENTITY_DEFS: Readonly<Record<AdminEntity, EntityDef>> = {
  instituciones: {
    key: 'instituciones',
    table: 'institution',
    singular: 'Institución',
    plural: 'Instituciones',
    titleField: 'nameOfficial',
    listColumns: ['nameShort', 'nameOfficial', 'management', 'type', 'status'],
    fields: [
      {
        name: 'nameOfficial',
        label: 'Nombre oficial',
        kind: 'text',
        required: true,
        maxLength: 320,
        help: 'Exactamente como figura en el registro del CONES.',
      },
      {
        name: 'nameShort',
        label: 'Nombre corto',
        kind: 'text',
        required: true,
        maxLength: 120,
        help: 'El que se muestra en las tarjetas y en la tabla: "UNA", "UC".',
      },
      { name: 'acronym', label: 'Sigla', kind: 'text', maxLength: 32 },
      {
        name: 'slug',
        label: 'Slug',
        kind: 'text',
        maxLength: 160,
        help: 'Se calcula del nombre si lo dejás vacío. Cambiarlo rompe los enlaces existentes.',
      },
      {
        name: 'management',
        label: 'Gestión',
        kind: 'enum',
        required: true,
        options: MANAGEMENT,
        optionLabels: MANAGEMENT_LABELS,
      },
      {
        name: 'type',
        label: 'Tipo',
        kind: 'enum',
        required: true,
        options: INSTITUTION_TYPE,
        optionLabels: INSTITUTION_TYPE_LABELS,
      },
      { name: 'conesCode', label: 'Código CONES', kind: 'text', maxLength: 64 },
      {
        name: 'foundedYear',
        label: 'Año de fundación',
        kind: 'number',
        min: 1500,
        max: 2100,
        help: 'Dejalo vacío si no lo verificaste. No estimes.',
      },
      { name: 'website', label: 'Sitio web', kind: 'url', maxLength: 512 },
      { name: 'email', label: 'Email de contacto', kind: 'email', maxLength: 255 },
      { name: 'phoneE164', label: 'Teléfono (E.164)', kind: 'phone', maxLength: 20 },
      {
        name: 'whatsappE164',
        label: 'WhatsApp (E.164)',
        kind: 'phone',
        maxLength: 20,
        help: 'Sin número no se muestra el botón. No pongas el fijo como sustituto.',
      },
      { name: 'brandColor', label: 'Color de marca', kind: 'color', maxLength: 9 },
      { name: 'descriptionMd', label: 'Descripción', kind: 'textarea' },
      statusField,
    ],
  },

  sedes: {
    key: 'sedes',
    table: 'campus',
    singular: 'Sede',
    plural: 'Sedes',
    titleField: 'name',
    listColumns: ['name', 'institutionId', 'cityId', 'isMain', 'status'],
    listFilter: { field: 'institutionId', reference: 'institution' },
    fields: [
      {
        name: 'institutionId',
        label: 'Institución',
        kind: 'reference',
        reference: 'institution',
        required: true,
      },
      { name: 'name', label: 'Nombre de la sede', kind: 'text', required: true, maxLength: 200 },
      { name: 'slug', label: 'Slug', kind: 'text', maxLength: 160 },
      { name: 'cityId', label: 'Ciudad', kind: 'reference', reference: 'city', required: true },
      { name: 'address', label: 'Dirección', kind: 'text', maxLength: 320 },
      { name: 'phoneE164', label: 'Teléfono (E.164)', kind: 'phone', maxLength: 20 },
      { name: 'isMain', label: 'Es la sede central', kind: 'boolean' },
      statusField,
    ],
  },

  carreras: {
    key: 'carreras',
    table: 'career',
    singular: 'Carrera canónica',
    plural: 'Carreras canónicas',
    titleField: 'nameEs',
    listColumns: ['nameEs', 'slug', 'areaId', 'levelDefault', 'status'],
    listFilter: { field: 'areaId', reference: 'area' },
    fields: [
      { name: 'nameEs', label: 'Nombre', kind: 'text', required: true, maxLength: 200 },
      { name: 'slug', label: 'Slug', kind: 'text', maxLength: 128 },
      { name: 'areaId', label: 'Área', kind: 'reference', reference: 'area' },
      {
        name: 'levelDefault',
        label: 'Nivel habitual',
        kind: 'enum',
        required: true,
        options: PROGRAM_LEVEL,
        optionLabels: LEVEL_LABELS,
      },
      {
        name: 'descriptionMd',
        label: 'Descripción editorial',
        kind: 'textarea',
        help: 'El hub de la carrera se indexa recién con 150 palabras propias.',
      },
      {
        name: 'salidaLaboralMd',
        label: 'Salida laboral',
        kind: 'textarea',
        help: 'Cualitativo. Sin sueldos ni tasas de empleo: no hay fuente citable (risks.md R-11).',
      },
      statusField,
    ],
  },

  programas: {
    key: 'programas',
    table: 'program',
    singular: 'Programa',
    plural: 'Programas',
    titleField: 'nameOfficial',
    listColumns: ['nameOfficial', 'institutionId', 'careerId', 'level', 'status'],
    listFilter: { field: 'institutionId', reference: 'institution' },
    fields: [
      {
        name: 'institutionId',
        label: 'Institución',
        kind: 'reference',
        reference: 'institution',
        required: true,
      },
      {
        name: 'careerId',
        label: 'Carrera canónica',
        kind: 'reference',
        reference: 'career',
        help: 'Sin carrera el programa no aparece en el hub ni en el área.',
      },
      {
        name: 'nameOfficial',
        label: 'Nombre oficial',
        kind: 'text',
        required: true,
        maxLength: 320,
      },
      { name: 'slug', label: 'Slug', kind: 'text', maxLength: 160 },
      {
        name: 'level',
        label: 'Nivel',
        kind: 'enum',
        required: true,
        options: PROGRAM_LEVEL,
        optionLabels: LEVEL_LABELS,
      },
      { name: 'titleAwarded', label: 'Título que otorga', kind: 'text', maxLength: 320 },
      { name: 'conesResolution', label: 'Resolución CONES', kind: 'text', maxLength: 120 },
      { name: 'descriptionMd', label: 'Descripción', kind: 'textarea' },
      statusField,
    ],
  },

  ofertas: {
    key: 'ofertas',
    table: 'offering',
    singular: 'Oferta',
    plural: 'Ofertas',
    titleField: 'programId',
    listColumns: ['programId', 'campusId', 'modality', 'shift', 'durationMonths', 'status'],
    listFilter: { field: 'programId', reference: 'program' },
    fields: [
      {
        name: 'programId',
        label: 'Programa',
        kind: 'reference',
        reference: 'program',
        required: true,
      },
      { name: 'campusId', label: 'Sede', kind: 'reference', reference: 'campus', required: true },
      {
        name: 'modality',
        label: 'Modalidad',
        kind: 'enum',
        required: true,
        options: MODALITY,
        optionLabels: MODALITY_LABELS,
      },
      {
        name: 'shift',
        label: 'Turno',
        kind: 'enum',
        required: true,
        options: SHIFT,
        optionLabels: SHIFT_LABELS,
        help: '"Flexible" es el valor honesto cuando la institución no lo declara.',
      },
      {
        name: 'durationMonths',
        label: 'Duración (meses)',
        kind: 'number',
        min: 1,
        max: 200,
        help: 'En meses, entero. Nunca "5 años": la duración se ordena y se compara.',
      },
      { name: 'credits', label: 'Créditos', kind: 'number', min: 1, max: 1000 },
      { name: 'planUrl', label: 'Plan de estudio (URL)', kind: 'url', maxLength: 512 },
      {
        name: 'enrollmentStatus',
        label: 'Estado de inscripción',
        kind: 'text',
        readOnly: true,
        help: 'Lo deriva el cron diario de la convocatoria activa. No se edita a mano.',
      },
      statusField,
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

export type FieldValues = Record<string, string | number | boolean | null>;

export interface ParseResult {
  values: FieldValues;
  errors: Record<string, string>;
}

/** A `FormData`-shaped source, so the parser is testable without one. */
export interface FormLike {
  get(name: string): FormDataEntryValue | null;
}

function readString(form: FormLike, name: string): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim() : '';
}

const URL_PATTERN = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{6,17}$/;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

/**
 * Read one submitted form into column values, with per-field messages.
 *
 * Empty is `null`, never `''`: the schema's nullable columns mean "sin datos",
 * and an empty string would render as a present-but-blank value in the UI and
 * in the search index. Rule 1 says an honest gap; `null` is how the gap is
 * spelled.
 */
export function parseEntityForm(def: EntityDef, form: FormLike): ParseResult {
  const values: FieldValues = {};
  const errors: Record<string, string> = {};

  for (const field of def.fields) {
    if (field.readOnly) continue;
    const raw = readString(form, field.name);

    if (field.kind === 'boolean') {
      values[field.name] = raw === 'on' || raw === 'true';
      continue;
    }

    if (raw === '') {
      if (field.required) errors[field.name] = 'Este campo es obligatorio.';
      values[field.name] = null;
      continue;
    }

    switch (field.kind) {
      case 'number':
      case 'reference': {
        const parsed = Number(raw);
        if (!Number.isInteger(parsed)) {
          errors[field.name] = 'Tiene que ser un número entero.';
          break;
        }
        if (field.min != null && parsed < field.min) {
          errors[field.name] = `El mínimo es ${field.min}.`;
          break;
        }
        if (field.max != null && parsed > field.max) {
          errors[field.name] = `El máximo es ${field.max}.`;
          break;
        }
        values[field.name] = parsed;
        break;
      }
      case 'enum': {
        if (!field.options?.includes(raw)) {
          errors[field.name] = 'Valor fuera de la lista.';
          break;
        }
        values[field.name] = raw;
        break;
      }
      case 'url': {
        if (!URL_PATTERN.test(raw)) {
          errors[field.name] = 'Tiene que ser una URL completa, con https://.';
          break;
        }
        values[field.name] = raw;
        break;
      }
      case 'email': {
        if (!EMAIL_PATTERN.test(raw)) {
          errors[field.name] = 'No parece una dirección de correo válida.';
          break;
        }
        values[field.name] = raw;
        break;
      }
      case 'phone': {
        if (!E164_PATTERN.test(raw)) {
          errors[field.name] = 'Formato E.164: +595981123456.';
          break;
        }
        values[field.name] = raw;
        break;
      }
      case 'color': {
        if (!COLOR_PATTERN.test(raw)) {
          errors[field.name] = 'Un color hexadecimal, por ejemplo #0d6e86.';
          break;
        }
        values[field.name] = raw;
        break;
      }
      default: {
        if (field.maxLength && raw.length > field.maxLength) {
          errors[field.name] = `Máximo ${field.maxLength} caracteres.`;
          break;
        }
        values[field.name] = raw;
      }
    }
  }

  return { values, errors };
}

/**
 * Fill in what the system owns rather than the operator.
 *
 * `slug` and `match_key` are NOT NULL on the tables that have them and are the
 * URL and the matcher key respectively — neither is a field a human should have
 * to remember to fill. A typed slug is honoured (renaming a URL is sometimes
 * exactly what is wanted); a blank one is derived from the title.
 */
export function deriveSystemFields(def: EntityDef, values: FieldValues): FieldValues {
  const out = { ...values };
  const title = typeof out[def.titleField] === 'string' ? (out[def.titleField] as string) : '';

  if (def.fields.some((field) => field.name === 'slug')) {
    const typed = typeof out.slug === 'string' ? out.slug : '';
    out.slug = slugify(typed || title);
  }
  // Two match keys, two stopword lists — the same split the importer uses
  // (`src/lib/curate/staging.ts`). A program keyed with the institution's
  // stopword list would never match the rows the importer produces.
  if (def.table === 'institution') out.matchKey = buildMatchKey(title);
  if (def.table === 'program') out.matchKey = buildCareerMatchKey(title);
  return out;
}

export function labelForValue(field: FieldDef, value: unknown): string {
  if (value == null || value === '') return '—';
  if (field.kind === 'boolean') return value ? 'Sí' : 'No';
  if (field.optionLabels && typeof value === 'string') return field.optionLabels[value] ?? value;
  return String(value);
}
