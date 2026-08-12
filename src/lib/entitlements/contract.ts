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
 * ### Why there is no `enhanced_profile` key (removed in PR-27)
 *
 * PR-25 declared one, for "logo, fotos, video y descripción larga". PR-27 went
 * to implement it and found nothing to gate: photos and video have no columns
 * and no upload path anywhere in the schema, and the logo and the description
 * are already rendered for every institution — gating those would mean either
 * hiding public information from students or telling an institution "you may
 * write this and we will not show it". Both are worse products. The key is
 * therefore gone rather than shipped as an empty promise on a price table; it
 * comes back the day institution media exists, with the migration that creates
 * it. `monetization.md` §7 records it.
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
    'analytics_full',
    'monthly_report',
  ]),
  [PLAN_RANKS.destacado]: featureSet([
    'lead_contacts',
    'verified_badge',
    'priority_placement',
    'analytics_full',
    'monthly_report',
  ]),
});

/** Spanish labels for the sales page and the panel. One place, one wording. */
export const FEATURE_LABELS: Readonly<Record<FeatureKey, string>> = Object.freeze({
  lead_contacts: 'Datos de contacto de cada solicitud',
  verified_badge: 'Insignia “Perfil verificado”',
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

/**
 * The two plan-derived marks a public page renders. Declared here, in the
 * I/O-free module, so a component can import the *type* without pulling the
 * database driver into its module graph (`architecture.md` §5.1 — the same
 * hazard the search barrel has).
 */
export interface PlacementFlags {
  /** `verified_badge` — the institution maintains this profile itself. */
  verified: boolean;
  /** `priority_placement` — this institution's rows may win a tie. */
  destacado: boolean;
}

export const NO_PLACEMENT: PlacementFlags = Object.freeze({ verified: false, destacado: false });

/** The read every gate goes through. Server-side only — see `requireFeature`. */
export function can(entitlements: Entitlements, feature: FeatureKey): boolean {
  return entitlements.features[feature];
}

/**
 * Entitlements → the two marks a public page renders. Pure, so "does a
 * cancelled plan still show the badge" is answerable in a unit test rather
 * than by loading a page (PR-27).
 */
export function placementFlags(entitlements: Entitlements): PlacementFlags {
  return {
    verified: entitlements.features.verified_badge,
    destacado: entitlements.features.priority_placement,
  };
}
