import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_GRACE_DAYS, MAX_GRACE_DAYS, billingGraceDays } from './config';
import { renewalDigestBody } from './notify';
import {
  daysUntil,
  dueReminders,
  graceExpired,
  newlyPastDue,
  reminderKey,
  type RenewalSubscription,
} from './renewals';

const TODAY = '2026-08-12';

function sub(overrides: Partial<RenewalSubscription> = {}): RenewalSubscription {
  return {
    id: 1,
    institutionId: 7,
    institutionName: 'UC',
    planName: 'Verificado',
    status: 'active',
    startsOn: '2025-11-01',
    endsOn: '2026-10-31',
    invoiceRef: 'F001-0000123',
    ...overrides,
  };
}

describe('daysUntil', () => {
  it('counts whole days forward and backward', () => {
    expect(daysUntil('2026-08-12', TODAY)).toBe(0);
    expect(daysUntil('2026-08-19', TODAY)).toBe(7);
    expect(daysUntil('2026-08-05', TODAY)).toBe(-7);
  });

  it('is unaffected by month and year boundaries', () => {
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-03-01', '2026-02-28')).toBe(1);
  });
});

describe('dueReminders', () => {
  const empty = new Set<string>();

  it('sends nothing while the period is further out than the widest threshold', () => {
    expect(dueReminders([sub({ endsOn: '2026-12-31' })], TODAY, empty)).toHaveLength(0);
  });

  it('fires the 90-day notice the day the subscription enters the window', () => {
    const due = dueReminders([sub({ endsOn: '2026-11-10' })], TODAY, empty);
    expect(due).toHaveLength(1);
    expect(due[0]?.threshold).toBe(90);
  });

  /**
   * The property that matters most: a cron that did not run for a few days
   * must still send the notice, or a subscription silently never gets one.
   */
  it('catches up rather than skipping a threshold the cron slept through', () => {
    // 29 days out: the 30-day notice was never sent and is still due.
    const due = dueReminders([sub({ endsOn: '2026-09-10' })], TODAY, empty);
    expect(due[0]?.threshold).toBe(30);
  });

  it('sends only the narrowest unsent threshold, not one mail per threshold', () => {
    // 5 days out with nothing sent: the 7-day notice, and only that.
    const due = dueReminders([sub({ endsOn: '2026-08-17' })], TODAY, empty);
    expect(due).toHaveLength(1);
    expect(due[0]?.threshold).toBe(7);
  });

  it('is idempotent: a threshold already recorded is never due again', () => {
    const subscription = sub({ endsOn: '2026-11-10' });
    const sent = new Set([reminderKey(subscription.id, '2026-11-10', 90)]);
    expect(dueReminders([subscription], TODAY, sent)).toHaveLength(0);
  });

  /**
   * The defect the independent review of PR-29 (PR-46) found. `dueReminders`
   * used to walk *every* threshold the subscription was at or inside and fire
   * the first unsent one — so once the narrowest had been consumed, the next
   * run fired the next-widest. A subscription first seen five days out got
   * three mails on three consecutive days: "faltan 4 días" under the 30-day
   * heading, then "faltan 3 días" under the 90-day one.
   *
   * Normal operation (90 → 30 → 7 on schedule) never hits it, which is why the
   * single-run test above passed. This one walks the days.
   */
  it('sends ONE notice to a subscription first seen inside the narrowest window', () => {
    const subscription = sub({ endsOn: '2026-08-17' });
    const sent = new Set<string>();
    const fired: { day: string; threshold: number; daysLeft: number }[] = [];

    for (const day of ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16']) {
      for (const due of dueReminders([subscription], day, sent)) {
        fired.push({ day, threshold: due.threshold, daysLeft: due.daysLeft });
        sent.add(reminderKey(due.subscription.id, '2026-08-17', due.threshold));
      }
    }

    expect(fired).toEqual([{ day: '2026-08-12', threshold: 7, daysLeft: 5 }]);
  });

  it('never labels a notice with a threshold the period has already passed', () => {
    // The general form: whatever fires, its heading must still be true, on
    // every day of a full 90-day run.
    const subscription = sub({ endsOn: '2026-11-18' });
    const sent = new Set<string>();

    for (let offset = 0; offset < 100; offset += 1) {
      const day = new Date(Date.UTC(2026, 7, 12) + offset * 86_400_000).toISOString().slice(0, 10);
      for (const due of dueReminders([subscription], day, sent)) {
        expect(
          due.daysLeft,
          `${day}: "faltan ${due.daysLeft}" under a ${due.threshold}-day notice`,
        ).toBeLessThanOrEqual(due.threshold);
        sent.add(reminderKey(due.subscription.id, '2026-11-18', due.threshold));
      }
    }

    expect(sent.size, 'exactly the three thresholds, once each').toBe(3);
  });

  it('re-arms after a renewal, because the period end is part of the key', () => {
    const sent = new Set([reminderKey(1, '2026-10-31', 90)]);
    // Renewed: the row now ends a year later, and 90 days out from *that*.
    const renewed = sub({ endsOn: '2027-10-31' });
    expect(dueReminders([renewed], '2027-08-12', sent)).toHaveLength(1);
  });

  it('says nothing about a subscription that has already ended', () => {
    // "Renová en -12 días" is not a sentence anybody should receive; the
    // past-due sweep owns this row now.
    expect(dueReminders([sub({ endsOn: '2026-07-31' })], TODAY, empty)).toHaveLength(0);
  });

  it('ignores cancelled and open-ended subscriptions', () => {
    expect(
      dueReminders([sub({ status: 'cancelled', endsOn: '2026-08-20' })], TODAY, empty),
    ).toEqual([]);
    expect(dueReminders([sub({ endsOn: null })], TODAY, empty)).toEqual([]);
  });

  it('orders the digest by urgency', () => {
    const due = dueReminders(
      [
        sub({ id: 1, endsOn: '2026-11-01' }),
        sub({ id: 2, endsOn: '2026-08-15' }),
        sub({ id: 3, endsOn: '2026-09-05' }),
      ],
      TODAY,
      empty,
    );
    expect(due.map((entry) => entry.subscription.id)).toEqual([2, 3, 1]);
  });
});

describe('the past-due sweep', () => {
  it('marks an ended active subscription, and nothing else', () => {
    const rows = [
      sub({ id: 1, endsOn: '2026-08-11' }),
      sub({ id: 2, endsOn: '2026-08-12' }),
      sub({ id: 3, endsOn: '2026-08-11', status: 'past_due' }),
      sub({ id: 4, endsOn: '2026-08-11', status: 'cancelled' }),
      sub({ id: 5, endsOn: null }),
    ];
    expect(newlyPastDue(rows, TODAY).map((row) => row.id)).toEqual([1]);
  });

  it('includes a trial that ran out — a trial is a period like any other', () => {
    expect(
      newlyPastDue([sub({ status: 'trial', endsOn: '2026-08-01' })], TODAY).map((row) => row.id),
    ).toEqual([1]);
  });

  it('reports grace expiry only after the window has fully passed', () => {
    const rows = [sub({ status: 'past_due', endsOn: '2026-07-29' })];
    expect(graceExpired(rows, TODAY, 15)).toHaveLength(0); // 14 days out
    expect(graceExpired(rows, TODAY, 13)).toHaveLength(1);
  });
});

describe('billingGraceDays', () => {
  const original = process.env.BILLING_GRACE_DAYS;
  afterEach(() => {
    if (original === undefined) delete process.env.BILLING_GRACE_DAYS;
    else process.env.BILLING_GRACE_DAYS = original;
  });

  it('defaults when unset', () => {
    delete process.env.BILLING_GRACE_DAYS;
    expect(billingGraceDays()).toBe(DEFAULT_GRACE_DAYS);
  });

  it('reads an explicit value, including zero', () => {
    process.env.BILLING_GRACE_DAYS = '30';
    expect(billingGraceDays()).toBe(30);
    process.env.BILLING_GRACE_DAYS = '0';
    expect(billingGraceDays()).toBe(0);
  });

  it('falls back to the default on nonsense rather than to zero', () => {
    // A typo in an env var must not quietly cancel every paying institution's
    // features.
    process.env.BILLING_GRACE_DAYS = 'quince';
    expect(billingGraceDays()).toBe(DEFAULT_GRACE_DAYS);
    process.env.BILLING_GRACE_DAYS = '-5';
    expect(billingGraceDays()).toBe(DEFAULT_GRACE_DAYS);
  });

  it('caps an implausible value', () => {
    process.env.BILLING_GRACE_DAYS = '3650';
    expect(billingGraceDays()).toBe(MAX_GRACE_DAYS);
  });
});

describe('the digest body', () => {
  it('names the institution, the date, the days left and the invoice state', () => {
    const body = renewalDigestBody([
      { subscription: sub(), threshold: 90, daysLeft: 80 },
      {
        subscription: sub({ id: 2, institutionName: 'UNA', invoiceRef: null }),
        threshold: 30,
        daysLeft: 12,
      },
    ]);
    expect(body).toContain('UC');
    expect(body).toContain('2026-10-31');
    expect(body).toContain('faltan 80 días');
    expect(body).toContain('F001-0000123');
    expect(body).toContain('Sin referencia de factura cargada.');
  });
});
