/**
 * Which renewal notices are due today, and which subscriptions have run out —
 * both as pure functions (PR-29).
 *
 * ### Why "at or below the threshold", not "exactly on the day"
 *
 * The obvious rule is "fire the 30-day notice when `ends_on - today === 30`".
 * It is also the rule that silently drops a notice whenever the cron does not
 * run on that exact day — a Hostinger restart, a deploy, an hPanel cron that
 * skipped. A subscription would then simply never get its 30-day warning, and
 * nobody would find out until the renewal was missed.
 *
 * So a threshold is **due once the subscription is at or inside it** and the
 * notice for that threshold has not been sent for this period. A cron that
 * missed three days catches up on the fourth; a cron that runs hourly sends
 * nothing extra, because the sent-record is what stops it, not the calendar.
 *
 * ### Idempotency is a unique key, not a flag
 *
 * `subscription_reminders (subscription_id, period_ends_on, threshold_days)` is
 * UNIQUE. Sending is "insert the row"; a second run inserts nothing. Because
 * `period_ends_on` is part of the key, **renewing re-arms the notices**: a new
 * period is a new set of 90/30/7.
 */

import { REMINDER_THRESHOLDS, type ReminderThreshold } from './config';

export interface RenewalSubscription {
  id: number;
  institutionId: number;
  institutionName: string;
  planName: string;
  status: 'trial' | 'active' | 'past_due' | 'cancelled';
  startsOn: string;
  endsOn: string | null;
  invoiceRef: string | null;
}

/** `YYYY-MM-DD` difference in whole days: `endsOn - today`. Negative = past. */
export function daysUntil(endsOn: string, today: string): number {
  const end = Date.parse(`${endsOn}T00:00:00.000Z`);
  const now = Date.parse(`${today}T00:00:00.000Z`);
  return Math.round((end - now) / 86_400_000);
}

export interface DueReminder {
  subscription: RenewalSubscription;
  threshold: ReminderThreshold;
  daysLeft: number;
}

/**
 * The reminders to send now.
 *
 * `alreadySent` is the set of `${subscriptionId}:${endsOn}:${threshold}` keys
 * already in `subscription_reminders`. Only the **narrowest** unsent threshold
 * fires per subscription per run: an account that is 5 days out and has never
 * been reminded needs the 7-day notice, not three emails.
 */
export function dueReminders(
  subscriptions: readonly RenewalSubscription[],
  today: string,
  alreadySent: ReadonlySet<string>,
): DueReminder[] {
  const due: DueReminder[] = [];

  for (const subscription of subscriptions) {
    // A cancelled subscription is not renewed, it is re-sold; an open-ended one
    // has no date to count down to. Neither is a reminder.
    if (subscription.endsOn == null) continue;
    if (subscription.status === 'cancelled') continue;

    const daysLeft = daysUntil(subscription.endsOn, today);
    // Past the end date the reminder stops and the past-due sweep takes over —
    // "renová en -12 días" is not a sentence anybody should receive.
    if (daysLeft < 0) continue;

    // **The narrowest applicable threshold, and only that one.** Not "the
    // narrowest unsent one": the independent review of PR-29 (PR-46) found that
    // walking the candidate list produced a *widening* sequence on consecutive
    // days — a subscription first seen five days out got the 7-day notice, then
    // "faltan 4 días" under the 30-day heading, then "faltan 3 días" under the
    // 90-day one. Three mails for one renewal, each labelled nonsensically, and
    // exactly in the situation the catch-up design exists for: a plan sold or
    // renewed inside 90 days, or a cron that slept through a threshold.
    //
    // Once a period is inside 7 days, the 7-day notice is the only one that
    // still means anything, so a threshold that has already been overtaken is
    // not a reminder waiting to be sent — it is a reminder that no longer
    // applies.
    const threshold = [...REMINDER_THRESHOLDS]
      .filter((candidate) => daysLeft <= candidate)
      .sort((a, b) => a - b)[0];
    if (threshold == null) continue;
    if (alreadySent.has(reminderKey(subscription.id, subscription.endsOn, threshold))) continue;

    due.push({ subscription, threshold, daysLeft });
  }

  return due.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function reminderKey(
  subscriptionId: number,
  periodEndsOn: string,
  threshold: number,
): string {
  return `${subscriptionId}:${periodEndsOn}:${threshold}`;
}

/**
 * Subscriptions whose period has ended while still marked `active` or `trial`.
 *
 * Flipping them to `past_due` is what *starts* the grace window: entitlements
 * already stop dead at `ends_on` for an `active` row, and a `past_due` row is
 * the one that keeps its features for `BILLING_GRACE_DAYS` afterwards. So a
 * sweep that fails to run can only ever **under**-grant — the customer loses
 * the grace they were owed, never keeps features they were not. That is the
 * safe direction for a job on a shared host, and it is why the sweep is not
 * load-bearing for correctness.
 */
export function newlyPastDue(
  subscriptions: readonly RenewalSubscription[],
  today: string,
): RenewalSubscription[] {
  return subscriptions.filter(
    (subscription) =>
      subscription.endsOn != null &&
      (subscription.status === 'active' || subscription.status === 'trial') &&
      daysUntil(subscription.endsOn, today) < 0,
  );
}

/**
 * `past_due` subscriptions whose grace has run out — they now grant nothing,
 * and the admin list says so. Nothing is written for them: the status is
 * already correct and `resolveEntitlements` has stopped counting them on its
 * own. Cancelling is a human decision about a commercial relationship, and a
 * cron does not get to make it.
 */
export function graceExpired(
  subscriptions: readonly RenewalSubscription[],
  today: string,
  graceDays: number,
): RenewalSubscription[] {
  return subscriptions.filter(
    (subscription) =>
      subscription.status === 'past_due' &&
      subscription.endsOn != null &&
      daysUntil(subscription.endsOn, today) < -graceDays,
  );
}
