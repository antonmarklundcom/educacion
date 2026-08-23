/**
 * The two SLA surfaces in `/panel/leads` (PR-49), as components rather than
 * inline JSX — because PR-48b's review found that a nudge with no seam is a
 * nudge with no test: deleting `PriceLabel`'s stale badge left 1231 tests
 * green. These two have `LeadSla.test.tsx` and it goes red if either stops
 * rendering.
 *
 * Both are server components and both compute the flag themselves from
 * `lib/leads/sla`, so there is no "is overdue" boolean travelling through props
 * that a caller could compute differently from the query that counted them.
 *
 * `now` is passed in rather than read here: one clock per render, so a badge
 * and the banner counting it cannot be measured milliseconds apart and
 * disagree on a lead sitting exactly on 48 h.
 */

import Link from 'next/link';

import { Badge } from '@/components/ui';
import { panelCopy } from '@/lib/copy/panel';
import { hoursWaiting, isLeadOverdue, type LeadSlaFacts } from '@/lib/leads/sla';

/** The badge on one inbox row. Renders nothing for a lead that is not late. */
export function LeadSlaBadge({ lead, now }: { lead: LeadSlaFacts; now: Date }) {
  if (!isLeadOverdue(lead, now)) return null;
  const days = Math.floor(hoursWaiting(lead.createdAt, now) / 24);
  return (
    <Badge tone="danger">
      {panelCopy.leadSla.badge} {panelCopy.leadSla.waitingDays(days)}
    </Badge>
  );
}

/**
 * The banner above the inbox. `count` is the institution's whole overdue set,
 * not this page's or this tab's — the link goes to the `new` tab so the
 * sentence and the list the institution lands on agree.
 */
export function LeadSlaBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <section className="border-danger/40 bg-warn-bg flex flex-col gap-2 rounded-md border px-4 py-3">
      <h2 className="text-ink text-sm font-semibold">{panelCopy.leadSla.bannerHeading}</h2>
      <p className="text-body max-w-prose text-sm">
        {count === 1 ? panelCopy.leadSla.bannerOne : panelCopy.leadSla.bannerMany(count)}{' '}
        {panelCopy.leadSla.bannerBody}
      </p>
      <Link
        href="/panel/leads?estado=new"
        className="text-ink self-start text-sm font-medium underline underline-offset-4"
      >
        {panelCopy.leadSla.bannerAction}
      </Link>
    </section>
  );
}
