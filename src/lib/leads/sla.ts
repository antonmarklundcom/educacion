/**
 * The lead response SLA — "this solicitud has been sitting in `new` too long"
 * as a pure function of `status` and `created_at` (PR-49).
 *
 * ### Why there is no column, no cron and no stored flag
 *
 * The status pipeline already exists (`new` → `sent` → `contacted` …), and
 * `created_at` is on every row. "Overdue" is therefore a *question about data
 * we already have*, not a fact anybody has to record: it is answered at render
 * time and it is right the instant the clock passes 48 h, with nothing having
 * run. A stored `is_overdue` flag would need a job to set it, would be wrong
 * between the job's ticks, and would be a second thing to keep in step with a
 * status change. `pr-plan.md` PR-49 states the constraint outright — derived at
 * render, no new cron, no schema change — and this module is where that
 * derivation lives so that the inbox, the dashboard and the daily digest are
 * three readers of one rule rather than three copies of `48 * 3_600_000`.
 *
 * ### Why only `new`
 *
 * `new` means nobody has touched it. `sent` is the delivery mail having gone
 * out, which is *our* side of the pipeline and says nothing about whether the
 * institution replied — but it is also not a state the institution sets, so
 * flagging it would nag about something they cannot clear from the panel.
 * `contacted`, `qualified` and `discarded` are all deliberate acts: the
 * institution has dealt with the lead, and the clock is off. So the flag marks
 * exactly the leads whose only cure is the institution opening one and acting,
 * which is the whole point of a nudge.
 *
 * ### Why 48 hours
 *
 * `plan.md`'s pitch to an institution is that a solicitud is a person who is
 * choosing a carrera this month; two working days is the point past which the
 * chance of a reply mattering is visibly falling and the institution has no
 * excuse it would recognise as one. It is not a contractual SLA — nothing is
 * refunded, nothing is escalated, and the word "SLA" never reaches the UI.
 */

import type { LeadStatus } from './contract';

/** Hours a lead may sit in `new` before the panel says so. */
export const LEAD_SLA_HOURS = 48;

const HOUR_MS = 3_600_000;

/** The status a lead has to still be in for the clock to be running. */
export const SLA_TRACKED_STATUS: LeadStatus = 'new';

/** Just enough of a lead to answer the question. Any row shape satisfies it. */
export interface LeadSlaFacts {
  status: LeadStatus;
  createdAt: Date;
}

/**
 * Whole hours the lead has been waiting, floored, never negative.
 *
 * Clamped at zero because a clock skew between the database and the web
 * process must not produce "hace -1 horas" on a page an institution reads.
 */
export function hoursWaiting(createdAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / HOUR_MS));
}

/**
 * Whether this lead is past the SLA **right now**.
 *
 * The boundary is inclusive: at exactly 48 h the lead is overdue. An exclusive
 * boundary would make the first flagged hour the 49th, which is not what the
 * copy beside it says.
 */
export function isLeadOverdue(lead: LeadSlaFacts, now: Date = new Date()): boolean {
  if (lead.status !== SLA_TRACKED_STATUS) return false;
  return hoursWaiting(lead.createdAt, now) >= LEAD_SLA_HOURS;
}

/**
 * The instant a lead must have arrived *before* to be overdue now — the same
 * rule expressed as a cutoff, for the SQL that counts them.
 *
 * Derived from `LEAD_SLA_HOURS` rather than restated, so the query and the
 * badge can never disagree about what 48 hours means.
 */
export function slaCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - LEAD_SLA_HOURS * HOUR_MS);
}

/** How many of these are overdue. The inbox banner's number. */
export function countOverdueLeads(leads: readonly LeadSlaFacts[], now: Date = new Date()): number {
  return leads.filter((lead) => isLeadOverdue(lead, now)).length;
}
