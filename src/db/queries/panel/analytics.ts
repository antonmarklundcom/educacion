/**
 * `/panel/estadisticas` — the numbers an institution is shown, and the numbers
 * a renewal conversation is built on (PR-28). Rule 5.
 *
 * ### Where each number comes from, and why it is that one
 *
 * - **Vistas, clics a WhatsApp, apariciones en el comparador** come from
 *   `events`, through the aggregates PR-17 fixed with an optional
 *   `institutionId` (`architecture.md` §12) plus the two scoped ones PR-28
 *   added. Views are browser-reported, so a crawler is not a student and the
 *   number is defensible when an institution questions it — which it will.
 * - **Solicitudes come from `leads`, not from the `lead_submit` event.** They
 *   can differ: a lead is a row that exists and can be answered, while the
 *   event is a count. When they disagree the row is the truth, and it is also
 *   the number the institution can check against its own inbox. The page says
 *   which is which rather than presenting one as the other.
 *
 * ### Scoping
 *
 * `panelInstitutionId(user)` resolves the only id that reaches a WHERE clause
 * and staff are refused outright (§15). No function here takes an institution
 * id from a caller, so there is no shape in which one institution's dashboard
 * can be pointed at another's data — the property `analytics.access.test.ts`
 * asserts by calling these functions with a session for B and asking for A.
 *
 * ### Free tier
 *
 * A free institution sees the totals for the current period and the
 * month-over-month line; the **per-programme breakdown, the daily series and
 * the export** need `analytics_full` / `monthly_report`. The gate is
 * `getEntitlements` here in the query module — the export route renders no JSX,
 * so a component-level check would guard nothing (CLAUDE.md rule 4).
 */

import { eq, inArray } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { campuses, offerings, programs } from '@/db/schema';
import {
  countCompareAppearances,
  countCompareAppearancesByOffering,
  countEventsByDay,
  countEventsByOffering,
  countEventsByType,
  type EventRange,
} from '@/db/queries/events';
import { countLeadsForInstitutionSince } from '@/db/queries/leads';
import { can, getEntitlements } from '@/lib/entitlements';
import { AuthError } from '@/lib/auth/roles';
import { fillDays, toRange, type RangeDays } from '@/lib/analytics/range';
import type { SessionUser } from '@/lib/auth/session';

import { panelInstitutionId } from './scope';

export interface PanelMetric {
  current: number;
  previous: number;
  /** Percentage change, or null when the previous period was zero. */
  deltaPct: number | null;
}

export interface PanelProgramRow {
  offeringId: number;
  programName: string;
  campusName: string;
  views: number;
  whatsappClicks: number;
  compareAppearances: number;
}

export interface PanelAnalytics {
  institutionId: number;
  days: RangeDays;
  range: EventRange;
  /** The equally long window immediately before `range`. */
  previousRange: EventRange;
  views: PanelMetric;
  whatsappClicks: PanelMetric;
  leads: PanelMetric;
  compareAppearances: PanelMetric;
  /** Distinct daily session hashes in the current range. Devices-days, not people. */
  sessions: number;
  /** Present only with `analytics_full`. */
  daily: { day: string; events: number }[] | null;
  /** Present only with `analytics_full`. */
  programs: PanelProgramRow[] | null;
  full: boolean;
  canExport: boolean;
  planName: string | null;
}

/**
 * The change between two periods, as a percentage — or `null`.
 *
 * Null when the previous period was zero, deliberately: "up 100%" from zero is
 * arithmetic dressed as a result, and the first month of any institution's data
 * would be full of them. The page says "sin base de comparación" instead.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function metric(current: number, previous: number): PanelMetric {
  return { current, previous, deltaPct: deltaPct(current, previous) };
}

/** The equally long window immediately before `range`, for the MoM comparison. */
export function precedingRange(range: EventRange): EventRange {
  const span = range.until.getTime() - range.since.getTime();
  return { since: new Date(range.since.getTime() - span), until: new Date(range.since.getTime()) };
}

async function offeringLabels(
  offeringIds: number[],
  database: Db,
): Promise<Map<number, { programName: string; campusName: string }>> {
  if (offeringIds.length === 0) return new Map();
  const rows = await database
    .select({
      offeringId: offerings.id,
      programName: programs.nameOfficial,
      campusName: campuses.name,
    })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .innerJoin(campuses, eq(campuses.id, offerings.campusId))
    .where(inArray(offerings.id, offeringIds));

  return new Map(
    rows.map((row) => [
      row.offeringId,
      { programName: row.programName, campusName: row.campusName },
    ]),
  );
}

/**
 * The core every view goes through: one institution, one range, one set of
 * questions. The dashboard and the monthly report call it with different
 * ranges rather than counting the same events two different ways — two code
 * paths to a view count is two numbers to reconcile in front of a customer.
 */
async function analyticsForRange(
  institutionId: number,
  range: EventRange,
  previousRange: EventRange,
  days: RangeDays,
  options: { full: boolean; canExport: boolean; planName: string | null },
  database: Db,
): Promise<PanelAnalytics> {
  const [
    currentByType,
    previousByType,
    currentLeads,
    previousLeads,
    currentCompare,
    previousCompare,
  ] = await Promise.all([
    countEventsByType(range, institutionId, database),
    countEventsByType(previousRange, institutionId, database),
    countLeadsForInstitutionSince(institutionId, range, database),
    countLeadsForInstitutionSince(institutionId, previousRange, database),
    countCompareAppearances(range, institutionId, database),
    countCompareAppearances(previousRange, institutionId, database),
  ]);

  const at = (rows: typeof currentByType, type: 'offering_view' | 'whatsapp_click') =>
    rows.find((row) => row.type === type)?.events ?? 0;

  const analytics: PanelAnalytics = {
    institutionId,
    days,
    range,
    previousRange,
    views: metric(at(currentByType, 'offering_view'), at(previousByType, 'offering_view')),
    whatsappClicks: metric(
      at(currentByType, 'whatsapp_click'),
      at(previousByType, 'whatsapp_click'),
    ),
    leads: metric(currentLeads, previousLeads),
    compareAppearances: metric(currentCompare, previousCompare),
    sessions: currentByType.reduce((total, row) => Math.max(total, row.sessions), 0),
    daily: null,
    programs: null,
    full: options.full,
    canExport: options.canExport,
    planName: options.planName,
  };

  if (!options.full) return analytics;

  const [dailyViews, viewsByOffering, clicksByOffering, compareByOffering] = await Promise.all([
    countEventsByDay(range, { type: 'offering_view', institutionId }, database),
    countEventsByOffering(range, institutionId, 'offering_view', database),
    countEventsByOffering(range, institutionId, 'whatsapp_click', database),
    countCompareAppearancesByOffering(range, institutionId, database),
  ]);

  const offeringIds = [
    ...new Set([
      ...viewsByOffering.map((row) => row.offeringId),
      ...clicksByOffering.map((row) => row.offeringId),
      ...compareByOffering.map((row) => row.offeringId),
    ]),
  ];
  const labels = await offeringLabels(offeringIds, database);
  const viewMap = new Map(viewsByOffering.map((row) => [row.offeringId, row.events]));
  const clickMap = new Map(clicksByOffering.map((row) => [row.offeringId, row.events]));
  const compareMap = new Map(compareByOffering.map((row) => [row.offeringId, row.events]));

  analytics.daily = fillDays(range, dailyViews);
  analytics.programs = offeringIds
    .map((offeringId) => ({
      offeringId,
      programName: labels.get(offeringId)?.programName ?? `Oferta ${offeringId}`,
      campusName: labels.get(offeringId)?.campusName ?? '—',
      views: viewMap.get(offeringId) ?? 0,
      whatsappClicks: clickMap.get(offeringId) ?? 0,
      compareAppearances: compareMap.get(offeringId) ?? 0,
    }))
    .sort((a, b) => b.views - a.views || b.whatsappClicks - a.whatsappClicks);

  return analytics;
}

export async function panelAnalytics(
  user: SessionUser | null | undefined,
  options: { days: RangeDays; now?: Date },
  database: Db = defaultDb,
): Promise<PanelAnalytics> {
  const institutionId = panelInstitutionId(user);
  const entitlements = await getEntitlements(institutionId, undefined, database);

  const range = toRange(options.days, options.now ?? new Date());

  return analyticsForRange(
    institutionId,
    range,
    // A rolling window compares against the equally long window before it.
    precedingRange(range),
    options.days,
    {
      full: can(entitlements, 'analytics_full'),
      canExport: can(entitlements, 'monthly_report'),
      planName: entitlements.planName,
    },
    database,
  );
}

/** `YYYY-MM` → the UTC half-open range covering that calendar month. */
export function monthRange(month: string): EventRange {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new AuthError('Mes inválido.', 'forbidden');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new AuthError('Mes inválido.', 'forbidden');
  return {
    since: new Date(Date.UTC(year, monthIndex, 1)),
    until: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

/** `YYYY-MM` → the calendar month before it. */
export function previousMonth(month: string): string {
  const range = monthRange(month);
  const previous = new Date(
    Date.UTC(range.since.getUTCFullYear(), range.since.getUTCMonth() - 1, 1),
  );
  return previous.toISOString().slice(0, 7);
}

/**
 * The same numbers for one calendar month — the artefact a renewal
 * conversation is built on, and the one an institution can check line by line
 * against its own records. Its comparison period is the month before, which is
 * what "mes contra mes" means to the person reading it.
 *
 * `monthly_report` is asserted **here**, not in the route: the printable page
 * and the CSV both read this one function, and a check in either of them would
 * leave the other open.
 */
export async function panelMonthlyReport(
  user: SessionUser | null | undefined,
  month: string,
  database: Db = defaultDb,
): Promise<PanelAnalytics & { month: string }> {
  const institutionId = panelInstitutionId(user);
  const entitlements = await getEntitlements(institutionId, undefined, database);
  if (!can(entitlements, 'monthly_report')) {
    throw new AuthError('El reporte mensual no está incluido en tu plan.', 'forbidden');
  }

  const range = monthRange(month);
  const days = Math.round(
    (range.until.getTime() - range.since.getTime()) / 86_400_000,
  ) as RangeDays;

  const analytics = await analyticsForRange(
    institutionId,
    range,
    // "Mes contra mes" means the previous *calendar* month, not the previous
    // 31 days: comparing July against 1 June–1 July would silently drop a day
    // of June, and the person reading the sheet means the month.
    monthRange(previousMonth(month)),
    days,
    { full: true, canExport: true, planName: entitlements.planName },
    database,
  );
  return { ...analytics, month };
}
