/**
 * What a plan buys — types and constants only, no database, no session.
 *
 * This file is the vocabulary the rest of the codebase gates on. PR-26 (sales
 * page), PR-27 (verified/destacado presentation), PR-28 (analytics) and PR-29
 * (billing ops) all read `FeatureKey`s from here, so a feature is added by
 * naming it once rather than by writing a plan check in three components.
 *
 * ### Why the feature matrix lives in code and not in `plans.features_json`
 *
 * `plans` is an operator-editable table. If gating read `features_json`, a
 * typo'd key in a JSON blob would silently switch a paid feature off for a
 * paying institution, with nothing failing and nothing logged. The matrix
 * below is therefore the source of truth and `features_json` is *descriptive*
 * — it carries what the sales page needs to phrase a price ("desde"), never
 * what the server enforces. `plans.rank` is the join between the two, and it
 * is the same 0/1/2 `program_search.plan_rank` already carries.
 *
 * ### Why "editing your own data" is not on this list
 *
 * `monetization.md` §3's Gratis row originally read "no editing". It is not
 * gated here, and §7 of that document records why: `plan.md` §6 calls arancel
 * collection the actual cost centre of this business and `risks.md` §R-03
 * calls a stale price the largest data risk we carry. Charging for the right
 * to correct a wrong price would buy a little revenue by making the index
 * worse, which is the one trade this product cannot make. What is sold is
 * **presentation, reach and lead access** — everything below — while factual
 * correction stays free for every institution, paying or not.
 */

/** Mirrors `PLAN_RANK` in `src/db/schema.ts`; asserted equal in `resolve.test.ts`. */
export const PLAN_RANKS = { gratis: 0, verificado: 1, destacado: 2 } as const;

export type PlanRank = (typeof PLAN_RANKS)[keyof typeof PLAN_RANKS];

export const PLAN_RANK_VALUES = [0, 1, 2] as const satisfies readonly PlanRank[];

export const FEATURE_KEYS = [
  /** `/panel/leads` shows name, phone, email and message, and the CSV carries them. */
  'lead_contacts',
  /** The "Perfil verificado" badge on the institution profile and result cards. */
  'verified_badge',
  /** Logo, photos, video and the long description on the public profile. */
  'enhanced_profile',
  /** `plan_rank` placement in results, always rendered with a "Destacado" label. */
  'priority_placement',
  /** The full institution analytics dashboard rather than the free summary. */
  'analytics_full',
  /** The exportable monthly report (PDF/CSV) used in renewal conversations. */
  'monthly_report',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureSet = Readonly<Record<FeatureKey, boolean>>;

function featureSet(enabled: readonly FeatureKey[]): FeatureSet {
  return Object.freeze(
    Object.fromEntries(FEATURE_KEYS.map((key) => [key, enabled.includes(key)])) as Record<
      FeatureKey,
      boolean
    >,
  );
}

export const NO_FEATURES: FeatureSet = featureSet([]);

/**
 * Rank → features. Verificado buys the profile and the leads; Destacado is an
 * **add-on** and its only additional feature is placement, so an institution
 * holding both gets the union (see `resolveEntitlements`).
 */
export const FEATURES_BY_RANK: Readonly<Record<PlanRank, FeatureSet>> = Object.freeze({
  [PLAN_RANKS.gratis]: NO_FEATURES,
  [PLAN_RANKS.verificado]: featureSet([
    'lead_contacts',
    'verified_badge',
    'enhanced_profile',
    'analytics_full',
    'monthly_report',
  ]),
  [PLAN_RANKS.destacado]: featureSet([
    'lead_contacts',
    'verified_badge',
    'enhanced_profile',
    'priority_placement',
    'analytics_full',
    'monthly_report',
  ]),
});

/** Spanish labels for the sales page and the panel. One place, one wording. */
export const FEATURE_LABELS: Readonly<Record<FeatureKey, string>> = Object.freeze({
  lead_contacts: 'Datos de contacto de cada solicitud',
  verified_badge: 'Insignia “Perfil verificado”',
  enhanced_profile: 'Perfil ampliado: logo, fotos, video y descripción larga',
  priority_placement: 'Ubicación destacada en los resultados, siempre etiquetada',
  analytics_full: 'Estadísticas completas de tu institución',
  monthly_report: 'Reporte mensual exportable',
});

/**
 * How the entitlements were arrived at. `past_due_grace` is the state PR-29
 * degrades from: the invoice is unpaid, the period has ended, and the
 * configured grace days have not run out yet.
 */
export type EntitlementStatus = 'gratis' | 'trial' | 'active' | 'past_due_grace';

export interface Entitlements {
  institutionId: number;
  /** 0 gratis · 1 verificado · 2 destacado — the same scale as `plans.rank`. */
  planRank: PlanRank;
  /** The highest-ranked counting plan's code, or null when nothing counts. */
  planCode: string | null;
  planName: string | null;
  features: FeatureSet;
  status: EntitlementStatus;
  /** Included monthly lead quota, when the plan states one. Informational today. */
  includedLeadsMonth: number | null;
  /** Subscriptions that actually granted something, for the admin and the log. */
  subscriptionIds: number[];
  /** The earliest end date among the counting subscriptions. Null = open-ended. */
  currentPeriodEndsOn: string | null;
}

/** The free baseline. Never inferred from a missing row by accident — this is it. */
export function freeEntitlements(institutionId: number): Entitlements {
  return {
    institutionId,
    planRank: PLAN_RANKS.gratis,
    planCode: null,
    planName: null,
    features: NO_FEATURES,
    status: 'gratis',
    includedLeadsMonth: null,
    subscriptionIds: [],
    currentPeriodEndsOn: null,
  };
}

/** The read every gate goes through. Server-side only — see `requireFeature`. */
export function can(entitlements: Entitlements, feature: FeatureKey): boolean {
  return entitlements.features[feature];
}
