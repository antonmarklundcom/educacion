/**
 * Becas — public reads (PR-31). Rule 5.
 *
 * ### Auto-expiry is a predicate, not a job
 *
 * A beca whose `deadline` has passed is not listed, and nothing has to run for
 * that to be true: `livePredicate` compares the deadline to the request's own
 * date. The failure mode this avoids is the expensive one — a student reading
 * a deadline that passed last month and planning around it — and a cron that
 * archived rows would leave exactly that gap between the deadline and the next
 * firing. A beca with **no** deadline stays listed: "convocatoria permanente"
 * is a real thing, and treating a null as expired would hide it.
 *
 * The row is never deleted or archived by this rule; an expired beca is still
 * readable at its own URL with an honest "esta convocatoria ya cerró" — the
 * link may be in somebody's WhatsApp thread, and a 404 teaches nothing.
 */

import { and, asc, desc, eq, gte, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { areas, becas, institutions } from '@/db/schema';
import type { BECA_COVERAGE, BECA_TYPE } from '@/db/schema';

export type BecaType = (typeof BECA_TYPE)[number];
export type BecaCoverage = (typeof BECA_COVERAGE)[number];

export interface BecaSummary {
  id: number;
  slug: string;
  title: string;
  summary: string;
  type: BecaType;
  coverage: BecaCoverage;
  amountPyg: number | null;
  percentage: number | null;
  deadline: string | null;
  providerLabel: string | null;
  institutionSlug: string | null;
  areaName: string | null;
  areaSlug: string | null;
  sourceUrl: string;
  verifiedAt: Date | null;
}

export interface BecaDetail extends BecaSummary {
  detailsMd: string | null;
  requirementsMd: string | null;
  applyUrl: string | null;
  updatedAt: Date;
  /** True when the deadline has passed — the page says so instead of 404ing. */
  isClosed: boolean;
}

export interface BecaFilters {
  type?: BecaType;
  areaSlug?: string;
  institutionSlug?: string;
  /** `true` keeps only becas that cover the whole arancel. */
  fullOnly?: boolean;
}

function providerLabel(institutionName: string | null, provider: string | null): string | null {
  return institutionName ?? provider ?? null;
}

function livePredicate(today: string): SQL | undefined {
  return and(eq(becas.status, 'published'), or(isNull(becas.deadline), gte(becas.deadline, today)));
}

const SELECTION = {
  id: becas.id,
  slug: becas.slug,
  title: becas.title,
  summary: becas.summary,
  type: becas.type,
  coverage: becas.coverage,
  amountPyg: becas.amountPyg,
  percentage: becas.percentage,
  deadline: becas.deadline,
  providerName: becas.providerName,
  institutionName: institutions.nameShort,
  institutionSlug: institutions.slug,
  areaName: areas.nameEs,
  areaSlug: areas.slug,
  sourceUrl: becas.sourceUrl,
  verifiedAt: becas.verifiedAt,
} as const;

type SelectedRow = {
  [K in keyof typeof SELECTION]: (typeof SELECTION)[K] extends { _: { data: infer T } } ? T : never;
};

function toSummary(row: SelectedRow): BecaSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    type: row.type as BecaType,
    coverage: row.coverage as BecaCoverage,
    amountPyg: row.amountPyg ?? null,
    percentage: row.percentage ?? null,
    deadline: row.deadline ?? null,
    providerLabel: providerLabel(row.institutionName ?? null, row.providerName ?? null),
    institutionSlug: row.institutionSlug ?? null,
    areaName: row.areaName ?? null,
    areaSlug: row.areaSlug ?? null,
    sourceUrl: row.sourceUrl,
    verifiedAt: row.verifiedAt ?? null,
  };
}

/**
 * Open becas, soonest deadline first, then the ones without a deadline.
 *
 * The ordering is the useful one for a student: what closes next is what needs
 * a decision this week. MySQL sorts NULLs first on `ASC`, so the expression
 * pushes the dateless ones to the end explicitly rather than relying on it.
 */
export async function listBecas(
  filters: BecaFilters = {},
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<BecaSummary[]> {
  const today = now.toISOString().slice(0, 10);
  const conditions = [livePredicate(today)];

  if (filters.type) conditions.push(eq(becas.type, filters.type));
  if (filters.areaSlug) conditions.push(eq(areas.slug, filters.areaSlug));
  if (filters.institutionSlug) conditions.push(eq(institutions.slug, filters.institutionSlug));
  if (filters.fullOnly) conditions.push(eq(becas.coverage, 'total'));

  const rows = await database
    .select(SELECTION)
    .from(becas)
    .leftJoin(institutions, eq(institutions.id, becas.institutionId))
    .leftJoin(areas, eq(areas.id, becas.areaId))
    .where(and(...conditions))
    .orderBy(sql`${becas.deadline} is null`, asc(becas.deadline), desc(becas.id));

  return rows.map((row) => toSummary(row as SelectedRow));
}

export async function getBecaBySlug(
  slug: string,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<BecaDetail | null> {
  const today = now.toISOString().slice(0, 10);

  const [row] = await database
    .select({
      ...SELECTION,
      detailsMd: becas.detailsMd,
      requirementsMd: becas.requirementsMd,
      applyUrl: becas.applyUrl,
      updatedAt: becas.updatedAt,
      status: becas.status,
    })
    .from(becas)
    .leftJoin(institutions, eq(institutions.id, becas.institutionId))
    .leftJoin(areas, eq(areas.id, becas.areaId))
    .where(and(eq(becas.slug, slug), eq(becas.status, 'published')))
    .limit(1);

  if (!row) return null;

  return {
    ...toSummary(row as unknown as SelectedRow),
    detailsMd: row.detailsMd ?? null,
    requirementsMd: row.requirementsMd ?? null,
    applyUrl: row.applyUrl ?? null,
    updatedAt: row.updatedAt,
    isClosed: row.deadline != null && row.deadline < today,
  };
}

/** The type values that actually have open becas, for the filter chips. */
export async function becaTypeCounts(
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<{ type: BecaType; count: number }[]> {
  const rows = await database
    .select({ type: becas.type, count: sql<number>`count(*)` })
    .from(becas)
    .where(livePredicate(now.toISOString().slice(0, 10)))
    .groupBy(becas.type);

  return rows.map((row) => ({ type: row.type as BecaType, count: Number(row.count) }));
}

export async function listBecaSlugs(
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<{ slug: string; updatedAt: Date }[]> {
  return database
    .select({ slug: becas.slug, updatedAt: becas.updatedAt })
    .from(becas)
    .where(livePredicate(now.toISOString().slice(0, 10)));
}
