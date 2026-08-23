/**
 * Entitlements → the sentence `/panel` shows an institution about its own plan
 * (PR-49). Pure, so "does a past-due account see a countdown" is answerable in
 * a unit test rather than by editing a subscription row on staging.
 *
 * ### It reads dates, never a rank anybody cached
 *
 * The input is an `Entitlements` value, which `resolveEntitlements` computed
 * from `subscriptions.starts_on` / `ends_on` on *this* request
 * (`architecture.md` §17). It is deliberately not `program_search.plan_rank`,
 * which is a derived copy refreshed on writes and nightly: good enough to order
 * search results, not good enough to tell an institution its plan is active on
 * a day it is not. `pr-plan.md` PR-49 states that constraint, and the only way
 * to satisfy it is for this module to take no other input.
 *
 * ### No dark pattern on the free tier
 *
 * A free institution has no end date, so it gets no number: `daysLeft` is null
 * and the view is a plain statement of the tier plus the link to
 * `/para-instituciones`. Every remaining state's countdown is a real date the
 * institution agreed to. That asymmetry is the acceptance criterion, not a
 * style choice — a "quedan 3 días" on an account that never had a period is an
 * invented deadline, which is CLAUDE.md rule 1 wearing a marketing hat.
 *
 * ### Why the grace state names a second date
 *
 * `past_due_grace` is the one state where "your plan ended" and "your features
 * still work" are both true. Saying only the first is false today, and saying
 * only the second hides that anything is pending — so the copy carries
 * `ends_on` **and** the day the grace window closes, computed from the same
 * `graceDays` the resolver used. `monetization.md` §5's 90/30/7 renewal mail
 * stays operator-only; this is the institution's own read of the same facts,
 * and it dunned nobody.
 */

import { panelCopy } from '@/lib/copy/panel';
import { daysUntil } from '@/lib/billing/renewals';
import type { Entitlements } from '@/lib/entitlements';

/**
 * How near the end of a period counts as "ending soon".
 *
 * The same 30 days as the operator's middle renewal reminder
 * (`billing/config.ts` `REMINDER_THRESHOLDS`), so the institution's banner and
 * the operator's mail describe the same window rather than two. Asserted
 * against that list in `plan-status.test.ts`.
 */
export const PLAN_ENDING_SOON_DAYS = 30;

export type PlanStatusKey =
  'gratis' | 'trial' | 'active' | 'active_open_ended' | 'ending_soon' | 'past_due_grace';

export type PlanStatusTone = 'neutral' | 'warn' | 'danger';

export interface PlanStatusView {
  key: PlanStatusKey;
  tone: PlanStatusTone;
  /** The plan's own name, or the free tier's, never null — this is a heading. */
  planName: string;
  /** `YYYY-MM-DD` as stored, for the caller to format. Null when there is none. */
  endsOn: string | null;
  /** `YYYY-MM-DD` the grace window closes. Only ever set on `past_due_grace`. */
  graceEndsOn: string | null;
  /** Whole days until `endsOn`. **Null on the free tier, always** — see above. */
  daysLeft: number | null;
  /** Whether to offer the `/para-instituciones` link. */
  showPlansLink: boolean;
}

export interface PlanStatusOptions {
  /** Today in Asunción, `YYYY-MM-DD` — the same clock `resolveEntitlements` used. */
  today: string;
  /** `pastDueGraceDays()`. Only read in the `past_due_grace` branch. */
  graceDays: number;
  /** The free tier's name, from the copy catalog. */
  freeName: string;
}

/** `YYYY-MM-DD` + n days, in UTC arithmetic on the calendar day itself. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function planStatusView(
  entitlements: Entitlements,
  options: PlanStatusOptions,
): PlanStatusView {
  const planName = entitlements.planName ?? options.freeName;
  const endsOn = entitlements.currentPeriodEndsOn;

  if (entitlements.status === 'gratis') {
    return {
      key: 'gratis',
      tone: 'neutral',
      planName: options.freeName,
      endsOn: null,
      graceEndsOn: null,
      daysLeft: null,
      showPlansLink: true,
    };
  }

  if (entitlements.status === 'past_due_grace') {
    // `subscriptionStanding` only reaches this status through a row that has an
    // `ends_on`, so the null branch is unreachable rather than defensive — but
    // it resolves to the open-ended view instead of printing "hasta el null".
    return {
      key: 'past_due_grace',
      tone: 'danger',
      planName,
      endsOn,
      graceEndsOn: endsOn === null ? null : addDays(endsOn, Math.max(0, options.graceDays)),
      daysLeft: endsOn === null ? null : daysUntil(endsOn, options.today),
      showPlansLink: false,
    };
  }

  if (endsOn === null) {
    return {
      key: 'active_open_ended',
      tone: 'neutral',
      planName,
      endsOn: null,
      graceEndsOn: null,
      daysLeft: null,
      showPlansLink: false,
    };
  }

  const daysLeft = daysUntil(endsOn, options.today);

  if (entitlements.status === 'trial') {
    return {
      key: 'trial',
      tone: 'neutral',
      planName,
      endsOn,
      graceEndsOn: null,
      daysLeft,
      showPlansLink: true,
    };
  }

  return {
    key: daysLeft <= PLAN_ENDING_SOON_DAYS ? 'ending_soon' : 'active',
    tone: daysLeft <= PLAN_ENDING_SOON_DAYS ? 'warn' : 'neutral',
    planName,
    endsOn,
    graceEndsOn: null,
    daysLeft,
    showPlansLink: false,
  };
}

export interface PlanStatusSentences {
  headline: string;
  detail: string;
}

/**
 * The view plus its already-formatted dates → the two sentences `/panel`
 * prints. Separate from `planStatusView` so the state machine can be tested
 * against states and this against words, and separate from the page because a
 * `switch` inside JSX is where a state quietly stops being handled.
 *
 * Dates arrive formatted rather than raw: rendering a `date` column correctly
 * is `formatAsuncionDay`'s problem (it is wrong by a day if you let
 * `formatDate` parse the string), and a null from it must degrade to the
 * open-ended sentence rather than print "hasta el null".
 */
export function planStatusSentences(
  view: PlanStatusView,
  formatted: { endsOn: string | null; graceEndsOn: string | null },
): PlanStatusSentences {
  const { plan } = panelCopy;
  switch (view.key) {
    case 'gratis':
      return { headline: plan.gratisHeadline, detail: plan.gratisDetail };
    case 'trial':
      return {
        headline: plan.trialHeadline(view.planName),
        detail:
          formatted.endsOn === null ? plan.openEndedDetail : plan.trialDetail(formatted.endsOn),
      };
    case 'past_due_grace':
      return {
        headline: plan.pastDueHeadline,
        detail:
          formatted.endsOn === null || formatted.graceEndsOn === null
            ? plan.openEndedDetail
            : plan.pastDueDetail(formatted.endsOn, formatted.graceEndsOn),
      };
    case 'ending_soon':
      return {
        headline:
          formatted.endsOn === null
            ? plan.activeHeadline
            : plan.endingSoonHeadline(formatted.endsOn),
        detail: plan.endingSoonDetail,
      };
    case 'active_open_ended':
      return { headline: plan.activeHeadline, detail: plan.openEndedDetail };
    case 'active':
      return {
        headline: plan.activeHeadline,
        detail:
          formatted.endsOn === null ? plan.openEndedDetail : plan.activeDetail(formatted.endsOn),
      };
  }
}
