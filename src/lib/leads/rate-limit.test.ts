import { beforeEach, describe, expect, it } from 'vitest';

import {
  IP_BURST,
  __resetRateLimitForTests,
  __setMaxKeysForTests,
  checkRate,
  clearRate,
  peekRate,
  recordRate,
  refundRate,
  keyCountForTests,
} from './rate-limit';

beforeEach(() => __resetRateLimitForTests());

describe('checkRate', () => {
  it('allows exactly the limit and refuses the next one', () => {
    const now = 1_000_000;
    for (let i = 0; i < IP_BURST.limit; i += 1) {
      expect(checkRate('ip', now, [IP_BURST]).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(checkRate('ip', now, [IP_BURST]).allowed).toBe(false);
  });

  it('recovers once the window has passed', () => {
    const now = 1_000_000;
    for (let i = 0; i <= IP_BURST.limit; i += 1) checkRate('ip', now, [IP_BURST]);
    expect(checkRate('ip', now, [IP_BURST]).allowed).toBe(false);
    expect(checkRate('ip', now + IP_BURST.windowMs + 1, [IP_BURST]).allowed).toBe(true);
  });

  it('records rejected attempts too, so hammering does not shorten the wait', () => {
    const rule = { limit: 2, windowMs: 10_000 };

    // Both keys spend their two attempts at t=0.
    for (const key of ['hammer', 'patient']) {
      checkRate(key, 0, [rule]);
      checkRate(key, 0, [rule]);
    }
    // One of them keeps retrying while blocked.
    for (const at of [1_000, 1_001, 1_002]) checkRate('hammer', at, [rule]);

    // At t=10.5s the original two have aged out for both — but the retries
    // have not, and they were recorded.
    expect(checkRate('patient', 10_500, [rule]).allowed).toBe(true);
    expect(checkRate('hammer', 10_500, [rule]).allowed).toBe(false);
  });

  it('keeps keys independent', () => {
    const rule = { limit: 1, windowMs: 10_000 };
    expect(checkRate('a', 0, [rule]).allowed).toBe(true);
    expect(checkRate('b', 0, [rule]).allowed).toBe(true);
    expect(checkRate('a', 0, [rule]).allowed).toBe(false);
  });

  it('reports a retry-after that is inside the window', () => {
    const rule = { limit: 1, windowMs: 60_000 };
    checkRate('ip', 0, [rule]);
    const decision = checkRate('ip', 0, [rule]);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('applies the strictest rule that is breached', () => {
    const burst = { limit: 3, windowMs: 1_000 };
    const hourly = { limit: 5, windowMs: 3_600_000 };
    for (let i = 0; i < 3; i += 1) expect(checkRate('ip', 0, [burst, hourly]).allowed).toBe(true);
    expect(checkRate('ip', 0, [burst, hourly]).allowed).toBe(false);
    // The burst window passes, but the hourly count carries.
    expect(checkRate('ip', 2_000, [burst, hourly]).allowed).toBe(true);
    expect(checkRate('ip', 3_000, [burst, hourly]).allowed).toBe(false);
  });
});

/**
 * The peek/record/refund trio PR-42 added for the credential path. Covered
 * directly rather than only through the auth suite, because the next caller
 * will find them here.
 */
describe('peekRate / recordRate', () => {
  const NOW = 1_800_000_000_000;
  const RULE = { limit: 3, windowMs: 60_000 };

  beforeEach(() => __resetRateLimitForTests());

  it('agrees with checkRate on exactly which attempt is refused', () => {
    // `checkRate` records then asks `> limit`; `peekRate` asks `>= limit`
    // without recording. For the same sequence they must refuse the same one.
    const peeked: boolean[] = [];
    for (let attempt = 0; attempt < RULE.limit + 2; attempt += 1) {
      peeked.push(peekRate('peek', NOW, [RULE]).allowed);
      recordRate('peek', NOW, [RULE]);
    }

    const checked = Array.from(
      { length: RULE.limit + 2 },
      () => checkRate('check', NOW, [RULE]).allowed,
    );

    expect(peeked).toEqual(checked);
  });

  it('charges nothing when it only peeks', () => {
    for (let attempt = 0; attempt < RULE.limit * 3; attempt += 1) {
      expect(peekRate('quiet', NOW, [RULE]).allowed).toBe(true);
    }
  });

  it('reports how long the caller must wait', () => {
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) recordRate('wait', NOW, [RULE]);
    const decision = peekRate('wait', NOW, [RULE]);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(RULE.windowMs / 1000);
  });
});

describe('refundRate / clearRate', () => {
  const NOW = 1_800_000_000_000;
  const RULE = { limit: 2, windowMs: 60_000 };

  beforeEach(() => __resetRateLimitForTests());

  it('gives back exactly one attempt, not the whole key', () => {
    recordRate('refund', NOW, [RULE]);
    recordRate('refund', NOW, [RULE]);
    expect(peekRate('refund', NOW, [RULE]).allowed).toBe(false);

    refundRate('refund', NOW);
    expect(peekRate('refund', NOW, [RULE]).allowed).toBe(true);

    recordRate('refund', NOW, [RULE]);
    expect(peekRate('refund', NOW, [RULE]).allowed).toBe(false);
  });

  it('ignores a timestamp it never charged', () => {
    recordRate('refund', NOW, [RULE]);
    refundRate('refund', NOW + 1);
    refundRate('desconocida', NOW);

    recordRate('refund', NOW, [RULE]);
    expect(peekRate('refund', NOW, [RULE]).allowed).toBe(false);
  });

  it('clearRate forgets everything for that key alone', () => {
    recordRate('a', NOW, [RULE]);
    recordRate('a', NOW, [RULE]);
    recordRate('b', NOW, [RULE]);
    recordRate('b', NOW, [RULE]);

    clearRate('a');
    expect(peekRate('a', NOW, [RULE]).allowed).toBe(true);
    expect(peekRate('b', NOW, [RULE]).allowed).toBe(false);
  });
});

describe('the key map is bounded', () => {
  /**
   * The independent review of PR-23 (PR-46) found `MAX_KEYS` bounding nothing
   * under the one flood this tier exists to absorb. `sweep` only dropped keys
   * whose attempts had all aged out; with a rotating `x-forwarded-for` every
   * key is fresh, so nothing was evictable and the map grew without limit while
   * the comment claimed it could not.
   *
   * The cap is shrunk for these cases. Enforcing it costs a sweep per call once
   * the map is over, so demonstrating the real 5.000 takes ~8s — long enough
   * that the next reader deletes the test instead of waiting for it.
   */
  const CAP = 50;

  beforeEach(() => {
    __setMaxKeysForTests(CAP);
  });

  it('evicts live keys once the stale ones are gone', () => {
    const now = 1_000_000;
    // Every key is one millisecond old: nothing has aged out, so the
    // aged-out-only pass has nothing to reclaim.
    for (let i = 0; i < CAP * 4; i += 1) checkRate(`flood-${i}`, now);
    expect(keyCountForTests()).toBeLessThanOrEqual(CAP + 1);
  });

  it('evicts oldest-inserted first, so the newest attacker keys are the survivors', () => {
    // Not a property anybody wants, just the one that is cheap and terminating.
    // Stated so the next reader does not assume LRU.
    const now = 2_000_000;

    // Spend `victim`'s whole burst budget, so "allowed" below can only mean the
    // map forgot it — a key that was never charged is allowed either way, which
    // is what made the first version of this case assert nothing.
    for (let i = 0; i <= IP_BURST.limit; i += 1) checkRate('victim', now);
    expect(checkRate('victim', now).allowed, 'victim starts over its burst limit').toBe(false);

    for (let i = 0; i < CAP * 4; i += 1) checkRate(`ordered-${i}`, now);

    expect(checkRate('victim', now).allowed, 'the oldest insertion was evicted').toBe(true);

    // ...while a key inserted late in the flood is still counted. Same cap,
    // same flood: the difference is insertion order alone.
    const recent = `ordered-${CAP * 4 - 1}`;
    const before = keyCountForTests();
    checkRate(recent, now);
    expect(keyCountForTests(), 'a survivor is updated, not re-inserted').toBeLessThanOrEqual(
      before,
    );
  });

  it('holds the real cap by default, so the seam is not the contract', () => {
    __setMaxKeysForTests();
    for (let i = 0; i < 200; i += 1) checkRate(`few-${i}`, 3_000_000);
    expect(keyCountForTests(), 'nothing is evicted below MAX_KEYS').toBe(200);
  });
});
