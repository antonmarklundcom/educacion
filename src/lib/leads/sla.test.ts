/**
 * The SLA rule (PR-49). Every claim `sla.ts`'s docstring makes has a case here,
 * because the badge, the dashboard tone, the inbox banner and the daily digest
 * all read this one function — a silent change to it is a silent change to
 * four surfaces.
 */

import { describe, expect, it } from 'vitest';

import { LEAD_SLA_HOURS, countOverdueLeads, hoursWaiting, isLeadOverdue, slaCutoff } from './sla';
import type { LeadStatus } from './contract';

const NOW = new Date('2026-08-23T12:00:00Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function lead(status: LeadStatus, hours: number) {
  return { status, createdAt: hoursAgo(hours) };
}

describe('the threshold', () => {
  it('is 48 hours, which is what the copy beside it says', () => {
    expect(LEAD_SLA_HOURS).toBe(48);
  });
});

describe('isLeadOverdue', () => {
  it('flags a `new` lead at exactly 48 hours — the boundary is inclusive', () => {
    expect(isLeadOverdue(lead('new', 48), NOW)).toBe(true);
  });

  it('does not flag it one hour earlier', () => {
    expect(isLeadOverdue(lead('new', 47), NOW)).toBe(false);
  });

  it('flags it well past the threshold', () => {
    expect(isLeadOverdue(lead('new', 200), NOW)).toBe(true);
  });

  it.each<LeadStatus>(['sent', 'contacted', 'qualified', 'discarded'])(
    'never flags a lead in `%s`, however old — the clock is off once it is handled',
    (status) => {
      expect(isLeadOverdue(lead(status, 1000), NOW)).toBe(false);
    },
  );
});

describe('hoursWaiting', () => {
  it('floors to whole hours', () => {
    expect(hoursWaiting(new Date(NOW.getTime() - 90 * 60_000), NOW)).toBe(1);
  });

  it('clamps a future timestamp to zero rather than printing a negative wait', () => {
    expect(hoursWaiting(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(0);
  });
});

describe('slaCutoff', () => {
  it('is exactly the instant that makes `isLeadOverdue` true — one definition of 48 h', () => {
    const cutoff = slaCutoff(NOW);
    expect(isLeadOverdue({ status: 'new', createdAt: cutoff }, NOW)).toBe(true);
    expect(isLeadOverdue({ status: 'new', createdAt: new Date(cutoff.getTime() + 1) }, NOW)).toBe(
      false,
    );
  });

  it('is 48 hours before now', () => {
    expect(NOW.getTime() - slaCutoff(NOW).getTime()).toBe(LEAD_SLA_HOURS * 3_600_000);
  });
});

describe('countOverdueLeads', () => {
  it('counts only the overdue `new` ones', () => {
    expect(
      countOverdueLeads(
        [lead('new', 72), lead('new', 2), lead('contacted', 500), lead('new', 48)],
        NOW,
      ),
    ).toBe(2);
  });

  it('is zero for an empty inbox', () => {
    expect(countOverdueLeads([], NOW)).toBe(0);
  });
});
