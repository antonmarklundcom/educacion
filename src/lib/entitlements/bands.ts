/**
 * Band logic: how many programmes an institution publishes decides which
 * Verificado row it is quoted (`monetization.md` §3 — hasta 25 / 26–75 / 76+).
 *
 * The band is a **pricing** question, never an entitlement one: every
 * Verificado band buys exactly the same features, which is the whole point of
 * selling one signature instead of a line item per programme
 * (`monetization.md` §1a). So this file quotes; `resolve.ts` gates; nothing
 * here is consulted at request time to decide what a page may render.
 *
 * The count that decides a band is **published programmes**, not offerings: an
 * institution that runs Medicina at three sedes negotiates one Medicina, and a
 * band driven by offerings would price a multi-campus university out of a plan
 * it should be sold.
 */

import type { PlanRank } from './contract';

export interface PlanBand {
  id: number;
  code: string;
  name: string;
  priceUsdYear: number;
  programBandMin: number;
  /** Null = open-ended (the "76+" row). */
  programBandMax: number | null;
  rank: PlanRank;
  includedLeadsMonth: number | null;
  /** `plans.features_json` — descriptive only; gating never reads it. */
  featuresJson: Record<string, boolean | number | string> | null;
}

export function bandCovers(plan: PlanBand, programCount: number): boolean {
  if (programCount < plan.programBandMin) return false;
  return plan.programBandMax == null || programCount <= plan.programBandMax;
}

/**
 * The plan an institution with `programCount` published programmes is quoted,
 * out of `plans` of the given rank.
 *
 * Returns null rather than guessing when no band covers the count — a gap in
 * the seeded bands is an operator error to surface, not a number to invent
 * (CLAUDE.md rule 1). Where two rows overlap, the cheaper one wins, so a
 * mis-seeded overlap never silently overcharges.
 */
export function bandForProgramCount(
  plans: readonly PlanBand[],
  programCount: number,
  rank: PlanRank = 1,
): PlanBand | null {
  const candidates = plans
    .filter((plan) => plan.rank === rank && bandCovers(plan, Math.max(0, programCount)))
    .sort((a, b) => a.priceUsdYear - b.priceUsdYear);
  return candidates[0] ?? null;
}

/** Bands of one rank, cheapest first — the order the sales page renders them in. */
export function bandsOfRank(plans: readonly PlanBand[], rank: PlanRank): PlanBand[] {
  return plans.filter((plan) => plan.rank === rank).sort((a, b) => a.priceUsdYear - b.priceUsdYear);
}

/**
 * "desde USD 1.200" rather than a flat price. Set as `price_from: true` in
 * `plans.features_json` for the Destacado add-on, whose price is negotiated
 * per placement (`monetization.md` §3) and therefore has no single number.
 */
export function priceIsFrom(plan: PlanBand): boolean {
  return plan.featuresJson?.price_from === true;
}

/** The human label for a band: "hasta 25 programas", "26–75", "76 o más". */
export function bandLabel(plan: PlanBand): string {
  const { programBandMin: min, programBandMax: max } = plan;
  if (max == null) return min <= 0 ? 'Cualquier cantidad de programas' : `${min} programas o más`;
  if (min <= 0) return `Hasta ${max} programas`;
  return `${min}–${max} programas`;
}
