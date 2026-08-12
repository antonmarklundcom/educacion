import { describe, expect, it } from 'vitest';

import { PLAN_RANK } from '@/db/schema';

import { FEATURES_BY_RANK, PLAN_RANKS, can, freeEntitlements } from './contract';
import { resolveEntitlements, subscriptionStanding, type SubscriptionFacts } from './resolve';

const NOW = new Date('2026-08-12T10:00:00.000Z');

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    id: 1,
    institutionId: 7,
    status: 'active',
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    planCode: 'verificado_25',
    planName: 'Verificado — hasta 25 programas',
    planRank: 1,
    includedLeadsMonth: null,
    ...overrides,
  };
}

describe('the rank scale matches the schema', () => {
  it('agrees with PLAN_RANK in db/schema.ts', () => {
    // The contract redeclares these so client-safe modules can import them
    // without pulling Drizzle. If the two ever drift, the site would rank
    // paid placements by one scale and gate features by another.
    expect(PLAN_RANKS).toEqual(PLAN_RANK);
  });
});

describe('subscriptionStanding', () => {
  it('counts an active subscription inside its period', () => {
    expect(subscriptionStanding(sub(), '2026-08-12', 0)).toBe('active');
  });

  it('counts a trial as a trial', () => {
    expect(subscriptionStanding(sub({ status: 'trial' }), '2026-08-12', 0)).toBe('trial');
  });

  it('does not count a subscription that has not started', () => {
    expect(subscriptionStanding(sub({ startsOn: '2026-09-01' }), '2026-08-12', 0)).toBeNull();
  });

  it('counts the last day of the period and not the day after', () => {
    const s = sub({ endsOn: '2026-08-12' });
    expect(subscriptionStanding(s, '2026-08-12', 0)).toBe('active');
    expect(subscriptionStanding(s, '2026-08-13', 0)).toBeNull();
  });

  it('treats a null end date as open-ended', () => {
    expect(subscriptionStanding(sub({ endsOn: null }), '2030-01-01', 0)).toBe('active');
  });

  it('never counts a cancelled subscription, even inside its paid period', () => {
    expect(subscriptionStanding(sub({ status: 'cancelled' }), '2026-08-12', 0)).toBeNull();
    expect(subscriptionStanding(sub({ status: 'cancelled' }), '2026-08-12', 90)).toBeNull();
  });

  describe('past_due', () => {
    const pastDue = sub({ status: 'past_due', endsOn: '2026-08-01' });

    it('grants nothing once the period ended and grace is zero', () => {
      expect(subscriptionStanding(pastDue, '2026-08-12', 0)).toBeNull();
    });

    it('grants inside the grace window and stops on the day after it', () => {
      expect(subscriptionStanding(pastDue, '2026-08-12', 15)).toBe('past_due_grace');
      expect(subscriptionStanding(pastDue, '2026-08-16', 15)).toBe('past_due_grace');
      expect(subscriptionStanding(pastDue, '2026-08-17', 15)).toBeNull();
    });

    it('grants nothing when there is no end date to measure grace from', () => {
      expect(
        subscriptionStanding(sub({ status: 'past_due', endsOn: null }), '2026-08-12', 90),
      ).toBeNull();
    });
  });
});

describe('resolveEntitlements', () => {
  it('is the free baseline when there is no subscription at all', () => {
    expect(resolveEntitlements(7, [], { now: NOW })).toEqual(freeEntitlements(7));
  });

  it('is the free baseline when every subscription has lapsed — no cron required', () => {
    const lapsed = resolveEntitlements(7, [sub({ endsOn: '2026-07-31' })], { now: NOW });
    expect(lapsed.planRank).toBe(PLAN_RANKS.gratis);
    expect(can(lapsed, 'lead_contacts')).toBe(false);
    expect(can(lapsed, 'verified_badge')).toBe(false);
  });

  it('gives a verificado subscription the verificado feature set', () => {
    const result = resolveEntitlements(7, [sub()], { now: NOW });
    expect(result.planRank).toBe(PLAN_RANKS.verificado);
    expect(result.planCode).toBe('verificado_25');
    expect(result.status).toBe('active');
    expect(result.features).toEqual(FEATURES_BY_RANK[PLAN_RANKS.verificado]);
    expect(can(result, 'priority_placement')).toBe(false);
  });

  it('unions the features of a verificado plan and a destacado add-on', () => {
    const result = resolveEntitlements(
      7,
      [sub(), sub({ id: 2, planCode: 'destacado', planName: 'Destacado', planRank: 2 })],
      { now: NOW },
    );
    expect(result.planRank).toBe(PLAN_RANKS.destacado);
    expect(result.planCode).toBe('destacado');
    expect(can(result, 'priority_placement')).toBe(true);
    expect(can(result, 'lead_contacts')).toBe(true);
    expect(result.subscriptionIds).toEqual([1, 2]);
  });

  it('ignores subscriptions belonging to another institution', () => {
    const result = resolveEntitlements(7, [sub({ id: 9, institutionId: 8 })], { now: NOW });
    expect(result).toEqual(freeEntitlements(7));
  });

  it('reports the earliest end date as the current period end', () => {
    const result = resolveEntitlements(
      7,
      [sub({ endsOn: '2026-12-31' }), sub({ id: 2, planRank: 2, endsOn: '2026-10-31' })],
      { now: NOW },
    );
    expect(result.currentPeriodEndsOn).toBe('2026-10-31');
  });

  it('reports past_due_grace when any counting subscription is unpaid', () => {
    const result = resolveEntitlements(
      7,
      [sub(), sub({ id: 2, status: 'past_due', endsOn: '2026-08-01' })],
      { now: NOW, graceDays: 30 },
    );
    expect(result.status).toBe('past_due_grace');
  });

  it('takes the highest quota among counting subscriptions', () => {
    const result = resolveEntitlements(
      7,
      [sub({ includedLeadsMonth: 50 }), sub({ id: 2, includedLeadsMonth: 120, planRank: 2 })],
      { now: NOW },
    );
    expect(result.includedLeadsMonth).toBe(120);
  });

  it('revokes everything the moment a plan is downgraded to gratis', () => {
    // The operator cancels Verificado and records a gratis row instead. The
    // acceptance criterion is that this takes effect on the next request, not
    // at the next rebuild — so it must be visible in the pure resolver.
    const result = resolveEntitlements(
      7,
      [
        sub({ status: 'cancelled' }),
        sub({ id: 2, planCode: 'gratis', planName: 'Gratis', planRank: 0 }),
      ],
      { now: NOW },
    );
    expect(result.planRank).toBe(PLAN_RANKS.gratis);
    expect(Object.values(result.features).every((value) => value === false)).toBe(true);
  });
});
