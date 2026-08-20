/**
 * `npm run search:rebuild` — rebuilding `program_search` from the curated
 * tables.
 *
 * The table is a derived artefact with no foreign keys, so the rebuild is a
 * full replace rather than a diff: it is easier to prove correct, it is safe to
 * run at any time, and at ~10k rows it costs a couple of seconds.
 *
 * ### Why `DELETE`, not `TRUNCATE`
 *
 * `TRUNCATE TABLE` is DDL in MySQL and performs an **implicit commit**. Inside
 * a transaction it cannot be rolled back, so a failure in the insert phase
 * would leave the live site with an empty index — the one outcome this script
 * must never produce. `DELETE FROM program_search` is transactional: if
 * anything throws, the old index is still there and the site keeps serving.
 * At this row count the cost of that guarantee is negligible.
 *
 * The FULLTEXT index `ps_search_text_ft` (migration 0001) survives both, and
 * this script does not drop or recreate it.
 *
 * ### What it resolves at index time
 *
 * - **One price per offering** — the row `prices.current_offering_id` points
 *   at, which is the generated column that makes "exactly one current price"
 *   a constraint rather than a convention.
 * - **`price_expires_on = verified_at + 12 months`**, computed by
 *   `priceExpiresOn()` from `src/db/invariants.ts` so the boundary is defined
 *   in exactly one place.
 * - **One accreditation badge** out of however many rows cover the offering,
 *   by the documented precedence rule in `src/lib/search/accreditation.ts`.
 * - **`search_text`**, accent-stripped and lowercased — never left to collation.
 * - **`plan_rank`**, from the institution's *effective* entitlements (PR-25):
 *   `subscriptions` resolved through `resolveEntitlements`, not a plan pointer
 *   on `institutions`. A subscription that ended yesterday contributes 0 from
 *   the moment it ends, so the nightly rebuild un-ranks a lapsed plan without
 *   anybody cancelling anything; every subscription write rebuilds too, so a
 *   same-day change does not wait for the night.
 */

import { and, eq, ne, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { priceExpiresOn } from '@/db/invariants';
import {
  accreditations,
  admissions,
  areas,
  campuses,
  careers,
  cities,
  departments,
  institutions,
  offerings,
  prices,
  programSearch,
  programs,
} from '@/db/schema';
import { expirePublicReads } from '@/lib/cache';
import { pastDueGraceDays, resolveEntitlements, type SubscriptionFacts } from '@/lib/entitlements';
import {
  resolveAccreditation,
  toDateOnly,
  type AccreditationCandidate,
} from '@/lib/search/accreditation';
import { buildSearchText } from '@/lib/search/normalize';

import { allSubscriptionFacts } from './plans';

type ProgramSearchInsert = typeof programSearch.$inferInsert;

/**
 * MySQL caps a prepared statement at 65,535 placeholders and
 * `program_search` has ~45 columns. 250 rows per statement leaves plenty of
 * headroom and keeps the number of round trips small.
 */
const INSERT_CHUNK_SIZE = 250;

export interface RebuildSummary {
  rows: number;
  published: number;
  withDisplayablePrice: number;
  withAccreditationBadge: number;
  tookMs: number;
}

/* -------------------------------------------------------------------------- */
/* Reading the curated tables                                                 */
/* -------------------------------------------------------------------------- */

async function loadSourceRows(database: Db) {
  return (
    database
      .select({
        offeringId: offerings.id,
        programId: offerings.programId,
        campusId: offerings.campusId,
        modality: offerings.modality,
        shift: offerings.shift,
        durationMonths: offerings.durationMonths,
        enrollmentStatus: offerings.enrollmentStatus,
        offeringStatus: offerings.status,

        programName: programs.nameOfficial,
        programSlug: programs.slug,
        programLevel: programs.level,
        titleAwarded: programs.titleAwarded,
        programStatus: programs.status,
        careerId: programs.careerId,

        institutionId: institutions.id,
        institutionSlug: institutions.slug,
        institutionName: institutions.nameOfficial,
        institutionShort: institutions.nameShort,
        acronym: institutions.acronym,
        institutionLogo: institutions.logoUrl,
        brandColor: institutions.brandColor,
        management: institutions.management,
        institutionType: institutions.type,
        institutionStatus: institutions.status,

        campusName: campuses.name,
        campusStatus: campuses.status,

        cityId: cities.id,
        citySlug: cities.slug,
        cityName: cities.nameEs,

        departmentId: departments.id,
        departmentSlug: departments.slug,
        departmentName: departments.nameEs,

        careerSlug: careers.slug,
        careerName: careers.nameEs,
        careerSynonyms: careers.synonymsJson,

        areaId: areas.id,
        areaSlug: areas.slug,
        areaName: areas.nameEs,

        priceCurrency: prices.currency,
        matricula: prices.matricula,
        monthlyFee: prices.monthlyFee,
        installmentsPerYear: prices.installmentsPerYear,
        admissionFee: prices.admissionFee,
        annualCost: prices.annualCost,
        isFree: prices.isFree,
        priceVerifiedAt: prices.verifiedAt,
      })
      .from(offerings)
      .innerJoin(programs, eq(offerings.programId, programs.id))
      .innerJoin(institutions, eq(programs.institutionId, institutions.id))
      .innerJoin(campuses, eq(offerings.campusId, campuses.id))
      .innerJoin(cities, eq(campuses.cityId, cities.id))
      .innerJoin(departments, eq(cities.departmentId, departments.id))
      .leftJoin(careers, eq(programs.careerId, careers.id))
      .leftJoin(areas, eq(careers.areaId, areas.id))
      // The generated `current_offering_id` is NULL on history rows, so this
      // join can only ever pick the one current price.
      .leftJoin(prices, eq(prices.currentOfferingId, offerings.id))
      .where(
        and(
          ne(offerings.status, 'archived'),
          ne(programs.status, 'archived'),
          ne(institutions.status, 'archived'),
          ne(campuses.status, 'archived'),
        ),
      )
  );
}

type SourceRow = Awaited<ReturnType<typeof loadSourceRows>>[number];

/** Rows attached to an institution / program / offering, in three buckets. */
interface ScopedIndex<T> {
  institution: Map<number, T[]>;
  program: Map<number, T[]>;
  offering: Map<number, T[]>;
}

function emptyScopedIndex<T>(): ScopedIndex<T> {
  return { institution: new Map(), program: new Map(), offering: new Map() };
}

function pushScoped<T>(
  index: ScopedIndex<T>,
  row: { institutionId: number | null; programId: number | null; offeringId: number | null },
  value: T,
): void {
  const target =
    row.offeringId != null
      ? ([index.offering, row.offeringId] as const)
      : row.programId != null
        ? ([index.program, row.programId] as const)
        : row.institutionId != null
          ? ([index.institution, row.institutionId] as const)
          : null;
  if (!target) return;
  const [map, key] = target;
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

async function loadAccreditations(database: Db): Promise<ScopedIndex<AccreditationCandidate>> {
  const rows = await database
    .select({
      id: accreditations.id,
      scope: accreditations.scope,
      institutionId: accreditations.institutionId,
      programId: accreditations.programId,
      offeringId: accreditations.offeringId,
      agency: accreditations.agency,
      status: accreditations.status,
      sourceUrl: accreditations.sourceUrl,
      resolutionNumber: accreditations.resolutionNumber,
      resolutionDate: accreditations.resolutionDate,
      validTo: accreditations.validTo,
      verifiedAt: accreditations.verifiedAt,
      isDisputed: accreditations.isDisputed,
    })
    .from(accreditations)
    .where(eq(accreditations.isDisputed, false));

  const index = emptyScopedIndex<AccreditationCandidate>();
  for (const row of rows) {
    pushScoped(index, row, {
      id: row.id,
      scope: row.scope,
      agency: row.agency,
      status: row.status,
      sourceUrl: row.sourceUrl,
      resolutionNumber: row.resolutionNumber,
      resolutionDate: row.resolutionDate,
      validTo: row.validTo,
      verifiedAt: row.verifiedAt,
      isDisputed: row.isDisputed,
    });
  }
  return index;
}

async function loadAdmissionCloses(database: Db): Promise<ScopedIndex<string>> {
  const rows = await database
    .select({
      institutionId: admissions.institutionId,
      programId: admissions.programId,
      offeringId: admissions.offeringId,
      registrationCloses: admissions.registrationCloses,
    })
    .from(admissions)
    .where(and(eq(admissions.isActive, true), sql`${admissions.registrationCloses} is not null`));

  const index = emptyScopedIndex<string>();
  for (const row of rows) {
    if (!row.registrationCloses) continue;
    pushScoped(index, row, row.registrationCloses);
  }
  return index;
}

/**
 * The next date inscriptions close, from the most specific scope that has an
 * active convocatoria — offering, then program, then institution.
 *
 * Only future dates: a closing date that has already passed is not a fact the
 * card can act on, and `enrollment_status` (maintained daily by cron) is what
 * says "cerradas".
 */
function resolveAdmissionCloses(
  index: ScopedIndex<string>,
  row: SourceRow,
  today: string,
): string | null {
  const buckets = [
    index.offering.get(row.offeringId),
    index.program.get(row.programId),
    index.institution.get(row.institutionId),
  ];
  for (const bucket of buckets) {
    if (!bucket?.length) continue;
    const upcoming = bucket.filter((date) => date >= today).sort();
    return upcoming[0] ?? null;
  }
  return null;
}

/**
 * `institution_id → plan_rank`, from the effective entitlements rather than
 * from any stored plan pointer (PR-25). Institutions with nothing counting
 * today are simply absent, and `buildIndexRow` reads an absent id as 0 —
 * `plan_rank` is never inherited from a subscription that has ended.
 *
 * ### The gate is `priority_placement`, not the rank (PR-46)
 *
 * This function used to write the entitlement's **rank** (1 for Verificado, 2
 * for Destacado), and the independent review of PR-27 found what that meant:
 * `plan_rank` is the tiebreaker on every default-sorted page, and on `/carreras`
 * with no query every row ties on relevance (`architecture.md` §4.1) — so a
 * **Verificado** institution was being ordered ahead of every free institution
 * it tied with. Verificado does not buy `priority_placement`
 * (`monetization.md` §7's matrix, `entitlements/contract.ts`), so
 * `placementFlags().destacado` was `false` for those rows: **no "Destacado"
 * badge, and no `PlacementDisclosure`, on a page whose order had been paid
 * for.** `monetization.md` §3 closes by naming that exact thing as the one
 * practice that "destroys the only asset you have".
 *
 * So the index now boosts exactly the institutions the label path will label.
 * `plan_rank` is 2 or absent; a Verificado institution ranks 0 and sorts like
 * anybody else, which is what it was sold.
 */
export function planRanksByInstitution(
  facts: readonly SubscriptionFacts[],
  now: Date,
): Map<number, number> {
  const ranks = new Map<number, number>();
  for (const institutionId of new Set(facts.map((fact) => fact.institutionId))) {
    const entitlements = resolveEntitlements(
      institutionId,
      facts.filter((fact) => fact.institutionId === institutionId),
      { now, graceDays: pastDueGraceDays() },
    );
    // The entitlement, never the rank: they are different questions and the
    // answer diverges for exactly the plan that was going unlabelled.
    if (entitlements.features.priority_placement) {
      ranks.set(institutionId, entitlements.planRank);
    }
  }
  return ranks;
}

/* -------------------------------------------------------------------------- */
/* Building one index row                                                     */
/* -------------------------------------------------------------------------- */

export function buildIndexRow(
  row: SourceRow,
  accreditationIndex: ScopedIndex<AccreditationCandidate>,
  admissionIndex: ScopedIndex<string>,
  now: Date,
  planRanks: ReadonlyMap<number, number> = new Map(),
): ProgramSearchInsert {
  const today = toDateOnly(now);

  const candidates = [
    ...(accreditationIndex.offering.get(row.offeringId) ?? []),
    ...(accreditationIndex.program.get(row.programId) ?? []),
    ...(accreditationIndex.institution.get(row.institutionId) ?? []),
  ];
  const accreditation = resolveAccreditation(candidates, now);
  const expiry = priceExpiresOn(row.priceVerifiedAt);

  return {
    offeringId: row.offeringId,
    programId: row.programId,
    institutionId: row.institutionId,
    careerId: row.careerId ?? null,
    campusId: row.campusId,
    cityId: row.cityId,
    departmentId: row.departmentId,
    areaId: row.areaId ?? null,

    institutionSlug: row.institutionSlug,
    programSlug: row.programSlug,
    careerSlug: row.careerSlug ?? null,
    areaSlug: row.areaSlug ?? null,
    citySlug: row.citySlug,
    departmentSlug: row.departmentSlug,

    programName: row.programName,
    careerName: row.careerName ?? null,
    titleAwarded: row.titleAwarded ?? null,
    institutionName: row.institutionName,
    institutionShort: row.institutionShort,
    institutionLogo: row.institutionLogo ?? null,
    brandColor: row.brandColor ?? null,
    campusName: row.campusName,
    cityName: row.cityName,
    departmentName: row.departmentName,

    level: row.programLevel,
    modality: row.modality,
    shift: row.shift,
    management: row.management,
    institutionType: row.institutionType,
    durationMonths: row.durationMonths ?? null,

    priceCurrency: row.priceCurrency ?? null,
    matriculaGs: row.matricula ?? null,
    monthlyFeeGs: row.monthlyFee ?? null,
    installmentsPerYear: row.installmentsPerYear ?? null,
    admissionFeeGs: row.admissionFee ?? null,
    annualCostGs: row.annualCost ?? null,
    isFree: row.isFree ?? false,
    priceVerifiedAt: row.priceVerifiedAt ?? null,
    priceExpiresOn: expiry ? toDateOnly(expiry) : null,

    accreditationStatus: accreditation.status,
    accreditationAgency: accreditation.agency,
    accreditationSourceUrl: accreditation.sourceUrl,
    accreditationValidTo: accreditation.validTo,

    enrollmentStatus: row.enrollmentStatus,
    admissionClosesOn: resolveAdmissionCloses(admissionIndex, row, today),

    planRank: planRanks.get(row.institutionId) ?? 0,
    isPublished:
      row.offeringStatus === 'published' &&
      row.programStatus === 'published' &&
      row.institutionStatus === 'published' &&
      row.campusStatus === 'published',

    searchText: buildSearchText({
      institutionName: row.institutionName,
      institutionShort: row.institutionShort,
      acronym: row.acronym,
      programName: row.programName,
      careerName: row.careerName,
      careerSynonyms: row.careerSynonyms,
      titleAwarded: row.titleAwarded,
      campusName: row.campusName,
      cityName: row.cityName,
      departmentName: row.departmentName,
      areaName: row.areaName,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* The rebuild                                                                */
/* -------------------------------------------------------------------------- */

export interface RebuildOptions {
  db?: Db;
  now?: Date;
  /** Progress for the CLI; silent by default so tests stay quiet. */
  onProgress?: (message: string) => void;
}

export async function rebuildProgramSearch(options: RebuildOptions = {}): Promise<RebuildSummary> {
  const startedAt = Date.now();
  const database = options.db ?? defaultDb;
  const now = options.now ?? new Date();
  const log = options.onProgress ?? (() => {});

  log('Reading curated tables…');
  const [sourceRows, accreditationIndex, admissionIndex, subscriptionFacts] = await Promise.all([
    loadSourceRows(database),
    loadAccreditations(database),
    loadAdmissionCloses(database),
    allSubscriptionFacts(database),
  ]);
  log(`  ${sourceRows.length} offerings`);

  const planRanks = planRanksByInstitution(subscriptionFacts, now);

  const indexRows = sourceRows.map((row) =>
    buildIndexRow(row, accreditationIndex, admissionIndex, now, planRanks),
  );

  log('Replacing the index…');
  await database.transaction(async (tx) => {
    await tx.delete(programSearch);
    for (let i = 0; i < indexRows.length; i += INSERT_CHUNK_SIZE) {
      await tx.insert(programSearch).values(indexRows.slice(i, i + INSERT_CHUNK_SIZE));
    }
  });

  // Every write that can change a public read reaches this function — all ~40
  // admin and panel paths call it, and so does the nightly cron. That is what
  // makes one cache tag sufficient (`src/lib/cache/tags.ts`), and putting the
  // expiry here rather than at each call site is what makes it impossible to
  // forget. Outside a request scope (`npm run search:rebuild`) it is a no-op:
  // there is no cache in that process to expire.
  expirePublicReads();

  const today = toDateOnly(now);
  return {
    rows: indexRows.length,
    published: indexRows.filter((row) => row.isPublished).length,
    withDisplayablePrice: indexRows.filter(
      (row) => row.priceExpiresOn != null && row.priceExpiresOn > today,
    ).length,
    withAccreditationBadge: indexRows.filter((row) => row.accreditationStatus !== 'sin_datos')
      .length,
    tookMs: Date.now() - startedAt,
  };
}
