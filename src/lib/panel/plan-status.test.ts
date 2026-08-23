/**
 * The plan banner's state machine (PR-49).
 *
 * The acceptance criterion this file exists to hold: **a free institution never
 * sees a countdown**, and every date that is shown belongs to a period an
 * institution actually bought. Delete the `gratis` branch's `daysLeft: null`
 * and the first test here goes red.
 */

import { describe, expect, it } from 'vitest';

import { REMINDER_THRESHOLDS } from '@/lib/billing/config';
import {
  FEATURES_BY_RANK,
  PLAN_RANKS,
  freeEntitlements,
  type Entitlements,
} from '@/lib/entitlements';

import {
  PLAN_ENDING_SOON_DAYS,
  planStatusSentences,
  planStatusView,
  type PlanStatusView,
} from './plan-status';

const TODAY = '2026-08-23';
const OPTIONS = { today: TODAY, graceDays: 15, freeName: 'Gratis' };

function paid(overrides: Partial<Entitlements> = {}): Entitlements {
  return {
    institutionId: 1,
    planRank: PLAN_RANKS.verificado,
    planCode: 'verificado_25',
    planName: 'Verificado',
    features: FEATURES_BY_RANK[PLAN_RANKS.verificado],
    status: 'active',
    includedLeadsMonth: null,
    subscriptionIds: [7],
    currentPeriodEndsOn: '2026-12-31',
    ...overrides,
  };
}

describe('the free tier', () => {
  const view = planStatusView(freeEntitlements(1), OPTIONS);

  it('is stated plainly, with no countdown of any kind', () => {
    expect(view.key).toBe('gratis');
    expect(view.daysLeft).toBeNull();
    expect(view.endsOn).toBeNull();
    expect(view.graceEndsOn).toBeNull();
  });

  it('offers the plans link and nothing more urgent than neutral', () => {
    expect(view.showPlansLink).toBe(true);
    expect(view.tone).toBe('neutral');
  });

  it('names the free tier from the catalog rather than inventing one', () => {
    expect(view.planName).toBe('Gratis');
    expect(planStatusView(freeEntitlements(1), { ...OPTIONS, freeName: 'Sin plan' }).planName).toBe(
      'Sin plan',
    );
  });

  it('says nothing about a date in either sentence', () => {
    const { headline, detail } = planStatusSentences(view, { endsOn: null, graceEndsOn: null });
    expect(`${headline} ${detail}`).not.toMatch(/\d/);
  });
});

describe('a paid, healthy period', () => {
  it('is `active` while the end is further off than the ending-soon window', () => {
    const view = planStatusView(paid({ currentPeriodEndsOn: '2026-12-31' }), OPTIONS);
    expect(view.key).toBe('active');
    expect(view.tone).toBe('neutral');
    expect(view.daysLeft).toBe(130);
    expect(view.showPlansLink).toBe(false);
  });

  it('turns to `ending_soon` exactly at the window, not a day earlier', () => {
    const soon = planStatusView(paid({ currentPeriodEndsOn: '2026-09-22' }), OPTIONS);
    expect(soon.daysLeft).toBe(PLAN_ENDING_SOON_DAYS);
    expect(soon.key).toBe('ending_soon');
    expect(soon.tone).toBe('warn');

    const notYet = planStatusView(paid({ currentPeriodEndsOn: '2026-09-23' }), OPTIONS);
    expect(notYet.daysLeft).toBe(PLAN_ENDING_SOON_DAYS + 1);
    expect(notYet.key).toBe('active');
  });

  it('uses the same 30 days as the operator renewal reminder', () => {
    expect(REMINDER_THRESHOLDS).toContain(PLAN_ENDING_SOON_DAYS);
  });

  it('says so without a date when the subscription is open-ended', () => {
    const view = planStatusView(paid({ currentPeriodEndsOn: null }), OPTIONS);
    expect(view.key).toBe('active_open_ended');
    expect(view.daysLeft).toBeNull();
    expect(planStatusSentences(view, { endsOn: null, graceEndsOn: null }).detail).toContain(
      'no tiene fecha de término',
    );
  });
});

describe('a trial', () => {
  const view = planStatusView(
    paid({ status: 'trial', currentPeriodEndsOn: '2026-08-30' }),
    OPTIONS,
  );

  it('names the plan being tried and keeps the plans link', () => {
    expect(view.key).toBe('trial');
    expect(view.showPlansLink).toBe(true);
    expect(
      planStatusSentences(view, { endsOn: '30 de agosto de 2026', graceEndsOn: null }).headline,
    ).toBe('Estás probando Verificado.');
  });

  it('states the trial end date it actually has', () => {
    expect(view.daysLeft).toBe(7);
  });
});

describe('past due, inside grace', () => {
  const view = planStatusView(
    paid({ status: 'past_due_grace', currentPeriodEndsOn: '2026-08-20' }),
    OPTIONS,
  );

  it('names both dates: the period that ended and the day cover stops', () => {
    expect(view.key).toBe('past_due_grace');
    expect(view.endsOn).toBe('2026-08-20');
    expect(view.graceEndsOn).toBe('2026-09-04');
    expect(view.daysLeft).toBe(-3);
  });

  it('computes the grace end from the grace days it was given, not a constant', () => {
    const zero = planStatusView(
      paid({ status: 'past_due_grace', currentPeriodEndsOn: '2026-08-20' }),
      { ...OPTIONS, graceDays: 0 },
    );
    expect(zero.graceEndsOn).toBe('2026-08-20');
  });

  it('does not sell — it is a payment note, not a dunning upsell', () => {
    expect(view.showPlansLink).toBe(false);
    expect(view.tone).toBe('danger');
  });

  it('degrades to the open-ended sentence rather than printing a null date', () => {
    const { detail } = planStatusSentences(view, { endsOn: null, graceEndsOn: null });
    expect(detail).not.toContain('null');
  });
});

/**
 * PR-52's review finding. `past_due` is a status an **operator** sets, not a
 * date the system reaches, so it is reachable while the period is still
 * running — and the grace copy then asserted that a future day had already
 * passed. Nothing covered it: every earlier case used an `ends_on` in the past.
 */
describe('past due while the period is still running', () => {
  const view = planStatusView(
    paid({ status: 'past_due_grace', currentPeriodEndsOn: '2026-12-31' }),
    OPTIONS,
  );

  it('is still the past-due state — the unpaid invoice is the fact', () => {
    expect(view.key).toBe('past_due_grace');
    expect(view.daysLeft).toBeGreaterThan(0);
  });

  it('never says a future period already ended', () => {
    const { detail } = planStatusSentences(view, {
      endsOn: '31 de diciembre de 2026',
      graceEndsOn: '15 de enero de 2027',
    });
    expect(detail).not.toContain('terminó');
    expect(detail).toContain('va hasta el 31 de diciembre de 2026');
  });

  it('still says the payment is pending, which is the point of the banner', () => {
    const { headline, detail } = planStatusSentences(view, {
      endsOn: '31 de diciembre de 2026',
      graceEndsOn: '15 de enero de 2027',
    });
    expect(headline).toContain('pago pendiente');
    expect(detail).toContain('pendiente');
  });

  it('goes back to the grace sentence once the period has actually ended', () => {
    const ended = planStatusView(
      paid({ status: 'past_due_grace', currentPeriodEndsOn: '2026-08-20' }),
      OPTIONS,
    );
    const { detail } = planStatusSentences(ended, {
      endsOn: '20 de agosto de 2026',
      graceEndsOn: '4 de septiembre de 2026',
    });
    expect(detail).toContain('terminó');
  });
});

describe('the sentences', () => {
  const KEYS: PlanStatusView['key'][] = [
    'gratis',
    'trial',
    'active',
    'active_open_ended',
    'ending_soon',
    'past_due_grace',
  ];

  it('handles every state — a new key with no branch is a type error and a red test', () => {
    for (const key of KEYS) {
      const view: PlanStatusView = {
        key,
        tone: 'neutral',
        planName: 'Verificado',
        endsOn: '2026-12-31',
        graceEndsOn: '2027-01-15',
        daysLeft: 130,
        showPlansLink: false,
      };
      const { headline, detail } = planStatusSentences(view, {
        endsOn: '31 de diciembre de 2026',
        graceEndsOn: '15 de enero de 2027',
      });
      expect(headline.trim(), key).not.toBe('');
      expect(detail.trim(), key).not.toBe('');
    }
  });
});
