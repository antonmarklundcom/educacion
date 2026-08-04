/**
 * The in-process tier of the two-tier rate limit (`architecture.md` §6.1).
 *
 * ### Why this exists next to a durable limit
 *
 * The durable quota is derived from the `leads` table — "how many rows carry
 * this phone in the last 24 h" — which is exact, survives a redeploy and stays
 * correct if the app ever runs behind more than one process. What it cannot see
 * is an attempt that never became a row: a honeypot hit, a hundred malformed
 * payloads a second, a script probing for a validation oracle. Those are what a
 * flood looks like, and stopping them before the database is the whole job of
 * this file.
 *
 * ### Why a sliding window and not a token bucket
 *
 * A bucket needs a refill rate, which is a second number to tune. A window of
 * timestamps answers the only question asked here — "how many attempts from
 * this key in the last N seconds" — directly, and at these limits the array per
 * key is a handful of numbers.
 *
 * ### What it costs, stated plainly
 *
 * It is per-process and per-boot. Hostinger restarts the app on deploy and on
 * idle recycling, so this tier is genuinely defeated by waiting; the durable
 * tier is what holds after a restart. The map is swept opportunistically rather
 * than on a timer, so an idle process holds no cleanup work.
 */

export interface RateLimitRule {
  /** Attempts allowed inside the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the oldest attempt in the window expires. `Retry-After`. */
  retryAfterSeconds: number;
}

/**
 * 8 attempts per minute and 30 per hour from one hashed IP.
 *
 * The minute rule is the flood stop. The hour rule is what a human genuinely
 * comparing several universities from one phone will never reach — three or
 * four solicitudes in a sitting is normal behaviour and must not be punished.
 */
export const IP_BURST: RateLimitRule = { limit: 8, windowMs: 60_000 };
export const IP_HOURLY: RateLimitRule = { limit: 30, windowMs: 3_600_000 };

/** Bound on distinct keys held, so a rotating-IP flood cannot grow the heap. */
const MAX_KEYS = 5_000;

const hits = new Map<string, number[]>();

function prune(timestamps: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  // Timestamps are appended in order, so the survivors are always a suffix.
  let start = 0;
  while (start < timestamps.length && timestamps[start] <= cutoff) start += 1;
  return start === 0 ? timestamps : timestamps.slice(start);
}

function sweep(now: number): void {
  for (const [key, timestamps] of hits) {
    if (prune(timestamps, now, IP_HOURLY.windowMs).length === 0) hits.delete(key);
    if (hits.size <= MAX_KEYS) return;
  }
}

/**
 * Records an attempt and says whether it is allowed. Both rules are evaluated
 * against the same timestamp list, so one call covers the burst and the hourly
 * limit.
 *
 * A rejected attempt is still recorded: a caller that is over the limit and
 * keeps trying should not reset its own window by failing.
 */
export function checkRate(
  key: string,
  now: number = Date.now(),
  rules: RateLimitRule[] = [IP_BURST, IP_HOURLY],
): RateLimitDecision {
  const longest = Math.max(...rules.map((rule) => rule.windowMs));
  const timestamps = prune(hits.get(key) ?? [], now, longest);
  timestamps.push(now);
  hits.set(key, timestamps);

  if (hits.size > MAX_KEYS) sweep(now);

  for (const rule of rules) {
    const inWindow = timestamps.filter((at) => at > now - rule.windowMs);
    if (inWindow.length > rule.limit) {
      const oldest = inWindow[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
      };
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam. Never called by application code. */
export function __resetRateLimitForTests(): void {
  hits.clear();
}
