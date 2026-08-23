/**
 * The nudge renders, or this goes red (PR-49).
 *
 * PR-48b's lesson, applied before the fact: a badge with no test can be deleted
 * without anything failing. Both surfaces here are the entire visible half of
 * the SLA feature — the query counts, this is what an institution actually
 * reads — so the assertions are on the emitted HTML.
 *
 * A string in the markup, not visibility: CSS is not applied here
 * (`architecture.md` §31.7).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LEAD_SLA_HOURS } from '@/lib/leads/sla';

import { LeadSlaBadge, LeadSlaBanner } from './LeadSla';

const NOW = new Date('2026-08-23T12:00:00Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function badge(status: 'new' | 'contacted', hours: number): string {
  return renderToStaticMarkup(
    createElement(LeadSlaBadge, { lead: { status, createdAt: hoursAgo(hours) }, now: NOW }),
  );
}

describe('LeadSlaBadge', () => {
  it('marks a lead that has waited past the threshold, with how long', () => {
    const html = badge('new', 72);
    expect(html).toContain('Sin responder');
    expect(html).toContain('hace 3 días');
  });

  it('renders nothing at all before the threshold', () => {
    expect(badge('new', LEAD_SLA_HOURS - 1)).toBe('');
  });

  it('renders nothing for a lead the institution already handled', () => {
    expect(badge('contacted', 500)).toBe('');
  });

  it('never prints a wait shorter than two days, because 48 h is two days', () => {
    expect(badge('new', LEAD_SLA_HOURS)).toContain('hace 2 días');
  });
});

describe('LeadSlaBanner', () => {
  it('states the count in the plural and links to the waiting ones', () => {
    const html = renderToStaticMarkup(createElement(LeadSlaBanner, { count: 4 }));
    expect(html).toContain('Hay 4 solicitudes sin responder desde hace más de 48 horas.');
    expect(html).toContain('/panel/leads?estado=new');
  });

  it('uses the singular for one', () => {
    const html = renderToStaticMarkup(createElement(LeadSlaBanner, { count: 1 }));
    expect(html).toContain('Hay 1 solicitud sin responder');
  });

  it('says nothing when nothing is late — no permanent scold in the inbox', () => {
    expect(renderToStaticMarkup(createElement(LeadSlaBanner, { count: 0 }))).toBe('');
  });
});
