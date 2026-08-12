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
  SUBSCRIPTION_STATUS,
  BECA_TYPE,
  BECA_COVERAGE,
  JOB_SOURCE,
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

/* ========================================================================== */
/* PR-20 — prices, accreditations, admissions                                 */
/* ========================================================================== */

/**
 * The three record types that carry a `verified_at` clock and, between them,
 * every fact on the site a student could act on: what it costs, whether the
 * title will be worth anything, and when to enrol.
 *
 * Two rules live here rather than only in the database, because a CHECK
 * constraint produces a stack trace and a form needs to produce a sentence:
 *
 * 1. **A positive accreditation status needs a citation.** `sourceUrl` or
 *    `resolutionNumber`, and `no_acreditada` is held to the same bar because
 *    asserting an unverified negative is the legally dangerous one
 *    (`risks.md` §R-09). The form *refuses to save*; it does not warn.
 * 2. **A price must be coherent.** `is_free` with a matrícula is not a
 *    discount, it is two contradictory claims; a cuota without a number of
 *    installments cannot produce an annual cost, and `computeAnnualCost`
 *    returns null rather than a number the comparador would sort on.
 *
 * Both delegate to `src/db/invariants.ts` rather than restating the rule, so
 * there is exactly one definition of each and the admin cannot drift from the
 * importer.
 */

import {
  ACCREDITATION_AGENCY,
  ACCREDITATION_KIND,
  ACCREDITATION_SCOPE,
  ACCREDITATION_STATUS,
  CURRENCY,
  PRICE_SOURCE,
} from '@/db/schema';
import {
  InvariantError,
  assertAccreditationStatusIsSafe,
  assertPriceIsCoherent,
} from '@/db/invariants';

export type AccreditationScope = (typeof ACCREDITATION_SCOPE)[number];
export type AccreditationAgency = (typeof ACCREDITATION_AGENCY)[number];
export type AccreditationKind = (typeof ACCREDITATION_KIND)[number];
export type AccreditationStatus = (typeof ACCREDITATION_STATUS)[number];
export type Currency = (typeof CURRENCY)[number];
export type PriceSource = (typeof PRICE_SOURCE)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` from `<input type="date">`, or null. Stored as a string. */
function optionalDate(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
): string | null {
  const raw = str(formData, name);
  if (!raw) return null;
  if (!DATE_PATTERN.test(raw) || Number.isNaN(Date.parse(raw))) {
    errors[name] = `${label} tiene que ser una fecha válida.`;
    return null;
  }
  return raw;
}

/**
 * Guaraníes are integers with no minor unit, so a decimal point in an arancel
 * is a typo — usually a thousands separator typed as a dot. Rejecting it is
 * safer than rounding a number families budget against.
 */
function optionalMoney(
  formData: FormData,
  name: string,
  errors: Record<string, string>,
  label: string,
): number | null {
  const raw = str(formData, name).replace(/[.\s]/g, '');
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    errors[name] = `${label} tiene que ser un número entero de guaraníes, sin centavos.`;
    return null;
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Prices                                                                     */
/* -------------------------------------------------------------------------- */

export interface PriceInputData {
  offeringId: number;
  currency: Currency;
  matricula: number | null;
  monthlyFee: number | null;
  installmentsPerYear: number | null;
  admissionFee: number | null;
  isFree: boolean;
  notesMd: string | null;
  source: PriceSource;
  sourceUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export function parsePriceInput(formData: FormData): ParseResult<PriceInputData> {
  const errors: Record<string, string> = {};

  const offeringId = requireInt(formData, 'offeringId', errors, 'La oferta');
  const currency = requireEnum(formData, 'currency', CURRENCY, errors, 'la moneda');
  const source = requireEnum(formData, 'source', PRICE_SOURCE, errors, 'el origen del dato');
  const isFree = checkbox(formData, 'isFree');
  const matricula = optionalMoney(formData, 'matricula', errors, 'La matrícula');
  const monthlyFee = optionalMoney(formData, 'monthlyFee', errors, 'La cuota');
  const admissionFee = optionalMoney(formData, 'admissionFee', errors, 'El derecho de examen');
  const installmentsPerYear = optInt(formData, 'installmentsPerYear', errors, 'Las cuotas por año');
  const sourceUrl = optionalUrl(formData, 'sourceUrl', errors, 'La URL de la fuente');
  const validFrom = optionalDate(formData, 'validFrom', errors, 'La vigencia desde');
  const validTo = optionalDate(formData, 'validTo', errors, 'La vigencia hasta');
  const notesMd = optStr(formData, 'notesMd');

  const data: PriceInputData = {
    offeringId,
    currency,
    matricula,
    monthlyFee,
    installmentsPerYear,
    admissionFee,
    isFree,
    notesMd,
    source,
    sourceUrl,
    validFrom,
    validTo,
  };

  // One definition of coherence, in `src/db/invariants.ts`, reported here as a
  // sentence instead of a stack trace.
  try {
    assertPriceIsCoherent(data);
  } catch (error) {
    if (!(error instanceof InvariantError)) throw error;
    if (error.rule === 'prices_free_has_no_fees') {
      errors.isFree =
        'Una carrera gratuita no puede tener matrícula ni cuota. El derecho de examen sí.';
    } else if (error.rule === 'prices_installments_range') {
      errors.installmentsPerYear = 'Las cuotas por año tienen que estar entre 1 y 24.';
    } else {
      errors.matricula = error.message;
    }
  }

  if (!isFree && monthlyFee != null && installmentsPerYear == null) {
    // Not a database constraint — `annual_cost` would simply be NULL. But a
    // cuota with no number of cuotas cannot be compared with anything, and the
    // comparador is the product, so the form asks rather than storing a number
    // that will never be sortable.
    errors.installmentsPerYear =
      'Indicá cuántas cuotas por año. Sin eso no se puede calcular el costo anual y el arancel no entra en el comparador.';
  }

  if (validFrom && validTo && validTo < validFrom) {
    errors.validTo = 'La vigencia hasta no puede ser anterior a la vigencia desde.';
  }

  return finish(data, errors);
}

/* -------------------------------------------------------------------------- */
/* Accreditations                                                             */
/* -------------------------------------------------------------------------- */

export interface AccreditationInputData {
  scope: AccreditationScope;
  institutionId: number | null;
  programId: number | null;
  offeringId: number | null;
  agency: AccreditationAgency;
  kind: AccreditationKind;
  status: AccreditationStatus;
  model: string | null;
  resolutionNumber: string | null;
  resolutionDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  sourceUrl: string | null;
}

/**
 * The form that must refuse, not warn (PR-20 acceptance criterion).
 *
 * `assertAccreditationStatusIsSafe` is the same function the importer's write
 * path calls, so an accreditation typed by a human and one derived from ANEAES
 * are held to one rule. The extra thing this adds is the *message*: a moderator
 * who is told "poné el número de resolución o el enlace" fixes it, and one who
 * gets a 500 opens a ticket.
 */
export function parseAccreditationInput(formData: FormData): ParseResult<AccreditationInputData> {
  const errors: Record<string, string> = {};

  const scope = requireEnum(formData, 'scope', ACCREDITATION_SCOPE, errors, 'el alcance');
  const agency = requireEnum(formData, 'agency', ACCREDITATION_AGENCY, errors, 'la agencia');
  const kind = requireEnum(formData, 'kind', ACCREDITATION_KIND, errors, 'el tipo');
  const status = requireEnum(formData, 'status', ACCREDITATION_STATUS, errors, 'el estado');

  const institutionId = optInt(formData, 'institutionId', errors, 'La institución');
  const programId = optInt(formData, 'programId', errors, 'El programa');
  const offeringId = optInt(formData, 'offeringId', errors, 'La oferta');

  const resolutionNumber = optStr(formData, 'resolutionNumber');
  const sourceUrl = optionalUrl(formData, 'sourceUrl', errors, 'La URL de la fuente');
  const resolutionDate = optionalDate(formData, 'resolutionDate', errors, 'La fecha de resolución');
  const validFrom = optionalDate(formData, 'validFrom', errors, 'La vigencia desde');
  const validTo = optionalDate(formData, 'validTo', errors, 'La vigencia hasta');

  // Exactly one target, matching the scope. Mirrors the
  // `accreditations_scope_target` CHECK; stated per field so the form can point
  // at the select the moderator has to fix.
  const target = { institution: institutionId, program: programId, offering: offeringId }[scope];
  const targetField = {
    institution: 'institutionId',
    program: 'programId',
    offering: 'offeringId',
  }[scope];
  if (targetField && target == null) {
    errors[targetField] = 'Elegí a qué se aplica esta acreditación.';
  }

  // CONES habilita, ANEAES acredita. Conflating them is the single most
  // damaging mistake this dataset allows (`plan.md` §2), and the importer
  // already refuses it — so the form does too rather than letting a human do
  // by hand what the pipeline is forbidden to do automatically.
  if (agency === 'CONES' && kind === 'acreditacion') {
    errors.kind =
      'El CONES habilita, no acredita. Usá "habilitacion" para el CONES; "acreditacion" es de la ANEAES o ARCU-SUR.';
  }

  if (validFrom && validTo && validTo < validFrom) {
    errors.validTo = 'La vigencia hasta no puede ser anterior a la vigencia desde.';
  }

  const data: AccreditationInputData = {
    scope,
    // Only the field the scope names is kept; the other two are dropped rather
    // than sent to a CHECK that would reject the row for a reason the operator
    // did not cause.
    institutionId: scope === 'institution' ? institutionId : null,
    programId: scope === 'program' ? programId : null,
    offeringId: scope === 'offering' ? offeringId : null,
    agency,
    kind,
    status,
    model: optStr(formData, 'model'),
    resolutionNumber,
    resolutionDate,
    validFrom,
    validTo,
    sourceUrl,
  };

  try {
    assertAccreditationStatusIsSafe({ status, sourceUrl, resolutionNumber });
  } catch (error) {
    if (!(error instanceof InvariantError)) throw error;
    errors.sourceUrl =
      status === 'no_acreditada'
        ? '"No acreditada" afirma algo negativo y necesita una fuente. Si no lo verificaste, usá "Sin datos".'
        : 'Un estado positivo necesita el número de resolución o el enlace a la fuente. Sin fuente no hay insignia.';
  }

  return finish(data, errors);
}

/* -------------------------------------------------------------------------- */
/* Admissions                                                                 */
/* -------------------------------------------------------------------------- */

export interface AdmissionInputData {
  scope: AccreditationScope;
  institutionId: number | null;
  programId: number | null;
  offeringId: number | null;
  periodLabel: string;
  registrationOpens: string | null;
  registrationCloses: string | null;
  examDate: string | null;
  classesStart: string | null;
  requirementsMd: string | null;
  processMd: string | null;
  url: string | null;
  isActive: boolean;
}

export function parseAdmissionInput(formData: FormData): ParseResult<AdmissionInputData> {
  const errors: Record<string, string> = {};

  const scope = requireEnum(formData, 'scope', ACCREDITATION_SCOPE, errors, 'el alcance');
  const periodLabel = requireStr(formData, 'periodLabel', errors, 'El período', 160);

  const institutionId = optInt(formData, 'institutionId', errors, 'La institución');
  const programId = optInt(formData, 'programId', errors, 'El programa');
  const offeringId = optInt(formData, 'offeringId', errors, 'La oferta');

  const target = { institution: institutionId, program: programId, offering: offeringId }[scope];
  const targetField = {
    institution: 'institutionId',
    program: 'programId',
    offering: 'offeringId',
  }[scope];
  if (targetField && target == null) {
    errors[targetField] = 'Elegí a qué se aplica esta convocatoria.';
  }

  const registrationOpens = optionalDate(formData, 'registrationOpens', errors, 'La apertura');
  const registrationCloses = optionalDate(formData, 'registrationCloses', errors, 'El cierre');
  if (registrationOpens && registrationCloses && registrationCloses < registrationOpens) {
    // The `admissions_window_order` CHECK, said in Spanish before MySQL says it
    // in English.
    errors.registrationCloses = 'El cierre no puede ser anterior a la apertura.';
  }

  const data: AdmissionInputData = {
    scope,
    institutionId: scope === 'institution' ? institutionId : null,
    programId: scope === 'program' ? programId : null,
    offeringId: scope === 'offering' ? offeringId : null,
    periodLabel,
    registrationOpens,
    registrationCloses,
    examDate: optionalDate(formData, 'examDate', errors, 'La fecha de examen'),
    classesStart: optionalDate(formData, 'classesStart', errors, 'El inicio de clases'),
    requirementsMd: optStr(formData, 'requirementsMd'),
    processMd: optStr(formData, 'processMd'),
    url: optionalUrl(formData, 'url', errors, 'La URL de la convocatoria'),
    isActive: checkbox(formData, 'isActive'),
  };

  return finish(data, errors);
}

/* -------------------------------------------------------------------------- */
/* Subscriptions (PR-25)                                                      */
/* -------------------------------------------------------------------------- */

export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUS)[number];

export interface SubscriptionInputData {
  institutionId: number;
  planId: number;
  status: SubscriptionStatusValue;
  startsOn: string;
  endsOn: string | null;
  invoiceRef: string | null;
  invoicedAmountPyg: number | null;
  notes: string | null;
}

/**
 * An annual contract needs a start date; everything else about it can be
 * filled in later.
 *
 * `endsOn` is deliberately optional rather than defaulted to a year out. A
 * subscription with no end date is open-ended and keeps its features forever,
 * which is the right shape for a comped or trial account and the wrong thing
 * to hand somebody by accident — so the operator states it, and the form says
 * what leaving it blank means.
 *
 * `invoiceRef` is not required either: `monetization.md` §5 sells Aug–Oct with
 * the factura issued from FacturaPY, and the plan often goes live before the
 * transferencia clears. Refusing to record that would push the operator into
 * typing a fake reference, which is worse than an empty column.
 */
export function parseSubscriptionInput(formData: FormData): ParseResult<SubscriptionInputData> {
  const errors: Record<string, string> = {};

  const institutionId = requireInt(formData, 'institutionId', errors, 'La institución');
  const planId = requireInt(formData, 'planId', errors, 'El plan');
  const status = requireEnum(formData, 'status', SUBSCRIPTION_STATUS, errors, 'el estado');

  const startsOnRaw = str(formData, 'startsOn');
  const startsOn = optionalDate(formData, 'startsOn', errors, 'La fecha de inicio');
  if (!startsOnRaw) errors.startsOn = 'La fecha de inicio es obligatoria.';

  const endsOn = optionalDate(formData, 'endsOn', errors, 'La fecha de fin');
  if (startsOn && endsOn && endsOn < startsOn) {
    // The `subscriptions_date_order` CHECK, said in Spanish before MySQL says
    // it in English.
    errors.endsOn = 'La fecha de fin no puede ser anterior a la de inicio.';
  }

  const data: SubscriptionInputData = {
    institutionId,
    planId,
    status,
    startsOn: startsOn ?? '',
    endsOn,
    invoiceRef: optStr(formData, 'invoiceRef'),
    invoicedAmountPyg: optionalMoney(formData, 'invoicedAmountPyg', errors, 'El monto facturado'),
    notes: optStr(formData, 'notes'),
  };

  return finish(data, errors);
}

/* -------------------------------------------------------------------------- */
/* Editorial posts (PR-30)                                                    */
/* -------------------------------------------------------------------------- */

export interface PostInput {
  slug: string | null;
  title: string;
  excerpt: string;
  bodyMd: string;
  authorName: string;
  authorBio: string | null;
  status: PublicationStatus;
  /** `YYYY-MM-DD`; blank means "stamp it when it first goes live". */
  publishedAt: string | null;
}

/**
 * The prefixes that count as a money page for `seo.md` §7's rule — *"every
 * blog post links to at least one money page with descriptive anchor text, no
 * orphans"*.
 */
export const MONEY_PAGE_PREFIXES = [
  '/carreras',
  '/universidades',
  '/areas',
  '/becas',
  '/acreditacion',
] as const;

/** Anchor text that describes nothing. A link is only useful if its words are. */
const EMPTY_ANCHORS = [
  'acá',
  'aca',
  'aquí',
  'aqui',
  'click',
  'hacé click',
  'hace click',
  'este enlace',
  'link',
  'leer más',
  'leer mas',
  'ver más',
  'ver mas',
];

export function linksToMoneyPage(bodyMd: string): boolean {
  for (const match of bodyMd.matchAll(/\[([^\]]+)\]\((\/[^)]*)\)/g)) {
    const anchor = match[1]!.trim().toLowerCase();
    const href = match[2]!.trim();
    if (!MONEY_PAGE_PREFIXES.some((prefix) => href.startsWith(prefix))) continue;
    if (EMPTY_ANCHORS.includes(anchor)) continue;
    if (anchor.length < 4) continue;
    return true;
  }
  return false;
}

/**
 * `seo.md` §7 is enforced here rather than left to discipline: a post that
 * links to no money page is an orphan that spends crawl budget and returns
 * nothing, and the cheapest moment to catch it is before it is saved. It
 * blocks **publishing**, not saving — a draft is allowed to be unfinished.
 */
export function parsePostInput(formData: FormData): ParseResult<PostInput> {
  const errors: Record<string, string> = {};

  const title = requireStr(formData, 'title', errors, 'El título', 200);
  const excerpt = requireStr(formData, 'excerpt', errors, 'El resumen', 320);
  const bodyMd = requireStr(formData, 'bodyMd', errors, 'El cuerpo', 60_000);
  const authorName = requireStr(formData, 'authorName', errors, 'El autor', 160);
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');
  const slug = optionalSlug(formData, 'slug', errors);
  const publishedAt = optionalDate(formData, 'publishedAt', errors, 'La fecha de publicación');

  if (status === 'published' && bodyMd && !linksToMoneyPage(bodyMd)) {
    errors.bodyMd =
      'Antes de publicar, el post tiene que enlazar al menos una página de destino (/carreras, /universidades, /areas, /becas o /acreditacion) con un texto que describa el enlace — “acá” o “click” no cuentan (seo.md §7).';
  }

  return finish(
    {
      slug,
      title,
      excerpt,
      bodyMd,
      authorName,
      authorBio: optStr(formData, 'authorBio'),
      status,
      publishedAt,
    },
    errors,
  );
}

/* -------------------------------------------------------------------------- */
/* Areas — the editorial description only (PR-30)                             */
/* -------------------------------------------------------------------------- */

export interface AreaInput {
  nameEs: string;
  descriptionMd: string | null;
  sortOrder: number;
}

/**
 * An área's slug is **not** editable. It is in the URL of an indexed hub and in
 * every internal link that points there; renaming it silently 404s a page
 * Google already has. Renaming an área is a migration, not a form field.
 */
export function parseAreaInput(formData: FormData): ParseResult<AreaInput> {
  const errors: Record<string, string> = {};
  const nameEs = requireStr(formData, 'nameEs', errors, 'El nombre', 160);

  const sortRaw = str(formData, 'sortOrder');
  const sortOrder = sortRaw === '' ? 0 : Number(sortRaw);
  if (!Number.isInteger(sortOrder)) {
    errors.sortOrder = 'El orden tiene que ser un número entero.';
  }

  return finish({ nameEs, descriptionMd: optStr(formData, 'descriptionMd'), sortOrder }, errors);
}

/* -------------------------------------------------------------------------- */
/* Becas (PR-31)                                                              */
/* -------------------------------------------------------------------------- */

export type BecaTypeValue = (typeof BECA_TYPE)[number];
export type BecaCoverageValue = (typeof BECA_COVERAGE)[number];

export interface BecaInput {
  slug: string | null;
  title: string;
  institutionId: number | null;
  providerName: string | null;
  areaId: number | null;
  type: BecaTypeValue;
  coverage: BecaCoverageValue;
  amountPyg: number | null;
  percentage: number | null;
  summary: string;
  detailsMd: string | null;
  requirementsMd: string | null;
  applyUrl: string | null;
  sourceUrl: string;
  deadline: string | null;
  status: PublicationStatus;
}

/**
 * The anti-fabrication rule, as a form (CLAUDE.md rule 1).
 *
 * A beca is money somebody is promising a student, so:
 *
 * - **`source_url` is required**, always, draft or not. The column is NOT NULL
 *   for the same reason; this is the message a human reads instead of a MySQL
 *   error.
 * - **The amount has to match the coverage.** "Cubre el 100%" with a guaraní
 *   figure attached, or "cubre una parte" with no percentage, are two different
 *   ways of publishing a number nobody stated. The database has the same rule
 *   as a CHECK; this is where it gets explained.
 * - **A provider is required**: either an institution from our index or a name
 *   typed by hand. "Hay una beca" without saying whose is not information.
 */
export function parseBecaInput(formData: FormData): ParseResult<BecaInput> {
  const errors: Record<string, string> = {};

  const title = requireStr(formData, 'title', errors, 'El título', 240);
  const summary = requireStr(formData, 'summary', errors, 'El resumen', 320);
  const type = requireEnum(formData, 'type', BECA_TYPE, errors, 'el tipo');
  const coverage = requireEnum(formData, 'coverage', BECA_COVERAGE, errors, 'la cobertura');
  const slug = optionalSlug(formData, 'slug', errors);
  const deadline = optionalDate(formData, 'deadline', errors, 'La fecha límite');
  const applyUrl = optionalUrl(formData, 'applyUrl', errors, 'El enlace para postularse');

  const sourceUrl = optionalUrl(formData, 'sourceUrl', errors, 'La fuente');
  if (!sourceUrl && !errors.sourceUrl) {
    errors.sourceUrl =
      'La fuente es obligatoria: publicamos una beca solo si podemos mostrar de dónde la sacamos.';
  }

  const institutionId = optInt(formData, 'institutionId', errors, 'La institución');
  const providerName = optStr(formData, 'providerName');
  if (institutionId == null && !providerName) {
    errors.providerName = 'Decí quién da la beca: elegí una institución o escribí el nombre.';
  }

  const amountPyg = optionalMoney(formData, 'amountPyg', errors, 'El monto');
  const percentageRaw = str(formData, 'percentage');
  const percentage = percentageRaw === '' ? null : Number(percentageRaw);
  if (percentage != null && (!Number.isInteger(percentage) || percentage < 1 || percentage > 99)) {
    errors.percentage = 'El porcentaje tiene que ser un entero entre 1 y 99.';
  }

  if (coverage === 'monto_fijo' && amountPyg == null) {
    errors.amountPyg = 'Elegiste “monto fijo”: poné el monto en guaraníes.';
  }
  if (coverage === 'parcial' && percentage == null) {
    errors.percentage = 'Elegiste “parcial”: poné qué porcentaje cubre.';
  }
  if (coverage !== 'monto_fijo' && amountPyg != null) {
    errors.amountPyg =
      'Solo una beca de “monto fijo” lleva un monto. Sacalo o cambiá la cobertura.';
  }
  if (coverage !== 'parcial' && percentage != null) {
    errors.percentage =
      'Solo una beca “parcial” lleva un porcentaje. Sacalo o cambiá la cobertura.';
  }

  return finish(
    {
      slug,
      title,
      institutionId,
      providerName,
      areaId: optInt(formData, 'areaId', errors, 'El área'),
      type,
      coverage,
      amountPyg,
      percentage,
      summary,
      detailsMd: optStr(formData, 'detailsMd'),
      requirementsMd: optStr(formData, 'requirementsMd'),
      applyUrl,
      sourceUrl: sourceUrl ?? '',
      deadline,
      status: requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado'),
    },
    errors,
  );
}

/* -------------------------------------------------------------------------- */
/* Job postings (PR-32)                                                       */
/* -------------------------------------------------------------------------- */

export type JobSourceValue = (typeof JOB_SOURCE)[number];

export interface JobPostingInput {
  careerId: number;
  title: string;
  employerName: string;
  locationLabel: string | null;
  url: string;
  source: JobSourceValue;
  sourceLabel: string;
  postedOn: string;
  expiresOn: string | null;
  summary: string | null;
  status: PublicationStatus;
}

/**
 * A posting we cannot attribute or date is one we may not show: an undated
 * vacancy is indistinguishable from one filled last year, and an unattributed
 * one is somebody else's content presented as ours. Both are required here,
 * and `posted_on` may not be in the future — a "publicado mañana" row would
 * sort to the top of every list forever.
 */
export function parseJobPostingInput(
  formData: FormData,
  today: string = new Date().toISOString().slice(0, 10),
): ParseResult<JobPostingInput> {
  const errors: Record<string, string> = {};

  const careerId = requireInt(formData, 'careerId', errors, 'La carrera');
  const title = requireStr(formData, 'title', errors, 'El título', 240);
  const employerName = requireStr(formData, 'employerName', errors, 'La empresa', 200);
  const sourceLabel = requireStr(formData, 'sourceLabel', errors, 'La fuente visible', 120);
  const source = requireEnum(formData, 'source', JOB_SOURCE, errors, 'el origen');
  const status = requireEnum(formData, 'status', PUBLICATION_STATUS, errors, 'el estado');

  const url = optionalUrl(formData, 'url', errors, 'El enlace al aviso');
  if (!url && !errors.url) errors.url = 'El enlace al aviso es obligatorio.';

  const postedRaw = str(formData, 'postedOn');
  const postedOn = optionalDate(formData, 'postedOn', errors, 'La fecha de publicación');
  if (!postedRaw) errors.postedOn = 'La fecha de publicación es obligatoria.';
  else if (postedOn && postedOn > today) {
    errors.postedOn = 'La fecha de publicación no puede ser futura.';
  }

  const expiresOn = optionalDate(formData, 'expiresOn', errors, 'La fecha de vencimiento');
  if (postedOn && expiresOn && expiresOn < postedOn) {
    errors.expiresOn = 'El vencimiento no puede ser anterior a la publicación.';
  }

  return finish(
    {
      careerId,
      title,
      employerName,
      locationLabel: optStr(formData, 'locationLabel'),
      url: url ?? '',
      source,
      sourceLabel,
      postedOn: postedOn ?? '',
      expiresOn,
      summary: optStr(formData, 'summary'),
      status,
    },
    errors,
  );
}
