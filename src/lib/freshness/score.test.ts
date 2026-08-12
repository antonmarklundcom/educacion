import { describe, expect, it } from 'vitest';

import { FRESHNESS_WEIGHTS, scoreFreshness } from './score';

const NOW = new Date('2026-08-12T00:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe('scoreFreshness', () => {
  it('is fresh well inside the interval and scores zero', () => {
    const result = scoreFreshness({ verifiedAt: daysAgo(30), intervalMonths: 12 }, NOW);
    expect(result.level).toBe('fresh');
    expect(result.score).toBe(0);
  });

  it('is aging in the last quarter of the interval', () => {
    const result = scoreFreshness({ verifiedAt: daysAgo(300), intervalMonths: 12 }, NOW);
    expect(result.level).toBe('aging');
    expect(result.score).toBe(0);
  });

  it('is stale past the interval, and the score is the overdue days', () => {
    const result = scoreFreshness({ verifiedAt: daysAgo(400), intervalMonths: 12 }, NOW);
    expect(result.level).toBe('stale');
    expect(result.overdueDays).toBe(400 - 365);
    expect(result.score).toBe(35);
  });

  /**
   * The ordering property the whole queue depends on: a record we published a
   * number for and then let rot must be able to outrank one we never verified.
   * Scoring "never" as infinite would make that impossible.
   */
  it('does not let never-verified records bury the badly rotten ones', () => {
    const never = scoreFreshness({ verifiedAt: null, intervalMonths: 12 }, NOW);
    const veryStale = scoreFreshness({ verifiedAt: daysAgo(365 * 4), intervalMonths: 12 }, NOW);
    expect(never.level).toBe('never');
    expect(veryStale.score).toBeGreaterThan(never.score);
  });

  it('weights a published arancel above a draft one at the same age', () => {
    const published = scoreFreshness(
      { verifiedAt: daysAgo(400), intervalMonths: 12, weight: FRESHNESS_WEIGHTS.publishedPrice },
      NOW,
    );
    const draft = scoreFreshness(
      { verifiedAt: daysAgo(400), intervalMonths: 12, weight: FRESHNESS_WEIGHTS.draftPrice },
      NOW,
    );
    expect(published.score).toBeGreaterThan(draft.score);
  });

  it('ranks an accreditation above an arancel of the same age', () => {
    const accreditation = scoreFreshness(
      { verifiedAt: daysAgo(400), intervalMonths: 12, weight: FRESHNESS_WEIGHTS.accreditation },
      NOW,
    );
    const price = scoreFreshness(
      { verifiedAt: daysAgo(400), intervalMonths: 12, weight: FRESHNESS_WEIGHTS.publishedPrice },
      NOW,
    );
    expect(accreditation.score).toBeGreaterThan(price.score);
  });
});
