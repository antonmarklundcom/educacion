import { beforeEach, describe, expect, it } from 'vitest';

import { IP_BURST, __resetRateLimitForTests, checkRate } from './rate-limit';

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
