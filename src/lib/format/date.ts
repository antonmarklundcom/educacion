const longDate = new Intl.DateTimeFormat('es-PY', { dateStyle: 'long' });
const monthYear = new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric' });

/** "2 de agosto de 2026" */
export function formatDate(date: Date | string): string {
  return longDate.format(typeof date === 'string' ? new Date(date) : date);
}

/** "agosto de 2026" — used in "Actualizado: {mes año}" per docs/seo.md §3. */
export function formatMonthYear(date: Date | string): string {
  return monthYear.format(typeof date === 'string' ? new Date(date) : date);
}

/**
 * Paraguay's UTC offset, as a fixed string.
 *
 * Paraguay abolished daylight saving in 2024 (Decreto 2013/2024) and has been
 * permanently on **UTC−03:00** since; before that it alternated between −03:00
 * and −04:00. Nothing on this site reasons about a date before 2024, so a
 * constant offset is correct rather than convenient — and stating it as a
 * constant with this comment beside it is what stops the next reader from
 * "fixing" it into a DST calculation that no longer applies.
 */
export const ASUNCION_UTC_OFFSET = '-03:00';

/**
 * `YYYY-MM-DD` as typed by somebody in Asunción → the instant that day starts
 * there.
 *
 * Timestamps are stored UTC (`deployment.md` §3) and rendered
 * `America/Asuncion`, so a date filter parsed as UTC midnight is three hours
 * off from the day the operator can see: an entry shown as 20/08 22:30 is
 * stored 21/08 01:30Z, and "hasta el 20" would drop it. Anything that is not a
 * plain date returns `undefined` — a filter we cannot read is no filter, never
 * a guessed one.
 */
export function parseAsuncionDay(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000${ASUNCION_UTC_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** One day later — the exclusive upper bound of `[day, day+1)` in Asunción. */
export function nextAsuncionDay(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Today's date **in Asunción**, as `YYYY-MM-DD`.
 *
 * The site stores timestamps in UTC and renders them `America/Asuncion`, so
 * `new Date().toISOString().slice(0, 10)` is the wrong day for the last three
 * hours of every Paraguayan evening. That matters wherever a *date column* is
 * compared against "today": the independent review of PR-29 (PR-46) found a
 * subscription losing its badge, its lead contacts and its placement at 21:00
 * on its final day, because `ends_on` was being compared against tomorrow.
 *
 * Every comparison of a `date`-typed column against the present should come
 * through here. Not every comparison of an *instant* should: `lib/analytics`
 * deliberately buckets in UTC, because its numbers have to agree with a session
 * hash that does.
 */
export function asuncionToday(now: Date = new Date()): string {
  return new Date(now.getTime() + ASUNCION_OFFSET_MS).toISOString().slice(0, 10);
}

/** −03:00 in milliseconds. See `ASUNCION_UTC_OFFSET`. */
const ASUNCION_OFFSET_MS = -3 * 60 * 60 * 1000;
