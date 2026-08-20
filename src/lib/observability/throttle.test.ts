import { describe, expect, it } from 'vitest';

import { EventThrottle, THROTTLE_MAX_EVENTS, THROTTLE_WINDOW_MS, throttleKey } from './throttle';

const T0 = 1_000_000;

describe('EventThrottle', () => {
  it('lets the first events through and suppresses the rest of the window', () => {
    const throttle = new EventThrottle();
    const sent: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      if (throttle.decide('boom', T0 + i).send) sent.push(i);
    }
    expect(sent).toHaveLength(THROTTLE_MAX_EVENTS);
  });

  it('announces the suppression on the last event it sends', () => {
    const throttle = new EventThrottle();
    const decisions = Array.from({ length: 10 }, (_, i) => throttle.decide('boom', T0 + i));
    const announcing = decisions.filter((d) => d.announcing);
    expect(announcing).toHaveLength(1);
    expect(announcing[0].send, 'the announcement has to be sent to be an announcement').toBe(true);
    expect(decisions[decisions.length - 1].count).toBe(10);
  });

  it('does not let one loud error starve a quiet one', () => {
    // The reason the bucket is per key. A global cap has the same problem it is
    // meant to fix.
    const throttle = new EventThrottle();
    for (let i = 0; i < 100; i += 1) throttle.decide('loop', T0 + i);
    expect(throttle.decide('something-else', T0 + 100).send).toBe(true);
  });

  it('opens a new window once the old one has passed', () => {
    const throttle = new EventThrottle();
    for (let i = 0; i < 100; i += 1) throttle.decide('boom', T0 + i);
    expect(throttle.decide('boom', T0 + 500).send).toBe(false);
    expect(throttle.decide('boom', T0 + THROTTLE_WINDOW_MS).send).toBe(true);
  });

  it('counts every event, including the suppressed ones', () => {
    const throttle = new EventThrottle();
    let last = throttle.decide('boom', T0);
    for (let i = 1; i < 400; i += 1) last = throttle.decide('boom', T0 + i);
    expect(last.count).toBe(400);
  });

  it('is bounded, so a long-lived process cannot grow it without limit', () => {
    const throttle = new EventThrottle(5, 60_000, 10);
    for (let i = 0; i < 1_000; i += 1) throttle.decide(`key-${i}`, T0);
    expect(throttle.size()).toBeLessThanOrEqual(10);
  });

  it('drops expired buckets before it drops live ones', () => {
    // Insertion order and expiry have to *disagree*, or the plain
    // oldest-inserted eviction satisfies the assertion on its own and the
    // expired-first pass could be deleted with the test still green — which the
    // independent review demonstrated against the first version of this case.
    // So `live` is the OLDEST insertion and the only unexpired bucket.
    const throttle = new EventThrottle(5, 60_000, 4);
    throttle.decide('live', T0); //  position 0 — the oldest insertion
    throttle.decide('old-a', T0 + 1);
    throttle.decide('old-b', T0 + 2);

    // A minute later only `live` is still being hit. Its window restarts; its
    // position in the map does not, so it is still the oldest *insertion*.
    throttle.decide('live', T0 + 61_000);
    throttle.decide('d', T0 + 61_001);

    // The fifth key forces an eviction. Expired-first must reclaim `old-a` and
    // `old-b`; plain oldest-insertion would take `live` and lose its count.
    throttle.decide('e', T0 + 61_002);

    expect(throttle.decide('live', T0 + 61_003).count, 'live kept its count').toBe(2);
  });

  it('takes its limits from the constructor, so the constants are not the contract', () => {
    const throttle = new EventThrottle(2, 1_000);
    expect(throttle.decide('k', T0).send).toBe(true);
    expect(throttle.decide('k', T0 + 1).send).toBe(true);
    expect(throttle.decide('k', T0 + 2).send).toBe(false);
  });
});

describe('throttleKey', () => {
  const frame = { filename: 'src/db/queries/program-search.ts', lineno: 312 };

  it('gives two iterations of the same crash the same key', () => {
    const a = { exception: { values: [{ type: 'Error', stacktrace: { frames: [frame] } }] } };
    const b = { exception: { values: [{ type: 'Error', stacktrace: { frames: [frame] } }] } };
    expect(throttleKey(a)).toBe(throttleKey(b));
  });

  it('ignores the message, which routinely carries an id', () => {
    // `No se encontró la oferta 4821` — keying on the message would give every
    // iteration of a loop its own bucket and the throttle would never engage.
    const withId = (id: number) => ({
      message: `No se encontró la oferta ${id}`,
      exception: { values: [{ type: 'Error', stacktrace: { frames: [frame] } }] },
    });
    expect(throttleKey(withId(1))).toBe(throttleKey(withId(2)));
  });

  it('separates two different exception types at the same line', () => {
    const at = (type: string) => ({
      exception: { values: [{ type, stacktrace: { frames: [frame] } }] },
    });
    expect(throttleKey(at('TypeError'))).not.toBe(throttleKey(at('RangeError')));
  });

  it('separates two lines in the same file', () => {
    const at = (lineno: number) => ({
      exception: { values: [{ type: 'Error', stacktrace: { frames: [{ ...frame, lineno }] } }] },
    });
    expect(throttleKey(at(10))).not.toBe(throttleKey(at(11)));
  });

  it('falls back to the transaction for an event with no stack', () => {
    expect(throttleKey({ message: 'algo', transaction: '/carreras' })).not.toBe(
      throttleKey({ message: 'algo', transaction: '/universidades' }),
    );
  });

  it('does not throw on an event with nothing on it', () => {
    expect(() => throttleKey({})).not.toThrow();
    expect(throttleKey({})).toContain('unknown');
  });
});
