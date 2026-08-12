/**
 * What a student sees, as a pure function of what was bought (PR-27).
 *
 * The badges themselves are three lines of JSX; the part that can be wrong is
 * *when* they render, and that is decided here rather than in a component —
 * which is what lets "a cancelled plan still shows Destacado" be a failing
 * test instead of a screenshot somebody sends us.
 */

import { describe, expect, it } from 'vitest';

import { placementFlags } from './contract';
import { resolveEntitlements, type SubscriptionFacts } from './resolve';

const NOW = new Date('2026-08-12T10:00:00.000Z');

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    id: 1,
    institutionId: 7,
    status: 'active',
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    planCode: 'verificado_25',
    planName: 'Verificado',
    planRank: 1,
    includedLeadsMonth: null,
    ...overrides,
  };
}

const flagsFor = (subscriptions: SubscriptionFacts[]) =>
  placementFlags(resolveEntitlements(7, subscriptions, { now: NOW }));

describe('placementFlags', () => {
  it('shows nothing for an institution with no subscription', () => {
    expect(flagsFor([])).toEqual({ verified: false, destacado: false });
  });

  it('shows the verified badge and no Destacado for Verificado', () => {
    expect(flagsFor([sub()])).toEqual({ verified: true, destacado: false });
  });

  it('shows Destacado only when the add-on is held', () => {
    const withAddOn = flagsFor([sub(), sub({ id: 2, planRank: 2, planCode: 'destacado' })]);
    expect(withAddOn).toEqual({ verified: true, destacado: true });
  });

  it('drops both the day after the period ends, with no job having run', () => {
    expect(flagsFor([sub({ endsOn: '2026-08-11' })])).toEqual({
      verified: false,
      destacado: false,
    });
  });

  it('drops both on a cancelled subscription, even inside its paid period', () => {
    expect(flagsFor([sub({ status: 'cancelled' })])).toEqual({
      verified: false,
      destacado: false,
    });
  });

  it('drops Destacado alone when the add-on lapses and Verificado does not', () => {
    const flags = flagsFor([
      sub(),
      sub({ id: 2, planRank: 2, planCode: 'destacado', endsOn: '2026-07-31' }),
    ]);
    expect(flags).toEqual({ verified: true, destacado: false });
  });

  it('never shows Destacado without the entitlement, whatever plan_rank says', () => {
    // `program_search.plan_rank` is a nightly copy and can be stale; nothing in
    // the label path reads it, so a stale 2 cannot produce a label.
    const staleRankButCancelled = flagsFor([
      sub({ planRank: 2, planCode: 'destacado', status: 'cancelled' }),
    ]);
    expect(staleRankButCancelled.destacado).toBe(false);
  });
});
