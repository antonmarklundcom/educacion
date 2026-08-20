/**
 * `plan_rank` boosts exactly what the label path labels (PR-46).
 *
 * The independent review of PR-27 found that it did not. `plan_rank` is the
 * tiebreaker on every default-sorted page, and on `/carreras` with no query
 * every row ties on relevance (`architecture.md` §4.1) — so writing the
 * entitlement's *rank* meant a **Verificado** institution was ordered ahead of
 * every free institution it tied with, while `placementFlags().destacado` was
 * `false` for those rows. No badge, no `PlacementDisclosure`, and a page whose
 * order had been paid for: the one practice `monetization.md` §3 names as
 * fatal.
 *
 * These tests are that boundary. The last one is the important one: it walks
 * the same fixtures through **both** functions and asserts they agree, so the
 * two halves cannot drift apart again the way they did.
 */

import { describe, expect, it } from 'vitest';

import { PLAN_SEED } from '@/lib/entitlements/catalog';
import {
  pastDueGraceDays,
  placementFlags,
  resolveEntitlements,
  type SubscriptionFacts,
} from '@/lib/entitlements';

import { planRanksByInstitution } from './rebuild-search';

const NOW = new Date('2026-08-20T12:00:00Z');

let nextId = 1;

function fact(
  overrides: Partial<SubscriptionFacts> & { institutionId: number },
): SubscriptionFacts {
  return {
    id: nextId++,
    institutionId: overrides.institutionId,
    planCode: overrides.planCode ?? 'destacado',
    planName: overrides.planName ?? 'Destacado (complemento)',
    planRank: overrides.planRank ?? 2,
    includedLeadsMonth: overrides.includedLeadsMonth ?? null,
    status: overrides.status ?? 'active',
    startsOn: overrides.startsOn ?? '2026-01-01',
    endsOn: overrides.endsOn === undefined ? '2027-01-01' : overrides.endsOn,
  };
}

/** The two paid tiers, by the rank the seed catalog gives them. */
const VERIFICADO = {
  planCode: 'verificado_75',
  planName: 'Verificado — 26 a 75 programas',
  planRank: 1,
} as const;
const DESTACADO = {
  planCode: 'destacado',
  planName: 'Destacado (complemento)',
  planRank: 2,
} as const;

describe('the fixtures name real plans', () => {
  // Rule 1 applies to fixtures. A fabricated plan code would let these tests
  // pass while describing a product that does not exist.
  it.each([VERIFICADO, DESTACADO])('$planCode is in the seed catalog', (fixture) => {
    const seed = PLAN_SEED.find((plan) => plan.code === fixture.planCode);
    expect(seed, `${fixture.planCode} is not a plan`).toBeDefined();
    expect(seed!.name).toBe(fixture.planName);
    expect(seed!.rank).toBe(fixture.planRank);
  });
});

describe('planRanksByInstitution', () => {
  it('boosts a Destacado institution', () => {
    const ranks = planRanksByInstitution([fact({ institutionId: 1, ...DESTACADO })], NOW);
    expect(ranks.get(1)).toBe(2);
  });

  it('does NOT boost a Verificado institution, which never bought placement', () => {
    // The PR-27 blocker in one assertion. Verificado buys the badge and the
    // lead contacts; `monetization.md` §7 sells `priority_placement` to
    // Destacado alone.
    const ranks = planRanksByInstitution([fact({ institutionId: 1, ...VERIFICADO })], NOW);
    expect(ranks.has(1)).toBe(false);
  });

  it('does not boost a subscription that has ended', () => {
    const ranks = planRanksByInstitution(
      [fact({ institutionId: 1, ...DESTACADO, endsOn: '2026-01-31' })],
      NOW,
    );
    expect(ranks.has(1)).toBe(false);
  });

  it('does not boost a cancelled subscription inside its paid period', () => {
    const ranks = planRanksByInstitution(
      [fact({ institutionId: 1, ...DESTACADO, status: 'cancelled' })],
      NOW,
    );
    expect(ranks.has(1)).toBe(false);
  });

  it('does not boost a subscription that has not started', () => {
    const ranks = planRanksByInstitution(
      [fact({ institutionId: 1, ...DESTACADO, startsOn: '2027-06-01' })],
      NOW,
    );
    expect(ranks.has(1)).toBe(false);
  });

  it('boosts an institution holding both plans, once', () => {
    const ranks = planRanksByInstitution(
      [fact({ institutionId: 1, ...VERIFICADO }), fact({ institutionId: 1, ...DESTACADO })],
      NOW,
    );
    expect(ranks.get(1)).toBe(2);
  });

  /**
   * The property, not the cases: **a row is boosted if and only if the label
   * path would label it.** Any future divergence between the index and the
   * badge fails here rather than shipping as an unlabelled paid ranking.
   */
  it('boosts exactly the institutions that render a Destacado badge', () => {
    const cases: SubscriptionFacts[][] = [
      [fact({ institutionId: 1, ...DESTACADO })],
      [fact({ institutionId: 1, ...VERIFICADO })],
      [fact({ institutionId: 1, ...DESTACADO, status: 'cancelled' })],
      [fact({ institutionId: 1, ...DESTACADO, status: 'past_due', endsOn: '2026-08-19' })],
      [fact({ institutionId: 1, ...DESTACADO, endsOn: '2020-01-01' })],
      [fact({ institutionId: 1, ...VERIFICADO }), fact({ institutionId: 1, ...DESTACADO })],
      [],
    ];

    for (const facts of cases) {
      const boosted = planRanksByInstitution(facts, NOW).has(1);
      // The same grace window the live label path resolves with — `getEntitlements`
      // defaults it to `billingGraceDays()`, and comparing against a bare
      // `resolveEntitlements` would be comparing two different questions.
      // (Writing this test the lazy way produced exactly that false positive on
      // a `past_due` row, which is a good argument for the property being here.)
      const labelled = placementFlags(
        resolveEntitlements(1, facts, { now: NOW, graceDays: pastDueGraceDays() }),
      ).destacado;
      expect(boosted, JSON.stringify(facts)).toBe(labelled);
    }
  });
});
