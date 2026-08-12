/**
 * `program_search` row → `OfferingSummary`.
 *
 * ### The 12-month rule, after PR-33
 *
 * This function used to **null every amount** on a price older than twelve
 * months, so that no component could render a stale arancel. That policy is
 * reversed: the amounts now always travel, tagged with `freshness`, and the UI
 * shows the number **with a visible warning and the date we last verified it**
 * (CLAUDE.md rule 3, `architecture.md` §23).
 *
 * The classification is still not re-implemented here — `priceFreshness()` in
 * `src/db/invariants.ts` is the single decision point for the comparador,
 * JSON-LD and OG images alike, and this module calls it.
 */

import { priceFreshness } from '@/db/invariants';
import type { programSearch } from '@/db/schema';

import type { OfferingSummary, PriceSummary } from './contract';

/** One row of the flat index, exactly as Drizzle selects it. */
export type ProgramSearchRow = typeof programSearch.$inferSelect;

/** No number at all: the UI shows "Consultá el arancel", never a guess. */
const NO_PRICE: Omit<PriceSummary, 'verifiedAt' | 'freshness'> = {
  hasAmount: false,
  isFree: false,
  currency: null,
  matricula: null,
  monthlyFee: null,
  installmentsPerYear: null,
  admissionFee: null,
  annualCost: null,
};

/**
 * The amounts always travel; `freshness` says how much to trust them.
 *
 * `hasAmount` is what separates "we have no number" from "we have an old
 * number": the first is still the honest gap ("Consultá el arancel"), the
 * second is a number plus a warning. `isFree` counts as an amount — "Gratuita"
 * is a claim, and an old one is labelled like any other.
 */
export function toPriceSummary(row: ProgramSearchRow, now: Date = new Date()): PriceSummary {
  const freshness = priceFreshness(row.priceVerifiedAt, now);
  const hasAmount =
    row.isFree || row.annualCostGs != null || row.monthlyFeeGs != null || row.matriculaGs != null;

  if (!hasAmount) {
    return { ...NO_PRICE, freshness, verifiedAt: row.priceVerifiedAt ?? null };
  }

  return {
    freshness,
    hasAmount: true,
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
