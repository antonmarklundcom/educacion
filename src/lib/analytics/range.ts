/**
 * The date range the stats views read.
 *
 * Pure, and in one place, because two views will ask the same question: PR-28's
 * institution dashboard is `/admin/stats` scoped to one institution, and the
 * two must not disagree about what "los últimos 30 días" means.
 *
 * **UTC, always.** The session hash buckets its day in UTC
 * (`architecture.md` §6.4) and `events.created_at` is stored UTC
 * (`data-model.md` §3). Reading the range in `America/Asuncion` would put the
 * boundary of a day-bucket four hours away from the boundary the hash used, and
 * the two numbers on the same page would quietly disagree. The label is
 * Spanish; the arithmetic is UTC.
 */

import type { EventRange } from '@/db/queries/events';

export const RANGE_DAYS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

export const DEFAULT_RANGE_DAYS: RangeDays = 30;

/** Public URL param, Spanish like the rest of them. */
export const RANGE_PARAM = 'dias';

export const RANGE_LABELS: Record<RangeDays, string> = {
  7: 'Últimos 7 días',
  30: 'Últimos 30 días',
  90: 'Últimos 90 días',
};

export function parseRangeDays(raw: string | string[] | undefined): RangeDays {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (RANGE_DAYS as readonly number[]).includes(value)
    ? (value as RangeDays)
    : DEFAULT_RANGE_DAYS;
}

/**
 * `since` is midnight UTC `days - 1` days back, `until` is midnight UTC
 * tomorrow — half-open, so today is included whole and no row lands in two
 * buckets. "7 days" therefore means seven day-buckets including today, which is
 * what a person means by it.
 */
export function toRange(days: RangeDays, now: Date = new Date()): EventRange {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    since: new Date(startOfToday - (days - 1) * dayMs),
    until: new Date(startOfToday + dayMs),
  };
}

/**
 * Fills the days the query did not return. The query layer refuses to invent a
 * zero (`countEventsByDay`); here the caller knows the range it asked for, so a
 * missing day is a measured zero rather than a guess.
 */
export function fillDays(
  range: EventRange,
  counts: { day: string; events: number }[],
): { day: string; events: number }[] {
  const found = new Map(counts.map((row) => [row.day, row.events]));
  const filled: { day: string; events: number }[] = [];

  for (let at = range.since.getTime(); at < range.until.getTime(); at += 24 * 60 * 60 * 1000) {
    const day = new Date(at).toISOString().slice(0, 10);
    filled.push({ day, events: found.get(day) ?? 0 });
  }
  return filled;
}
