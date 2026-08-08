/**
 * Pure form validation for the five admin CRUD entities — no database, no
 * session, no I/O. Every rule here is something a unit test can assert
 * without a MySQL connection, which is the whole point of keeping it apart
 * from `src/db/queries/admin/*`.
 *
 * **The `management` rule (CLAUDE.md rule 1).** `<select name="management">`
 * ships with no `<option selected>` and an empty leading option ("Seleccioná…").
 * `parseInstitutionInput` rejects a blank value with a field error rather than
 * falling back to `'privada'` — an institution whose management we do not know
 * yet fails validation instead of silently becoming "privada". The schema
 * column is `NOT NULL` (data-model.md), so the only honest way to represent
 * "unknown" here is to refuse to save until a human picks one.
 *
 * **Accreditation is not a field anywhere in this file.** Institutions,
 * programs and offerings have no accreditation input — that table is PR-20's.
 */

import {
  MANAGEMENT,
  MODALITY,
  PROGRAM_LEVEL,
  PUBLICATION_STATUS,
  SHIFT,
  INSTITUTION_TYPE,
} from '@/db/schema';
import { parseParaguayanPhone } from '@/lib/leads/phone';

export type Management = (typeof MANAGEMENT)[number];
export type InstitutionType = (typeof INSTITUTION_TYPE)[number];
export type ProgramLevel = (typeof PROGRAM_LEVEL)[number];
export type Modality = (typeof MODALITY)[number];
export type Shift = (typeof SHIFT)[number];
export type PublicationStatus = (typeof PUBLICATION_STATUS)[number];

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function str(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function optStr(formData: FormData, name: string): string | null {
  const value = str(formData, name);
  return value.length > 0 ? value : null;
}

function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

function optInt(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
): number | null {
  const raw = str(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    errors[name] = `${label} tiene que ser un número entero positivo.`;
    return null;
  }
  return value;
}

function requireInt(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
): number {
  const raw = str(formData, name);
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value <= 0) {
    errors[name] = `${label} es obligatorio.`;
    return 0;
  }
  return value;
}

function requireStr(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
  maxLength = 512,
): string {
  const value = str(formData, name);
  if (!value) {
    errors[name] = `${label} es obligatorio.`;
  } else if (value.length > maxLength) {
    errors[name] = `${label} no puede superar ${maxLength} caracteres.`;
  }
  return value;
}

function requireEnum<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[],
  errors: Record<string, string>,
  label: string,
): T {
  const value = str(formData, name);
  if (!(allowed as readonly string[]).includes(value)) {
    errors[name] = `Elegí ${label.toLowerCase()}.`;
  }
  return value as T;
}

function optionalPhone(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
): string | null {
  const raw = str(formData, name);
  if (!raw) return null;
  const parsed = parseParaguayanPhone(raw);
  if (!parsed.ok) {
    errors[name] = `${label} no parece un número paraguayo válido.`;
    return null;
  }
  return parsed.e164;
}

function optionalSlug(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
): string | null {
  const value = str(formData, name);
  if (!value) return null;
  if (!SLUG_PATTERN.test(value)) {
    errors[name] = 'El slug solo puede tener minúsculas, números y guiones (sin acentos).';
  }
  return value;
}

function optionalUrl(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
): string | null {
  const value = str(formData, name);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme');
  } catch {
    errors[name] = `${label} tiene que ser una URL válida (http:// o https://).`;
  }
  return value;
}

function finish<T>(data: T, errors: Record<string, string>): ParseResult<T> {
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, data };
}

/* -------------------------------------------------------------------------- */
/* Institutions                                                               */
/* -------------------------------------------------------------------------- */

export interface InstitutionInput {
  slug: string | null;
  nameOfficial: string;
  nameShort: string;
  acronym: string | null;
  management: Management;
  type: InstitutionType;
  conesCode: string | null;
  foundedYear: number | null;
  website: string | null;
  email: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  brandColor: string | null;
  descriptionMd: string | null;
  status: PublicationStatus;
}

export function parseInstitutionInput(formData: FormData): ParseResult<InstitutionInput> {
  const errors: Record<string, string> = {};

  const nameOfficial = requireStr(formData, 'nameOfficial', errors, 'El nombre oficial', 320);
  const nameShort = requireStr(formData, 'nameShort', errors, 'El nombre corto', 120);
  const management = requireEnum(formData, 'management', MANAGEMENT, errors, 'la gestión');
  const type = requireEnum(formData, 'type', INSTITUTION_TYPE, errors, 'el tipo de institución');
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');
  const slug = optionalSlug(formData, 'slug', errors);
  const website = optionalUrl(formData, 'website', errors, 'El sitio web');
  const phoneE164 = optionalPhone(formData, 'phoneE164', errors, 'El teléfono');
  const whatsappE164 = optionalPhone(formData, 'whatsappE164', errors, 'El WhatsApp');

  const foundedYearRaw = str(formData, 'foundedYear');
  let foundedYear: number | null = null;
  if (foundedYearRaw) {
    const value = Number(foundedYearRaw);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(value) || value < 1800 || value > currentYear) {
      errors.foundedYear = `El año de fundación tiene que estar entre 1800 y ${currentYear}.`;
    } else {
      foundedYear = value;
    }
  }

  const email = optStr(formData, 'email');
  if (email && !email.includes('@')) errors.email = 'El email no parece válido.';

  const brandColor = optStr(formData, 'brandColor');
  if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
    errors.brandColor = 'El color de marca tiene que ser un hex de 6 dígitos, por ejemplo #0d6e86.';
  }

  return finish(
    {
      slug,
      nameOfficial,
      nameShort,
      acronym: optStr(formData, 'acronym'),
      management,
      type,
      conesCode: optStr(formData, 'conesCode'),
      foundedYear,
      website,
      email,
      phoneE164,
      whatsappE164,
      brandColor,
      descriptionMd: optStr(formData, 'descriptionMd'),
      status,
    },
    errors,
  );
}

/* -------------------------------------------------------------------------- */
/* Campuses                                                                   */
/* -------------------------------------------------------------------------- */

export interface CampusInput {
  institutionId: number;
  name: string;
  slug: string | null;
  cityId: number;
  address: string | null;
  phoneE164: string | null;
  isMain: boolean;
  status: PublicationStatus;
}

export function parseCampusInput(formData: FormData): ParseResult<CampusInput> {
  const errors: Record<string, string> = {};

  const institutionId = requireInt(formData, 'institutionId', errors, 'La institución');
  const name = requireStr(formData, 'name', errors, 'El nombre de la sede', 200);
  const cityId = requireInt(formData, 'cityId', errors, 'La ciudad');
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');
  const slug = optionalSlug(formData, 'slug', errors);
  const phoneE164 = optionalPhone(formData, 'phoneE164', errors, 'El teléfono');

  return finish(
    {
      institutionId,
      name,
      slug,
      cityId,
      address: optStr(formData, 'address'),
      phoneE164,
      isMain: checkbox(formData, 'isMain'),
      status,
    },
    errors,
  );
}

/* -------------------------------------------------------------------------- */
/* Careers                                                                    */
/* -------------------------------------------------------------------------- */

export interface CareerInput {
  slug: string | null;
  nameEs: string;
  areaId: number | null;
  levelDefault: ProgramLevel;
  synonyms: string[];
  descriptionMd: string | null;
  salidaLaboralMd: string | null;
  status: PublicationStatus;
}

export function parseCareerInput(formData: FormData): ParseResult<CareerInput> {
  const errors: Record<string, string> = {};

  const nameEs = requireStr(formData, 'nameEs', errors, 'El nombre', 200);
  const levelDefault = requireEnum(
    formData,
    'levelDefault',
    PROGRAM_LEVEL,
    errors,
    'el nivel por defecto',
  );
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');
  const slug = optionalSlug(formData, 'slug', errors);
  const areaId = optInt(formData, 'areaId', errors, 'El área');

  const synonymsRaw = str(formData, 'synonyms');
  const synonyms = synonymsRaw
    ? synonymsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return finish(
    {
      slug,
      nameEs,
      areaId,
      levelDefault,
      synonyms,
      descriptionMd: optStr(formData, 'descriptionMd'),
      salidaLaboralMd: optStr(formData, 'salidaLaboralMd'),
      status,
    },
    errors,
  );
}

/* -------------------------------------------------------------------------- */
/* Programs                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProgramInput {
  institutionId: number;
  careerId: number | null;
  nameOfficial: string;
  slug: string | null;
  level: ProgramLevel;
  titleAwarded: string | null;
  descriptionMd: string | null;
  conesResolution: string | null;
  status: PublicationStatus;
}

export function parseProgramInput(formData: FormData): ParseResult<ProgramInput> {
  const errors: Record<string, string> = {};

  const institutionId = requireInt(formData, 'institutionId', errors, 'La institución');
  const nameOfficial = requireStr(formData, 'nameOfficial', errors, 'El nombre oficial', 320);
  const level = requireEnum(formData, 'level', PROGRAM_LEVEL, errors, 'el nivel');
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');
  const slug = optionalSlug(formData, 'slug', errors);
  const careerId = optInt(formData, 'careerId', errors, 'La carrera');

  return finish(
    {
      institutionId,
      careerId,
      nameOfficial,
      slug,
      level,
      titleAwarded: optStr(formData, 'titleAwarded'),
      descriptionMd: optStr(formData, 'descriptionMd'),
      conesResolution: optStr(formData, 'conesResolution'),
      status,
    },
    errors,
  );
}

/* -------------------------------------------------------------------------- */
/* Offerings                                                                  */
/* -------------------------------------------------------------------------- */

export interface OfferingInput {
  programId: number;
  campusId: number;
  modality: Modality;
  shift: Shift;
  durationMonths: number | null;
  credits: number | null;
  planUrl: string | null;
  status: PublicationStatus;
}

export function parseOfferingInput(formData: FormData): ParseResult<OfferingInput> {
  const errors: Record<string, string> = {};

  const programId = requireInt(formData, 'programId', errors, 'El programa');
  const campusId = requireInt(formData, 'campusId', errors, 'La sede');
  const modality = requireEnum(formData, 'modality', MODALITY, errors, 'la modalidad');
  const shift = requireEnum(formData, 'shift', SHIFT, errors, 'el turno');
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');
  const durationMonths = optInt(formData, 'durationMonths', errors, 'La duración en meses');
  const credits = optInt(formData, 'credits', errors, 'Los créditos');
  const planUrl = optionalUrl(formData, 'planUrl', errors, 'El plan de estudio');

  return finish(
    { programId, campusId, modality, shift, durationMonths, credits, planUrl, status },
    errors,
  );
}
