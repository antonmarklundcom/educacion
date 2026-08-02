/**
 * `program_search` row → `OfferingSummary`.
 *
 * This is the only place a stored price becomes a displayable one, and it is
 * the reason `PriceSummary` is shaped the way it is: when the 12-month rule
 * says no, the amounts are `null` before the object leaves this function. A
 * component cannot render a stale arancel because it is never handed one
 * (CLAUDE.md rule 3, data-model.md §5).
 *
 * The decision itself is not re-implemented here — `isPriceDisplayable()` in
 * `src/db/invariants.ts` is the single decision point for the comparador,
 * JSON-LD and OG images alike, and this module calls it.
 */

import { isPriceDisplayable } from '@/db/invariants';
import type { programSearch } from '@/db/schema';

import type { OfferingSummary, PriceSummary } from './contract';

/** One row of the flat index, exactly as Drizzle selects it. */
export type ProgramSearchRow = typeof programSearch.$inferSelect;

/** Nothing displayable: the UI shows "Consultá el arancel", never a number. */
const NO_PRICE: Omit<PriceSummary, 'verifiedAt'> = {
  isDisplayable: false,
  isFree: false,
  currency: null,
  matricula: null,
  monthlyFee: null,
  installmentsPerYear: null,
  admissionFee: null,
  annualCost: null,
};

/**
 * `verifiedAt` survives a non-displayable price on purpose: "último dato
 * verificado en 2023" is honest provenance, not a price, and it is what lets
 * the UI explain the gap instead of pretending there is no data at all. Every
 * *amount* is `null`, including `isFree` — asserting "Gratuita" from a
 * three-year-old capture is the same claim as asserting a number.
 */
export function toPriceSummary(row: ProgramSearchRow, now: Date = new Date()): PriceSummary {
  if (!isPriceDisplayable(row.priceVerifiedAt, now)) {
    return { ...NO_PRICE, verifiedAt: row.priceVerifiedAt ?? null };
  }
  return {
    isDisplayable: true,
    isFree: row.isFree,
    currency: row.priceCurrency ?? null,
    matricula: row.matriculaGs ?? null,
    monthlyFee: row.monthlyFeeGs ?? null,
    installmentsPerYear: row.installmentsPerYear ?? null,
    admissionFee: row.admissionFeeGs ?? null,
    annualCost: row.annualCostGs ?? null,
    verifiedAt: row.priceVerifiedAt ?? null,
  };
}

export function toOfferingSummary(row: ProgramSearchRow, now: Date = new Date()): OfferingSummary {
  return {
    offeringId: row.offeringId,
    programId: row.programId,
    institutionId: row.institutionId,
    careerId: row.careerId ?? null,
    campusId: row.campusId,
    cityId: row.cityId,
    departmentId: row.departmentId,
    areaId: row.areaId ?? null,

    institutionSlug: row.institutionSlug,
    programSlug: row.programSlug,
    careerSlug: row.careerSlug ?? null,
    areaSlug: row.areaSlug ?? null,
    citySlug: row.citySlug,
    departmentSlug: row.departmentSlug,

    programName: row.programName,
    careerName: row.careerName ?? null,
    titleAwarded: row.titleAwarded ?? null,
    institutionName: row.institutionName,
    institutionShort: row.institutionShort,
    institutionLogo: row.institutionLogo ?? null,
    brandColor: row.brandColor ?? null,
    campusName: row.campusName,
    cityName: row.cityName,
    departmentName: row.departmentName,

    level: row.level,
    modality: row.modality,
    shift: row.shift,
    management: row.management,
    institutionType: row.institutionType,
    durationMonths: row.durationMonths ?? null,

    price: toPriceSummary(row, now),
    accreditation: {
      status: row.accreditationStatus,
      agency: row.accreditationAgency ?? null,
      sourceUrl: row.accreditationSourceUrl ?? null,
      validTo: row.accreditationValidTo ?? null,
    },

    enrollmentStatus: row.enrollmentStatus,
    admissionClosesOn: row.admissionClosesOn ?? null,

    planRank: row.planRank,
  };
}
