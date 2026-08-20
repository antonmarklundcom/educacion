/**
 * A crash loop must not eat the shared Sentry quota (PR-45).
 *
 * The free tier is one quota across this site and the operator's others, so a
 * page that throws on every request — a bad deploy, a database that has stopped
 * answering, a cron hitting a 500 every minute — can spend a month's events in
 * an afternoon and take the *other* sites' visibility down with it. That is the
 * failure this exists to prevent: not "too many events", but "the one event
 * that mattered was dropped because a loop had already filled the bucket".
 *
 * ### Per fingerprint, not global
 *
 * A global cap has the same problem it is trying to fix: one loud error starves
 * every quiet one. The bucket is keyed on what makes two events *the same
 * error* — its type and the top of its stack — so a loop is capped while a
 * genuinely new exception on the same minute goes straight through.
 *
 * ### It reports what it dropped
 *
 * The first event past the cap is still sent, with `throttled: true` and the
 * count so far, so the dashboard says "this happened 400 times" rather than
 * quietly showing 5. Silence about suppression is how a rate limiter turns into
 * a bug that hides bugs.
 *
 * Pure and clock-injectable, so `throttle.test.ts` needs neither the SDK nor a
 * real minute.
 */

/** Events per key per window before suppression starts. */
export const THROTTLE_MAX_EVENTS = 5;
/** The window, in milliseconds. */
export const THROTTLE_WINDOW_MS = 60_000;
/**
 * How many distinct keys the map may hold. A bound, not a tuning knob: the key
 * is derived from a stack frame, so a loop through generated code could
 * otherwise grow it without limit inside a long-lived server process.
 */
export const THROTTLE_MAX_KEYS = 500;

export interface ThrottleDecision {
  send: boolean;
  /** How many events this key has seen in the current window, including this one. */
  count: number;
  /** True on the event that announces the suppression — the last one sent. */
  announcing: boolean;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

export class EventThrottle {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxEvents = THROTTLE_MAX_EVENTS,
    private readonly windowMs = THROTTLE_WINDOW_MS,
    private readonly maxKeys = THROTTLE_MAX_KEYS,
  ) {}

  decide(key: string, now: number): ThrottleDecision {
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStartedAt >= this.windowMs) {
      this.evictIfFull(now);
      this.buckets.set(key, { count: 1, windowStartedAt: now });
      return { send: true, count: 1, announcing: false };
    }

    bucket.count += 1;
    if (bucket.count < this.maxEvents) {
      return { send: true, count: bucket.count, announcing: false };
    }
    if (bucket.count === this.maxEvents) {
      // The last one through, carrying the news that the rest are suppressed.
      return { send: true, count: bucket.count, announcing: true };
    }
    return { send: false, count: bucket.count, announcing: false };
  }

  /** Test/diagnostic seam. Never called by the `beforeSend` path. */
  size(): number {
    return this.buckets.size;
  }

  private evictIfFull(now: number): void {
    if (this.buckets.size < this.maxKeys) return;
    // Expired windows first — they cost nothing to lose.
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= this.windowMs) this.buckets.delete(key);
    }
    // Still full: drop the oldest insertion. A `Map` iterates in insertion
    // order, so this is the least recently *created* bucket.
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) break;
      this.buckets.delete(oldest.value);
    }
  }
}

/**
 * What makes two events "the same error".
 *
 * The exception type plus the topmost frame Sentry recorded. Not the message:
 * a message routinely carries an id (`No se encontró la oferta 4821`), so
 * keying on it would give every iteration of a loop its own bucket and the
 * throttle would never engage — which is the bug this function's shape exists
 * to avoid.
 */
export interface ThrottleableEvent {
  exception?: {
    values?: {
      type?: string;
      stacktrace?: { frames?: { filename?: string; lineno?: number }[] };
    }[];
  };
  message?: string;
  transaction?: string;
}

export function throttleKey(event: ThrottleableEvent): string {
  const value = event.exception?.values?.[0];
  const frames = value?.stacktrace?.frames;
  const top = frames?.[frames.length - 1];
  return [
    value?.type ?? (event.message ? 'message' : 'unknown'),
    top?.filename ?? event.transaction ?? '',
    top?.lineno ?? '',
  ].join('|');
}
