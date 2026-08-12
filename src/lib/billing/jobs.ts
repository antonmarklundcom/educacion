/**
 * The two billing cron jobs (PR-29), both idempotent, both safe to fire twice.
 *
 * - `subscription-sweep` moves ended `active`/`trial` rows to `past_due`,
 *   which is what starts the grace window. Running it twice finds nothing the
 *   second time, because the rows it would act on are no longer `active`.
 * - `renewal-reminders` sends one digest of everything that has crossed a
 *   90/30/7 threshold and has not been reported for this period, then records
 *   each one against the UNIQUE key that makes the next run a no-op.
 *
 * **The order matters and is fixed here**: the sweep runs first, so a
 * subscription that ended overnight is `past_due` before the digest describes
 * the day's state. Reversing them would produce a digest that disagrees with
 * `/admin/facturacion` for as long as it took the operator to open it.
 */

import {
  listRenewalSubscriptions,
  markPastDue,
  recordReminderSent,
  sentReminderKeys,
} from '@/db/queries/billing';
import { billingGraceDays } from './config';
import { sendRenewalDigest } from './notify';
import { dueReminders, graceExpired, newlyPastDue } from './renewals';

export interface BillingSweepResult {
  markedPastDue: number;
  graceExpired: number;
  graceDays: number;
}

/** `GET /api/cron/subscription-sweep`. */
export async function runSubscriptionSweep(now: Date = new Date()): Promise<BillingSweepResult> {
  const today = now.toISOString().slice(0, 10);
  const graceDays = billingGraceDays();
  const subscriptions = await listRenewalSubscriptions();

  const toMark = newlyPastDue(subscriptions, today);
  const marked = await markPastDue(toMark.map((subscription) => subscription.id));

  return {
    markedPastDue: marked,
    // Reported, never acted on: a subscription whose grace has run out already
    // grants nothing (`resolveEntitlements` stops counting it), and cancelling
    // it is a decision about a commercial relationship that a cron does not
    // get to make.
    graceExpired: graceExpired(subscriptions, today, graceDays).length,
    graceDays,
  };
}

export interface ReminderResult {
  due: number;
  sent: boolean;
  reason?: string;
  recorded: number;
}

/** `GET /api/cron/renewal-reminders`. */
export async function runRenewalReminders(now: Date = new Date()): Promise<ReminderResult> {
  const today = now.toISOString().slice(0, 10);

  const [subscriptions, alreadySent] = await Promise.all([
    listRenewalSubscriptions(),
    sentReminderKeys(),
  ]);

  const due = dueReminders(subscriptions, today, alreadySent);
  if (due.length === 0) return { due: 0, sent: false, reason: 'nothing_due', recorded: 0 };

  const result = await sendRenewalDigest(due);

  // Recorded only when the mail actually left. The other order would mark a
  // notice sent that never went, and a renewal notice nobody received is the
  // failure this whole job exists to prevent; a duplicate is the cheaper
  // mistake.
  let recorded = 0;
  if (result.sent) {
    for (const reminder of due) {
      await recordReminderSent(
        reminder.subscription.id,
        reminder.subscription.endsOn!,
        reminder.threshold,
      );
      recorded += 1;
    }
  }

  return { due: due.length, sent: result.sent, reason: result.reason, recorded };
}
