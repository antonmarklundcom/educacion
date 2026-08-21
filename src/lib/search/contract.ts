/**
 * The search interface — types only.
 *
 * PR-02 fixes this contract so that PR-07 (implementation), PR-08 (card view),
 * PR-09 (table view + comparador) and PR-12 (career hubs) can be written
 * against it without any of them having to change when the others land.
 *
 * `searchPrograms(filters) => { results, facets, total }` is the ONLY export
 * other code may use to read the index. Everything it returns is already
 * resolved from `program_search` — no joins, no follow-up queries, no ORM
 * objects leaking into components (CLAUDE.md rule 5).
 *
 * Keeping this shape stable is also what makes the in-process fast path in
 * `architecture.md` §4.4 a one-file swap.
 */

import type { PriceFreshness } from '@/db/invariants';
import type {
  ACCREDITATION_AGENCY,
  ACCREDITATION_STATUS,
  CURRENCY,
  ENROLLMENT_STATUS,
  INSTITUTION_TYPE,
  MANAGEMENT,
  MODALITY,
  PROGRAM_LEVEL,
  SHIFT,
} from '@/db/schema';

export type Level = (typeof PROGRAM_LEVEL)[number];
export type Modality = (typeof MODALITY)[number];
export type Shift = (typeof SHIFT)[number];
export type Management = (typeof MANAGEMENT)[number];
export type InstitutionType = (typeof INSTITUTION_TYPE)[number];
export type AccreditationStatus = (typeof ACCREDITATION_STATUS)[number];
export type AccreditationAgency = (typeof ACCREDITATION_AGENCY)[number];
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS)[number];
export type Currency = (typeof CURRENCY)[number];

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The eight facet groups of the filter rail. Array-valued filters are OR
 * within a group and AND across groups — the standard faceted semantics the
 * counts in `Facets` assume.
 */
export interface SearchFilters {
  /** Free text. Accent-insensitive; matched against `search_text`. */
  q?: string;

  areaSlugs?: string[];
  careerSlugs?: string[];
  levels?: Level[];
  managements?: Management[];
  institutionTypes?: InstitutionType[];
  modalities?: Modality[];
  shifts?: Shift[];
  citySlugs?: string[];
  departmentSlugs?: string[];
  accreditationStatuses?: AccreditationStatus[];
  enrollmentStatuses?: EnrollmentStatus[];

  /** Scoping used by the institution and career hub pages, not by the rail. */
  institutionSlug?: string;

  /** Annual cost in guaraníes. Rows with no comparable annual figure are
   *  excluded when either bound is set — we never guess a price to keep a row
   *  in. Age is not a condition: a stale arancel is compared like any other and
   *  carries its warning (PR-33). */
  annualCostMin?: number;
  annualCostMax?: number;
  /** `true` keeps only free programs; `false` keeps only paid ones. */
  isFree?: boolean;

  durationMonthsMax?: number;

  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

/**
 * `relevancia` is FULLTEXT score when `q` is set and a stable deterministic
 * ordering otherwise. `plan_rank` is only ever a tiebreaker within a sort —
 * it never overrides a filter or a sort the user chose (PR-27 acceptance).
 */
export const SORT_KEYS = [
  'relevancia',
  'arancel_asc',
  'arancel_desc',
  'duracion_asc',
  'duracion_desc',
  'nombre_asc',
  'institucion_asc',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = 'relevancia';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * URL parameter names. Spanish because these URLs are public and indexed;
 * this map is the single source of truth for both parsing and serializing so
 * the card view and the table view cannot drift apart.
 */
export const FILTER_PARAMS = {
  q: 'q',
  areaSlugs: 'area',
  careerSlugs: 'carrera',
  levels: 'nivel',
  managements: 'gestion',
  institutionTypes: 'tipo',
  modalities: 'modalidad',
  shifts: 'turno',
  citySlugs: 'ciudad',
  departmentSlugs: 'departamento',
  accreditationStatuses: 'acreditacion',
  enrollmentStatuses: 'inscripcion',
  institutionSlug: 'institucion',
  annualCostMin: 'arancel_min',
  annualCostMax: 'arancel_max',
  isFree: 'gratuita',
  durationMonthsMax: 'duracion_max',
  sort: 'orden',
  page: 'pagina',
  pageSize: 'por_pagina',
} as const satisfies Record<keyof SearchFilters, string>;

/** Not a filter — the view toggle and the comparador selection ride along. */
export const VIEW_PARAM = 'vista';
export const COMPARE_PARAM = 'comparar';
export const VIEW_MODES = ['tarjetas', 'tabla'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const DEFAULT_VIEW: ViewMode = 'tarjetas';

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything a result card, a table row and a comparador column need.
 * One object per offering. No nullable field is a rendering accident: a null
 * is an honest gap and the UI must say so rather than fill it in.
 */
export interface OfferingSummary {
  offeringId: number;
  programId: number;
  institutionId: number;
  careerId: number | null;
  campusId: number;
  cityId: number;
  departmentId: number;
  areaId: number | null;

  /** Href parts. `/universidades/{institutionSlug}/{programSlug}`. */
  institutionSlug: string;
  programSlug: string;
  careerSlug: string | null;
  areaSlug: string | null;
  citySlug: string;
  departmentSlug: string;

  programName: string;
  careerName: string | null;
  titleAwarded: string | null;
  /** `name_official` — detail pages only. */
  institutionName: string;
  /** `name_short` — cards and tables (design-system.md §8.6). */
  institutionShort: string;
  institutionLogo: string | null;
  brandColor: string | null;
  campusName: string;
  cityName: string;
  departmentName: string;

  level: Level;
  modality: Modality;
  shift: Shift;
  management: Management;
  institutionType: InstitutionType;
  /** Integer months. Format at render time, never store "5 años". */
  durationMonths: number | null;

  price: PriceSummary;
  accreditation: AccreditationSummary;

  enrollmentStatus: EnrollmentStatus;
  admissionClosesOn: string | null;

  planRank: number;
}

/**
 * The price as the UI is allowed to see it.
 *
 * There is no `isDisplayable` and nothing is stripped: PR-33 reversed that
 * rule (CLAUDE.md rule 3). Every amount travels, and `freshness` travels with
 * it, so a component renders the number **and** the warning from one object
 * rather than choosing between them. `priceDisplay()` and `staleNotice()` are
 * where that pairing is enforced.
 */
export interface PriceSummary {
  /**
   * `fresh` · `stale` (verified more than 12 months ago) · `unknown` (never
   * verified). **Amounts are present in all three** since PR-33 — a stale
   * arancel is displayed with a visible warning and its date rather than
   * hidden (CLAUDE.md rule 3). `hasAmount` says whether there is a number at
   * all; freshness says how much to trust it.
   */
  freshness: PriceFreshness;
  /** True when at least one amount (or `isFree`) is present. */
  hasAmount: boolean;
  isFree: boolean;
  currency: Currency | null;
  matricula: number | null;
  monthlyFee: number | null;
  installmentsPerYear: number | null;
  admissionFee: number | null;
  /** matrícula + cuota × cuotas/año. The number the comparador sorts on. */
  annualCost: number | null;
  /** When we last confirmed this number. Null means we never could. */
  verifiedAt: Date | null;
}

export type { PriceFreshness };

/** A badge and the link that justifies it. Never one without the other. */
export interface AccreditationSummary {
  status: AccreditationStatus;
  agency: AccreditationAgency | null;
  sourceUrl: string | null;
  validTo: string | null;
}

/* -------------------------------------------------------------------------- */
/* Facets                                                                     */
/* -------------------------------------------------------------------------- */

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  /** True when this option is part of the current filter set. */
  selected: boolean;
}

/**
 * Counts use cross-filtering semantics: each group's counts apply every OTHER
 * active filter but not its own, so selecting one option never zeroes its
 * siblings.
 */
export type FacetGroupKey =
  | 'areas'
  | 'levels'
  | 'managements'
  | 'modalities'
  | 'shifts'
  | 'cities'
  | 'accreditationStatuses'
  | 'enrollmentStatuses';

export type Facets = Record<FacetGroupKey, FacetOption[]>;

export interface SearchResponse {
  results: OfferingSummary[];
  facets: Facets;
  total: number;
  page: number;
  pageSize: number;
  sort: SortKey;
  /** Debug/perf only; never rendered. */
  tookMs?: number;
}

/**
 * The single entry point. PR-07 implements it in `src/lib/search/index.ts`.
 */
export type SearchPrograms = (filters: SearchFilters) => Promise<SearchResponse>;

/** Comparador ceiling — 4 on desktop, 3 on mobile (architecture.md §5). */
export const MAX_COMPARE = 4;
export const MAX_COMPARE_MOBILE = 3;

/** PR-09 reads the same rows through this, so a comparison never joins. */
export type GetOfferingsByIds = (ids: number[]) => Promise<OfferingSummary[]>;
