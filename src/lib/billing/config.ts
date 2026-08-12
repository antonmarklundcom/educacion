/**
 * The two numbers billing operations are configured by (PR-29).
 *
 * Both are read from the environment on every call rather than captured at
 * import time: changing a grace period on a live site should be an env change
 * and a restart, not a redeploy, and a module-level constant would silently
 * keep the old value in a warm process.
 */

/** Days before `ends_on` that a renewal notice goes out. Order is descending. */
export const REMINDER_THRESHOLDS = [90, 30, 7] as const;

export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

/** What `BILLING_GRACE_DAYS` defaults to when it is not set. */
export const DEFAULT_GRACE_DAYS = 15;

/** Anything beyond this is almost certainly a typo, and it would be free service. */
export const MAX_GRACE_DAYS = 90;

/**
 * How long a `past_due` subscription keeps its features after its period ends.
 *
 * PR-25 shipped this as the constant `0` and said PR-29 would make it
 * configurable; this is that. The default is 15 days because the payment path
 * is a bank transfer and a factura issued by hand (`monetization.md` §5) — a
 * university's finance department does not clear an invoice the same week, and
 * switching a paying customer's badge off over a slow transferencia is a way
 * to lose a renewal we had already won.
 *
 * An unparseable or negative value falls back to the default rather than to 0:
 * a misconfigured environment variable should not quietly cancel every paying
 * institution's features.
 */
export function billingGraceDays(): number {
  const raw = process.env.BILLING_GRACE_DAYS;
  if (raw == null || raw.trim() === '') return DEFAULT_GRACE_DAYS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    console.warn(
      `[billing] BILLING_GRACE_DAYS="${raw}" is not a non-negative integer; using ${DEFAULT_GRACE_DAYS}.`,
    );
    return DEFAULT_GRACE_DAYS;
  }
  return Math.min(value, MAX_GRACE_DAYS);
}
