/**
 * educacion.com.py — Drizzle schema.
 *
 * Authoritative reference: `docs/data-model.md`. This file must stay in sync
 * with that document; when they disagree, the document is wrong or the schema
 * is a bug — resolve it in the same PR.
 *
 * Conventions (data-model.md §3):
 *  - table + column names snake_case, Drizzle model names camelCase
 *  - money is always an integer in the base currency unit (no decimals)
 *  - durations are integers in months, never free text
 *  - phones are E.164, timestamps are UTC, slugs are ASCII lowercase-hyphen
 *  - soft delete via `status = 'archived'`; nothing is hard-deleted
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

/* -------------------------------------------------------------------------- */
/* Enums — exported so the UI, the importers and the validators share one list */
/* -------------------------------------------------------------------------- */

export const MANAGEMENT = ['publica', 'privada'] as const;
export const INSTITUTION_TYPE = [
  'universidad',
  'instituto_superior',
  'instituto_tecnico',
  'ifd',
  'otro',
] as const;
export const PROGRAM_LEVEL = [
  'tecnicatura',
  'grado',
  'especializacion',
  'maestria',
  'doctorado',
] as const;
export const MODALITY = ['presencial', 'semipresencial', 'distancia'] as const;
export const SHIFT = ['manana', 'tarde', 'noche', 'flexible'] as const;
export const ENROLLMENT_STATUS = ['abiertas', 'proximamente', 'cerradas', 'sin_datos'] as const;
export const PUBLICATION_STATUS = ['draft', 'published', 'archived'] as const;
export const CURRENCY = ['PYG', 'USD'] as const;
export const PRICE_SOURCE = ['institucion', 'relevamiento', 'web_publica'] as const;
export const ACCREDITATION_SCOPE = ['institution', 'program', 'offering'] as const;
export const ACCREDITATION_AGENCY = ['ANEAES', 'CONES', 'ARCUSUR', 'otra'] as const;
export const ACCREDITATION_KIND = ['acreditacion', 'habilitacion', 'en_proceso'] as const;
export const ACCREDITATION_STATUS = [
  'vigente',
  'en_proceso',
  'vencida',
  'no_acreditada',
  'sin_datos',
] as const;
export const LEAD_STATUS = ['new', 'sent', 'contacted', 'qualified', 'discarded'] as const;
export const AGE_BRACKET = ['menor_18', '18_mas', 'no_declarado'] as const;
export const EVENT_TYPE = [
  'offering_view',
  'whatsapp_click',
  'compare_add',
  'lead_submit',
  'profile_view',
] as const;
export const USER_ROLE = ['admin', 'editor', 'institution_admin', 'institution_editor'] as const;
export const USER_STATUS = ['active', 'invited', 'suspended'] as const;
export const MEMBER_ROLE = ['institution_admin', 'institution_editor'] as const;
export const CLAIM_STATUS = ['pending', 'approved', 'rejected', 'expired'] as const;
export const SUBSCRIPTION_STATUS = ['trial', 'active', 'past_due', 'cancelled'] as const;
export const SOURCE_NAME = [
  'CONES',
  'ANEAES',
  'DATOS_GOV_PY',
  'MEC',
  'INSTITUCION',
  'MANUAL',
] as const;
export const IMPORT_RUN_STATUS = ['running', 'succeeded', 'failed'] as const;
export const CONFLICT_ENTITY = [
  'institution',
  'campus',
  'career',
  'program',
  'offering',
  'accreditation',
  'price',
  'admission',
] as const;
export const CONFLICT_KIND = ['new', 'changed', 'conflict', 'ambiguous_match'] as const;
export const CONFLICT_STATUS = ['open', 'applied', 'rejected', 'superseded'] as const;

/** Plan ranking used for result ordering. Kept numeric so it can be a tiebreaker. */
export const PLAN_RANK = { gratis: 0, verificado: 1, destacado: 2 } as const;

/* -------------------------------------------------------------------------- */
/* Column helpers                                                             */
/* -------------------------------------------------------------------------- */

const pk = () => int('id', { unsigned: true }).autoincrement().primaryKey();
const bigPk = () => bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey();

/** Money: integer in the base currency unit. Guaraníes have no minor unit. */
const money = (name: string) => bigint(name, { mode: 'number' });

const createdAt = () => timestamp('created_at').notNull().defaultNow();
const updatedAt = () => timestamp('updated_at').notNull().defaultNow().onUpdateNow();

/* -------------------------------------------------------------------------- */
/* Taxonomy / reference                                                       */
/* -------------------------------------------------------------------------- */

export const areas = mysqlTable(
  'areas',
  {
    id: pk(),
    slug: varchar('slug', { length: 128 }).notNull(),
    nameEs: varchar('name_es', { length: 160 }).notNull(),
    descriptionMd: text('description_md'),
    sortOrder: smallint('sort_order').notNull().default(0),
    icon: varchar('icon', { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('areas_slug_uq').on(t.slug)],
);

export const careers = mysqlTable(
  'careers',
  {
    id: pk(),
    slug: varchar('slug', { length: 128 }).notNull(),
    nameEs: varchar('name_es', { length: 200 }).notNull(),
    areaId: int('area_id', { unsigned: true }).references(() => areas.id),
    levelDefault: mysqlEnum('level_default', PROGRAM_LEVEL).notNull().default('grado'),
    /** Alias store for the matcher: ["Medicina y Cirugía", "Doctor en Medicina"]. */
    synonymsJson: json('synonyms_json').$type<string[]>(),
    /** Editorial, 150+ unique words — SEO requirement for the career hub. */
    descriptionMd: text('description_md'),
    /** Nullable and qualitative only. Never fabricated — risks.md R-11. */
    salidaLaboralMd: text('salida_laboral_md'),
    status: mysqlEnum('status', PUBLICATION_STATUS).notNull().default('draft'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('careers_slug_uq').on(t.slug), index('careers_area_idx').on(t.areaId)],
);

export const departments = mysqlTable(
  'departments',
  {
    id: pk(),
    slug: varchar('slug', { length: 128 }).notNull(),
    nameEs: varchar('name_es', { length: 160 }).notNull(),
    /** Official departamento number; 0 for the Distrito Capital (Asunción). */
    code: tinyint('code', { unsigned: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('departments_slug_uq').on(t.slug),
    uniqueIndex('departments_code_uq').on(t.code),
  ],
);

export const cities = mysqlTable(
  'cities',
  {
    id: pk(),
    slug: varchar('slug', { length: 128 }).notNull(),
    nameEs: varchar('name_es', { length: 160 }).notNull(),
    departmentId: int('department_id', { unsigned: true })
      .notNull()
      .references(() => departments.id),
    /** Nullable on purpose: we do not seed coordinates we have not sourced. */
    lat: decimal('lat', { precision: 10, scale: 7 }),
    lng: decimal('lng', { precision: 10, scale: 7 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('cities_slug_uq').on(t.slug),
    index('cities_department_idx').on(t.departmentId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Accounts (declared early: institutions references users)                   */
/* -------------------------------------------------------------------------- */

export const users = mysqlTable(
  'users',
  {
    id: pk(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    name: varchar('name', { length: 160 }),
    role: mysqlEnum('role', USER_ROLE).notNull().default('institution_editor'),
    /** Denormalized convenience for the common single-institution case. */
    institutionId: int('institution_id', { unsigned: true }),
    status: mysqlEnum('status', USER_STATUS).notNull().default('invited'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    index('users_institution_idx').on(t.institutionId),
  ],
);

export const plans = mysqlTable(
  'plans',
  {
    id: pk(),
    code: varchar('code', { length: 32 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    priceUsdYear: int('price_usd_year', { unsigned: true }).notNull(),
    programBandMin: smallint('program_band_min', { unsigned: true }).notNull().default(0),
    programBandMax: smallint('program_band_max', { unsigned: true }),
    includedLeadsMonth: smallint('included_leads_month', { unsigned: true }),
    /** 0 gratis · 1 verificado · 2 destacado — mirrored into program_search. */
    rank: tinyint('rank', { unsigned: true }).notNull().default(0),
    featuresJson: json('features_json').$type<Record<string, boolean | number | string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('plans_code_uq').on(t.code)],
);

/* -------------------------------------------------------------------------- */
/* Institutions                                                               */
/* -------------------------------------------------------------------------- */

export const institutions = mysqlTable(
  'institutions',
  {
    id: pk(),
    slug: varchar('slug', { length: 160 }).notNull(),
    /** Exactly as it appears in the CONES register. */
    nameOfficial: varchar('name_official', { length: 320 }).notNull(),
    /** "UNA", "UC" — used in cards and tables (design-system.md §8.6). */
    nameShort: varchar('name_short', { length: 120 }).notNull(),
    acronym: varchar('acronym', { length: 32 }),
    /** Normalized key for the matcher — data-sources.md §4. */
    matchKey: varchar('match_key', { length: 320 }).notNull(),
    logoUrl: varchar('logo_url', { length: 512 }),
    brandColor: varchar('brand_color', { length: 9 }),
    management: mysqlEnum('management', MANAGEMENT).notNull(),
    type: mysqlEnum('type', INSTITUTION_TYPE).notNull().default('universidad'),
    /** Habilitación registry key. Unique where present, nullable where not. */
    conesCode: varchar('cones_code', { length: 64 }),
    foundedYear: smallint('founded_year', { unsigned: true }),
    website: varchar('website', { length: 512 }),
    email: varchar('email', { length: 255 }),
    phoneE164: varchar('phone_e164', { length: 20 }),
    whatsappE164: varchar('whatsapp_e164', { length: 20 }),
    descriptionMd: text('description_md'),
    status: mysqlEnum('status', PUBLICATION_STATUS).notNull().default('draft'),
    claimedByUserId: int('claimed_by_user_id', { unsigned: true }).references(() => users.id),
    planId: int('plan_id', { unsigned: true }).references(() => plans.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('institutions_slug_uq').on(t.slug),
    uniqueIndex('institutions_cones_code_uq').on(t.conesCode),
    index('institutions_match_key_idx').on(t.matchKey),
    index('institutions_status_idx').on(t.status),
    index('institutions_management_idx').on(t.management),
  ],
);

/**
 * The compounding asset of the matching pipeline (data-sources.md §4.5):
 * every manually resolved name lands here so it is never decided twice.
 */
export const institutionAliases = mysqlTable(
  'institution_aliases',
  {
    id: pk(),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    rawName: varchar('raw_name', { length: 320 }).notNull(),
    matchKey: varchar('match_key', { length: 320 }).notNull(),
    source: mysqlEnum('source', SOURCE_NAME),
    createdByUserId: int('created_by_user_id', { unsigned: true }).references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('institution_aliases_match_key_uq').on(t.matchKey),
    index('institution_aliases_institution_idx').on(t.institutionId),
  ],
);

export const campuses = mysqlTable(
  'campuses',
  {
    id: pk(),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    cityId: int('city_id', { unsigned: true })
      .notNull()
      .references(() => cities.id),
    address: varchar('address', { length: 320 }),
    lat: decimal('lat', { precision: 10, scale: 7 }),
    lng: decimal('lng', { precision: 10, scale: 7 }),
    phoneE164: varchar('phone_e164', { length: 20 }),
    isMain: boolean('is_main').notNull().default(false),
    status: mysqlEnum('status', PUBLICATION_STATUS).notNull().default('published'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('campuses_institution_slug_uq').on(t.institutionId, t.slug),
    index('campuses_city_idx').on(t.cityId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Programs & offerings                                                       */
/* -------------------------------------------------------------------------- */

export const programs = mysqlTable(
  'programs',
  {
    id: pk(),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    careerId: int('career_id', { unsigned: true }).references(() => careers.id),
    /** As habilitated: "Carrera de Medicina y Cirugía". */
    nameOfficial: varchar('name_official', { length: 320 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    matchKey: varchar('match_key', { length: 320 }).notNull(),
    level: mysqlEnum('level', PROGRAM_LEVEL).notNull(),
    titleAwarded: varchar('title_awarded', { length: 320 }),
    descriptionMd: text('description_md'),
    conesResolution: varchar('cones_resolution', { length: 120 }),
    status: mysqlEnum('status', PUBLICATION_STATUS).notNull().default('draft'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('programs_institution_slug_uq').on(t.institutionId, t.slug),
    index('programs_career_idx').on(t.careerId),
    index('programs_level_idx').on(t.level),
    index('programs_status_idx').on(t.status),
    index('programs_match_key_idx').on(t.matchKey),
  ],
);

/**
 * What the user actually compares.
 *
 * `shift` is NOT NULL with a 'flexible' default on purpose: MySQL treats NULLs
 * as distinct in a UNIQUE index, so a nullable shift would silently allow
 * duplicate offerings — exactly the row the importer must be able to de-dupe.
 */
export const offerings = mysqlTable(
  'offerings',
  {
    id: pk(),
    programId: int('program_id', { unsigned: true })
      .notNull()
      .references(() => programs.id),
    campusId: int('campus_id', { unsigned: true })
      .notNull()
      .references(() => campuses.id),
    modality: mysqlEnum('modality', MODALITY).notNull().default('presencial'),
    shift: mysqlEnum('shift', SHIFT).notNull().default('flexible'),
    /** Integer months. NEVER a free-text "5 años" string — sorting is the product. */
    durationMonths: smallint('duration_months', { unsigned: true }),
    credits: smallint('credits', { unsigned: true }),
    planUrl: varchar('plan_url', { length: 512 }),
    /** Derived daily from the active admission window — never hand-maintained. */
    enrollmentStatus: mysqlEnum('enrollment_status', ENROLLMENT_STATUS)
      .notNull()
      .default('sin_datos'),
    status: mysqlEnum('status', PUBLICATION_STATUS).notNull().default('draft'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('offerings_uq').on(t.programId, t.campusId, t.modality, t.shift),
    index('offerings_campus_idx').on(t.campusId),
    index('offerings_status_idx').on(t.status),
    check(
      'offerings_duration_positive',
      sql`${t.durationMonths} is null or ${t.durationMonths} > 0`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One current row per offering (`is_current = true`) plus history.
 *
 * `annual_cost` is a STORED GENERATED column so the comparador can sort on the
 * honest number: matrícula + cuota × cuotas/año. Showing only the monthly cuota
 * lets 12 small cuotas look cheaper than 10 large ones.
 *
 * It is NULL — not 0 — whenever the annual figure cannot be computed honestly
 * (no fee captured, or a monthly fee without a known number of installments).
 * NULL means "sin datos", 0 means "gratuita". They must never collapse.
 */
export const prices = mysqlTable(
  'prices',
  {
    id: pk(),
    offeringId: int('offering_id', { unsigned: true })
      .notNull()
      .references(() => offerings.id),
    currency: mysqlEnum('currency', CURRENCY).notNull().default('PYG'),
    matricula: money('matricula'),
    monthlyFee: money('monthly_fee'),
    /** Usually 10 or 12. Required to compare honestly. */
    installmentsPerYear: tinyint('installments_per_year', { unsigned: true }),
    /** Derecho de examen / CPI — what families actually ask about first. */
    admissionFee: money('admission_fee'),
    isFree: boolean('is_free').notNull().default(false),
    annualCost: money('annual_cost').generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(case
        when is_free = 1 then 0
        when monthly_fee is not null and installments_per_year is null then null
        when matricula is null and monthly_fee is null then null
        else coalesce(matricula, 0) + coalesce(monthly_fee, 0) * coalesce(installments_per_year, 0)
      end)`,
      { mode: 'stored' },
    ),
    isCurrent: boolean('is_current').notNull().default(true),
    /**
     * Generated uniqueness key: equals `offering_id` while the row is current,
     * NULL otherwise. MySQL ignores NULLs in a UNIQUE index, which gives us
     * "exactly one current price per offering" without a partial index.
     *
     * Declared after `is_current` on purpose — a generated column must not
     * forward-reference a column MySQL has not defined yet.
     */
    currentOfferingId: int('current_offering_id', { unsigned: true }).generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`(case when is_current = 1 then offering_id else null end)`,
      { mode: 'stored' },
    ),
    notesMd: text('notes_md'),
    source: mysqlEnum('source', PRICE_SOURCE).notNull().default('web_publica'),
    sourceUrl: varchar('source_url', { length: 512 }),
    validFrom: date('valid_from', { mode: 'string' }),
    validTo: date('valid_to', { mode: 'string' }),
    /** The staleness clock. Older than 12 months → the number is not displayed. */
    verifiedAt: timestamp('verified_at'),
    verifiedByUserId: int('verified_by_user_id', { unsigned: true }).references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('prices_current_offering_uq').on(t.currentOfferingId),
    index('prices_offering_idx').on(t.offeringId),
    index('prices_annual_cost_idx').on(t.annualCost),
    index('prices_verified_at_idx').on(t.verifiedAt),
    check(
      'prices_installments_range',
      sql`${t.installmentsPerYear} is null or (${t.installmentsPerYear} between 1 and 24)`,
    ),
    check(
      'prices_free_has_no_fees',
      sql`${t.isFree} = 0 or (${t.matricula} is null and ${t.monthlyFee} is null)`,
    ),
    check(
      'prices_non_negative',
      sql`coalesce(${t.matricula}, 0) >= 0 and coalesce(${t.monthlyFee}, 0) >= 0 and coalesce(${t.admissionFee}, 0) >= 0`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Accreditation — the wedge (plan.md §2)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Polymorphic by `scope`: exactly one of institution_id / program_id /
 * offering_id is set, enforced by a CHECK.
 *
 * The citation rule (status 'vigente' | 'en_proceso' ⇒ source_url OR
 * resolution_number) is enforced three times over: here as a CHECK, in
 * `assertAccreditationCitation()` for every write path, and in a unit test.
 * No citation, no badge — risks.md §R-09.
 */
export const accreditations = mysqlTable(
  'accreditations',
  {
    id: pk(),
    scope: mysqlEnum('scope', ACCREDITATION_SCOPE).notNull(),
    institutionId: int('institution_id', { unsigned: true }).references(() => institutions.id),
    programId: int('program_id', { unsigned: true }).references(() => programs.id),
    offeringId: int('offering_id', { unsigned: true }).references(() => offerings.id),
    agency: mysqlEnum('agency', ACCREDITATION_AGENCY).notNull(),
    kind: mysqlEnum('kind', ACCREDITATION_KIND).notNull(),
    status: mysqlEnum('status', ACCREDITATION_STATUS).notNull().default('sin_datos'),
    /** "Modelo Nacional", "ARCU-SUR". */
    model: varchar('model', { length: 120 }),
    resolutionNumber: varchar('resolution_number', { length: 120 }),
    resolutionDate: date('resolution_date', { mode: 'string' }),
    validFrom: date('valid_from', { mode: 'string' }),
    validTo: date('valid_to', { mode: 'string' }),
    sourceUrl: varchar('source_url', { length: 512 }),
    sourceRecordId: bigint('source_record_id', { mode: 'number', unsigned: true }),
    /** Set by an institution dispute (PR-24); suppresses the public badge. */
    isDisputed: boolean('is_disputed').notNull().default(false),
    verifiedAt: timestamp('verified_at'),
    verifiedByUserId: int('verified_by_user_id', { unsigned: true }).references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('accreditations_institution_idx').on(t.institutionId),
    index('accreditations_program_idx').on(t.programId),
    index('accreditations_offering_idx').on(t.offeringId),
    index('accreditations_status_idx').on(t.status),
    check(
      'accreditations_scope_target',
      sql`(${t.scope} = 'institution' and ${t.institutionId} is not null and ${t.programId} is null and ${t.offeringId} is null)
       or (${t.scope} = 'program' and ${t.programId} is not null and ${t.offeringId} is null)
       or (${t.scope} = 'offering' and ${t.offeringId} is not null)`,
    ),
    check(
      'accreditations_citation_required',
      sql`${t.status} not in ('vigente', 'en_proceso') or ${t.sourceUrl} is not null or ${t.resolutionNumber} is not null`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Admissions                                                                 */
/* -------------------------------------------------------------------------- */

export const admissions = mysqlTable(
  'admissions',
  {
    id: pk(),
    scope: mysqlEnum('scope', ACCREDITATION_SCOPE).notNull(),
    institutionId: int('institution_id', { unsigned: true }).references(() => institutions.id),
    programId: int('program_id', { unsigned: true }).references(() => programs.id),
    offeringId: int('offering_id', { unsigned: true }).references(() => offerings.id),
    /** "Convocatoria 2027 - 1er llamado". */
    periodLabel: varchar('period_label', { length: 160 }).notNull(),
    registrationOpens: date('registration_opens', { mode: 'string' }),
    registrationCloses: date('registration_closes', { mode: 'string' }),
    examDate: date('exam_date', { mode: 'string' }),
    classesStart: date('classes_start', { mode: 'string' }),
    /** CPI / CBA / examen / ingreso directo. */
    requirementsMd: text('requirements_md'),
    processMd: text('process_md'),
    url: varchar('url', { length: 512 }),
    isActive: boolean('is_active').notNull().default(true),
    verifiedAt: timestamp('verified_at'),
    verifiedByUserId: int('verified_by_user_id', { unsigned: true }).references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('admissions_institution_idx').on(t.institutionId),
    index('admissions_program_idx').on(t.programId),
    index('admissions_offering_idx').on(t.offeringId),
    index('admissions_window_idx').on(t.registrationOpens, t.registrationCloses),
    check(
      'admissions_scope_target',
      sql`(${t.scope} = 'institution' and ${t.institutionId} is not null and ${t.programId} is null and ${t.offeringId} is null)
       or (${t.scope} = 'program' and ${t.programId} is not null and ${t.offeringId} is null)
       or (${t.scope} = 'offering' and ${t.offeringId} is not null)`,
    ),
    check(
      'admissions_window_order',
      sql`${t.registrationOpens} is null or ${t.registrationCloses} is null or ${t.registrationCloses} >= ${t.registrationOpens}`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Leads & engagement                                                         */
/* -------------------------------------------------------------------------- */

export const leads = mysqlTable(
  'leads',
  {
    id: bigPk(),
    offeringId: int('offering_id', { unsigned: true }).references(() => offerings.id),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    name: varchar('name', { length: 160 }).notNull(),
    phoneE164: varchar('phone_e164', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }),
    message: text('message'),
    consent: boolean('consent').notNull().default(false),
    consentTextVersion: varchar('consent_text_version', { length: 32 }).notNull(),
    consentAt: timestamp('consent_at').notNull(),
    ageBracket: mysqlEnum('age_bracket', AGE_BRACKET).notNull().default('no_declarado'),
    sourcePage: varchar('source_page', { length: 512 }),
    utmJson: json('utm_json').$type<Record<string, string>>(),
    /** Hashed, for abuse control only. Never displayed, never exported. */
    ipHash: varchar('ip_hash', { length: 64 }),
    userAgent: varchar('user_agent', { length: 320 }),
    status: mysqlEnum('status', LEAD_STATUS).notNull().default('new'),
    deliveredAt: timestamp('delivered_at'),
    /** Purge clock — leads are deleted after 24 months (architecture.md §6). */
    createdAt: createdAt(),
  },
  (t) => [
    index('leads_institution_created_idx').on(t.institutionId, t.createdAt),
    index('leads_offering_idx').on(t.offeringId),
    index('leads_status_idx').on(t.status),
    /* The durable half of the rate limit is derived from this table rather
     * than from a counter table of its own (architecture.md §6.1). These two
     * indexes are what make "how many leads carry this phone / this ip_hash in
     * the last 24 h" an index range scan instead of a table scan on the one
     * path an attacker controls. */
    index('leads_phone_created_idx').on(t.phoneE164, t.createdAt),
    index('leads_ip_created_idx').on(t.ipHash, t.createdAt),
    check('leads_consent_required', sql`${t.consent} = 1`),
  ],
);

export const events = mysqlTable(
  'events',
  {
    id: bigPk(),
    type: mysqlEnum('type', EVENT_TYPE).notNull(),
    offeringId: int('offering_id', { unsigned: true }),
    institutionId: int('institution_id', { unsigned: true }),
    /** Non-reversible per-day session hash. No PII. */
    sessionHash: varchar('session_hash', { length: 64 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('events_institution_created_idx').on(t.institutionId, t.createdAt),
    index('events_type_created_idx').on(t.type, t.createdAt),
    index('events_offering_idx').on(t.offeringId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Accounts, plans, ops                                                       */
/* -------------------------------------------------------------------------- */

export const institutionMembers = mysqlTable(
  'institution_members',
  {
    id: pk(),
    userId: int('user_id', { unsigned: true })
      .notNull()
      .references(() => users.id),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    role: mysqlEnum('role', MEMBER_ROLE).notNull().default('institution_editor'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('institution_members_uq').on(t.userId, t.institutionId),
    index('institution_members_institution_idx').on(t.institutionId),
  ],
);

export const claims = mysqlTable(
  'claims',
  {
    id: pk(),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    userId: int('user_id', { unsigned: true }).references(() => users.id),
    email: varchar('email', { length: 255 }).notNull(),
    emailDomain: varchar('email_domain', { length: 255 }).notNull(),
    /** Hashed at rest, single-use, expires in 72 h (PR-22). */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    status: mysqlEnum('status', CLAIM_STATUS).notNull().default('pending'),
    verifiedAt: timestamp('verified_at'),
    decidedByUserId: int('decided_by_user_id', { unsigned: true }).references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('claims_token_hash_uq').on(t.tokenHash),
    index('claims_institution_idx').on(t.institutionId),
    index('claims_status_idx').on(t.status),
  ],
);

export const subscriptions = mysqlTable(
  'subscriptions',
  {
    id: pk(),
    institutionId: int('institution_id', { unsigned: true })
      .notNull()
      .references(() => institutions.id),
    planId: int('plan_id', { unsigned: true })
      .notNull()
      .references(() => plans.id),
    status: mysqlEnum('status', SUBSCRIPTION_STATUS).notNull().default('trial'),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    /** Phase 3 billing is manual: transferencia + factura. No gateway. */
    invoiceRef: varchar('invoice_ref', { length: 120 }),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_institution_idx').on(t.institutionId),
    index('subscriptions_status_idx').on(t.status),
    check('subscriptions_date_order', sql`${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Provenance & ops                                                           */
/* -------------------------------------------------------------------------- */

export const importRuns = mysqlTable(
  'import_runs',
  {
    id: bigPk(),
    source: mysqlEnum('source', SOURCE_NAME).notNull(),
    status: mysqlEnum('status', IMPORT_RUN_STATUS).notNull().default('running'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
    rowsIn: int('rows_in', { unsigned: true }).notNull().default(0),
    rowsMatched: int('rows_matched', { unsigned: true }).notNull().default(0),
    rowsNew: int('rows_new', { unsigned: true }).notNull().default(0),
    rowsUnchanged: int('rows_unchanged', { unsigned: true }).notNull().default(0),
    rowsConflicted: int('rows_conflicted', { unsigned: true }).notNull().default(0),
    log: text('log'),
  },
  (t) => [index('import_runs_source_started_idx').on(t.source, t.startedAt)],
);

/**
 * Raw provenance. Never edited, never deleted.
 *
 * UNIQUE (source, checksum) is what makes re-running an importer a no-op
 * instead of a duplicate-producing operation (PR-05 acceptance criterion).
 */
export const sourceRecords = mysqlTable(
  'source_records',
  {
    id: bigPk(),
    source: mysqlEnum('source', SOURCE_NAME).notNull(),
    /** Stable identifier within the source, when it has one. */
    externalId: varchar('external_id', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 512 }),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
    payloadJson: json('payload_json').notNull(),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    importRunId: bigint('import_run_id', { mode: 'number', unsigned: true }).references(
      () => importRuns.id,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('source_records_source_checksum_uq').on(t.source, t.checksum),
    index('source_records_source_external_idx').on(t.source, t.externalId),
    index('source_records_import_run_idx').on(t.importRunId),
  ],
);

/**
 * The moderation queue. PR-06 classifies every incoming record as
 * NEW / UNCHANGED / CHANGED / CONFLICT and anything that is not a safe
 * auto-apply lands here instead of being written. Nothing auto-publishes
 * on a conflict — data-sources.md §3.
 */
export const curationConflicts = mysqlTable(
  'curation_conflicts',
  {
    id: bigPk(),
    importRunId: bigint('import_run_id', { mode: 'number', unsigned: true }).references(
      () => importRuns.id,
    ),
    sourceRecordId: bigint('source_record_id', { mode: 'number', unsigned: true }).references(
      () => sourceRecords.id,
    ),
    entityType: mysqlEnum('entity_type', CONFLICT_ENTITY).notNull(),
    /** Null when the proposal is to create a new entity. */
    entityId: int('entity_id', { unsigned: true }),
    kind: mysqlEnum('kind', CONFLICT_KIND).notNull(),
    /** 0–100. Fuzzy proposals below the auto-apply threshold queue here. */
    matchScore: tinyint('match_score', { unsigned: true }),
    currentJson: json('current_json').$type<Record<string, unknown> | null>(),
    proposedJson: json('proposed_json').$type<Record<string, unknown>>().notNull(),
    status: mysqlEnum('status', CONFLICT_STATUS).notNull().default('open'),
    resolvedByUserId: int('resolved_by_user_id', { unsigned: true }).references(() => users.id),
    resolvedAt: timestamp('resolved_at'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    index('curation_conflicts_status_idx').on(t.status, t.entityType),
    index('curation_conflicts_run_idx').on(t.importRunId),
    index('curation_conflicts_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const activityLog = mysqlTable(
  'activity_log',
  {
    id: bigPk(),
    userId: int('user_id', { unsigned: true }).references(() => users.id),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: int('entity_id', { unsigned: true }),
    action: varchar('action', { length: 64 }).notNull(),
    beforeJson: json('before_json').$type<Record<string, unknown> | null>(),
    afterJson: json('after_json').$type<Record<string, unknown> | null>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_log_entity_idx').on(t.entityType, t.entityId),
    index('activity_log_user_idx').on(t.userId, t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* The search table                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Denormalized, read-only, rebuilt by `npm run search:rebuild` inside a
 * transaction. One row per offering. No joins at query time — which means
 * every field the result card, the table row, the comparador and the facet
 * rail need must exist here, including slugs (a card without slugs cannot
 * build its own href) and the price provenance the staleness rule depends on.
 *
 * Deliberately has NO foreign keys: it is a derived artefact and a rebuild
 * must be able to truncate it without fighting referential integrity.
 */
export const programSearch = mysqlTable(
  'program_search',
  {
    offeringId: int('offering_id', { unsigned: true }).primaryKey(),
    programId: int('program_id', { unsigned: true }).notNull(),
    institutionId: int('institution_id', { unsigned: true }).notNull(),
    careerId: int('career_id', { unsigned: true }),
    campusId: int('campus_id', { unsigned: true }).notNull(),
    cityId: int('city_id', { unsigned: true }).notNull(),
    departmentId: int('department_id', { unsigned: true }).notNull(),
    areaId: int('area_id', { unsigned: true }),

    // Slugs — required to build hrefs without a join.
    institutionSlug: varchar('institution_slug', { length: 160 }).notNull(),
    programSlug: varchar('program_slug', { length: 160 }).notNull(),
    careerSlug: varchar('career_slug', { length: 128 }),
    areaSlug: varchar('area_slug', { length: 128 }),
    citySlug: varchar('city_slug', { length: 128 }).notNull(),
    departmentSlug: varchar('department_slug', { length: 128 }).notNull(),

    // Display
    programName: varchar('program_name', { length: 320 }).notNull(),
    careerName: varchar('career_name', { length: 200 }),
    titleAwarded: varchar('title_awarded', { length: 320 }),
    institutionName: varchar('institution_name', { length: 320 }).notNull(),
    institutionShort: varchar('institution_short', { length: 120 }).notNull(),
    institutionLogo: varchar('institution_logo', { length: 512 }),
    brandColor: varchar('brand_color', { length: 9 }),
    cityName: varchar('city_name', { length: 160 }).notNull(),
    departmentName: varchar('department_name', { length: 160 }).notNull(),
    campusName: varchar('campus_name', { length: 200 }).notNull(),

    // Facets
    level: mysqlEnum('level', PROGRAM_LEVEL).notNull(),
    modality: mysqlEnum('modality', MODALITY).notNull(),
    shift: mysqlEnum('shift', SHIFT).notNull(),
    management: mysqlEnum('management', MANAGEMENT).notNull(),
    institutionType: mysqlEnum('institution_type', INSTITUTION_TYPE).notNull(),
    durationMonths: smallint('duration_months', { unsigned: true }),

    // Money — every column the comparador shows, so it never joins back.
    priceCurrency: mysqlEnum('price_currency', CURRENCY),
    matriculaGs: money('matricula_gs'),
    monthlyFeeGs: money('monthly_fee_gs'),
    installmentsPerYear: tinyint('installments_per_year', { unsigned: true }),
    admissionFeeGs: money('admission_fee_gs'),
    annualCostGs: money('annual_cost_gs'),
    isFree: boolean('is_free').notNull().default(false),
    priceVerifiedAt: timestamp('price_verified_at'),
    /**
     * verified_at + 12 months. The rebuild runs nightly but the 12-month
     * boundary is crossed at an arbitrary moment, so the query layer compares
     * this against NOW() rather than trusting the index to be fresh.
     */
    priceExpiresOn: date('price_expires_on', { mode: 'string' }),

    // Accreditation — resolved to one badge at index time, source included so
    // the badge can link to it (design-system.md §4: every badge is a link).
    accreditationStatus: mysqlEnum('accreditation_status', ACCREDITATION_STATUS)
      .notNull()
      .default('sin_datos'),
    accreditationAgency: mysqlEnum('accreditation_agency', ACCREDITATION_AGENCY),
    accreditationSourceUrl: varchar('accreditation_source_url', { length: 512 }),
    accreditationValidTo: date('accreditation_valid_to', { mode: 'string' }),

    // Admissions
    enrollmentStatus: mysqlEnum('enrollment_status', ENROLLMENT_STATUS)
      .notNull()
      .default('sin_datos'),
    admissionClosesOn: date('admission_closes_on', { mode: 'string' }),

    // Ranking / visibility
    planRank: tinyint('plan_rank', { unsigned: true }).notNull().default(0),
    isPublished: boolean('is_published').notNull().default(false),

    /** Accent-stripped, lowercased at index time. Never rely on collation. */
    searchText: varchar('search_text', { length: 1024 }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('ps_level_management_modality_idx').on(t.level, t.management, t.modality),
    index('ps_city_idx').on(t.cityId),
    index('ps_department_idx').on(t.departmentId),
    index('ps_career_idx').on(t.careerId),
    index('ps_institution_idx').on(t.institutionId),
    index('ps_area_idx').on(t.areaId),
    index('ps_accreditation_idx').on(t.accreditationStatus),
    index('ps_enrollment_idx').on(t.enrollmentStatus),
    index('ps_monthly_fee_idx').on(t.monthlyFeeGs),
    index('ps_annual_cost_idx').on(t.annualCostGs),
    index('ps_duration_idx').on(t.durationMonths),
    index('ps_published_rank_idx').on(t.isPublished, t.planRank),
    // FULLTEXT on search_text is added by migration 0001 — drizzle-kit has no
    // builder for it. Do not drop it when regenerating.
  ],
);
