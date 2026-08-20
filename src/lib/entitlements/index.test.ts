/**
 * `defaultOptions` — the grace window every async caller inherits (PR-46).
 *
 * `resolve.ts` is pure and well covered, but nothing tested the seam that
 * feeds it. The independent review of PR-29 mutated
 * `{ ...options, graceDays: options?.graceDays ?? billingGraceDays() }` back to
 * `{ graceDays: billingGraceDays(), ...options }` and the whole suite stayed
 * green — while every `past_due` institution lost its features on the spot,
 * because a caller passing `{ graceDays: undefined }` (type-legal without
 * `exactOptionalPropertyTypes`) spreads the default away and `resolve.ts`'s
 * `?? 0` then revokes immediately.
 *
 * Only `subscriptionFactsFor` is replaced; the real `resolveEntitlements` and
 * the real `billingGraceDays` run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubscriptionFacts } from './resolve';

const INSTITUTION = 7;

/** Past due since the 10th: inside a 15-day grace on the 20th, outside a 0-day one. */
const PAST_DUE: SubscriptionFacts = {
  id: 1,
  institutionId: INSTITUTION,
  planCode: 'verificado_75',
  planName: 'Verificado — 26 a 75 programas',
  planRank: 1,
  includedLeadsMonth: null,
  status: 'past_due',
  startsOn: '2025-08-10',
  endsOn: '2026-08-10',
};

let facts: SubscriptionFacts[] = [PAST_DUE];

vi.mock('@/db/queries/plans', () => ({
  subscriptionFactsFor: async () => facts,
}));

const { getEntitlements, getEntitlementsForInstitutions } = await import('./index');

// 12:00Z on the 20th is the 20th in Asunción either way — the offset is not
// what these cases are about.
const NOW = new Date('2026-08-20T12:00:00.000Z');

beforeEach(() => {
  facts = [PAST_DUE];
  process.env.BILLING_GRACE_DAYS = '15';
});

afterEach(() => {
  delete process.env.BILLING_GRACE_DAYS;
});

describe('the configured grace window reaches resolveEntitlements', () => {
  it('applies it when the caller passes no options at all', async () => {
    const result = await getEntitlements(INSTITUTION, { now: NOW });
    expect(result.status).toBe('past_due_grace');
    expect(result.features.lead_contacts).toBe(true);
  });

  it('applies it when the caller passes `graceDays: undefined` explicitly', async () => {
    // The mutation's actual failure mode. An options object built by spreading
    // a partial — `{ today, graceDays: maybe }` — reaches here like this.
    const result = await getEntitlements(INSTITUTION, { now: NOW, graceDays: undefined });
    expect(result.status, 'the default was spread away').toBe('past_due_grace');
    expect(result.features.lead_contacts).toBe(true);
  });

  it('still lets an explicit 0 revoke, so the default is a default and not a floor', async () => {
    const result = await getEntitlements(INSTITUTION, { now: NOW, graceDays: 0 });
    expect(result.status).toBe('gratis');
    expect(result.features.lead_contacts).toBe(false);
  });

  it('reads the environment per call, not at import time', async () => {
    process.env.BILLING_GRACE_DAYS = '0';
    expect((await getEntitlements(INSTITUTION, { now: NOW })).status).toBe('gratis');
    process.env.BILLING_GRACE_DAYS = '15';
    expect((await getEntitlements(INSTITUTION, { now: NOW })).status).toBe('past_due_grace');
  });

  it('applies it on the batch read too', async () => {
    // The surface a results page uses. Two code paths, one `defaultOptions`.
    const map = await getEntitlementsForInstitutions([INSTITUTION], {
      now: NOW,
      graceDays: undefined,
    });
    expect(map.get(INSTITUTION)?.status).toBe('past_due_grace');
  });

  it('gives an institution with no subscription the free baseline', async () => {
    facts = [];
    const map = await getEntitlementsForInstitutions([INSTITUTION], { now: NOW });
    expect(map.get(INSTITUTION)?.status).toBe('gratis');
    expect(map.get(INSTITUTION)?.planRank).toBe(0);
  });
});
