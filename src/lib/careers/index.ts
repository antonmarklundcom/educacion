/**
 * The career/area hub surface — the same shape as `@/lib/institutions`:
 * components import typed objects from here, never a Drizzle row or raw SQL
 * (CLAUDE.md rule 5).
 *
 * `searchPrograms()` is still the only way to read an offering, a price or an
 * accreditation badge. This module knows about careers, areas and the counts
 * `program_search` can answer without a price or an accreditation join — and
 * the one editorial decision that is genuinely PR-12's: the city-page gate
 * (seo.md §4) and what a hub says when there is no hand-written copy for it
 * yet (see `copy.ts`).
 */

import {
  getAreaBySlug as getAreaBySlugQuery,
  getCareerBySlug as getCareerBySlugQuery,
  getCareerCitySupply as getCareerCitySupplyQuery,
  getCareerStats as getCareerStatsQuery,
  listCareersByArea as listCareersByAreaQuery,
  listRelatedCareers as listRelatedCareersQuery,
  type AreaRecord,
  type CareerCityStat,
  type CareerRecord,
  type CareerStats,
  type CareerWithStats,
} from '@/db/queries/careers';
import { cachedRead, passthrough } from '@/lib/cache';

export {
  type AreaRecord,
  type CareerCityStat,
  type CareerRecord,
  type CareerStats,
  type CareerWithStats,
} from '@/db/queries/careers';

/* -------------------------------------------------------------------------- */
/* Cached reads (PR-55)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * PR-43 wrapped four read paths and left these six, and the audit in
 * `architecture.md` §38 is where that showed up as a number rather than an
 * omission: every career hub, área hub and city page is `force-dynamic` (§3)
 * and was re-running its whole query set per request against a pool of eight
 * connections — and the **homepage** was the worst of them, because
 * `loadTopCareers` walks áreas in a loop it cannot parallelise (each step
 * decides whether there is a next one) at two uncached round-trips per step.
 *
 * They join the same tag and TTL as the other four (`cache/tags.ts`): almost
 * every write that can change them goes through `rebuildProgramSearch()`, which
 * expires it. `admin/areas.ts` was the one exception — it writes `areas` and
 * rebuilds nothing, because an área's name is not in the index — and it now
 * expires the tag itself, for the same reason `claims.ts` does.
 *
 * The `database` parameter is not carried across. It exists on the query
 * functions so tests can pass a fake, and a cache keyed on a caller-supplied
 * connection would be a cache keyed on nothing.
 */

/** One published career by slug, or `null` — a 404 on the route. Cached. */
export function getCareerBySlug(slug: string): Promise<CareerRecord | null> {
  return cachedRead<CareerRecord | null, CareerRecord | null>({
    name: 'career-by-slug',
    key: slug,
    load: () => getCareerBySlugQuery(slug),
    decode: passthrough,
  });
}

/** One área by slug, or `null`. Cached. */
export function getAreaBySlug(slug: string): Promise<AreaRecord | null> {
  return cachedRead<AreaRecord | null, AreaRecord | null>({
    name: 'area-by-slug',
    key: slug,
    load: () => getAreaBySlugQuery(slug),
    decode: passthrough,
  });
}

/** One career's published-index footprint. Cached. */
export function getCareerStats(careerId: number): Promise<CareerStats> {
  return cachedRead<CareerStats, CareerStats>({
    name: 'career-stats',
    key: String(careerId),
    load: () => getCareerStatsQuery(careerId),
    decode: passthrough,
  });
}

/** One career's supply per city — the city-page gate reads this. Cached. */
export function getCareerCitySupply(careerId: number): Promise<CareerCityStat[]> {
  return cachedRead<CareerCityStat[], CareerCityStat[]>({
    name: 'career-city-supply',
    key: String(careerId),
    load: () => getCareerCitySupplyQuery(careerId),
    decode: passthrough,
  });
}

/** Published careers in one área, with stats. Cached — the área hub and the home ranking. */
export function listCareersByArea(areaId: number): Promise<CareerWithStats[]> {
  return cachedRead<CareerWithStats[], CareerWithStats[]>({
    name: 'careers-by-area',
    key: String(areaId),
    load: () => listCareersByAreaQuery(areaId),
    decode: passthrough,
  });
}

/** The "related careers" link list. Cached. */
export function listRelatedCareers(
  areaId: number,
  excludeCareerId: number,
  limit: number,
): Promise<Array<{ slug: string; nameEs: string }>> {
  return cachedRead<
    Array<{ slug: string; nameEs: string }>,
    Array<{ slug: string; nameEs: string }>
  >({
    name: 'related-careers',
    key: `${areaId}:${excludeCareerId}:${limit}`,
    load: () => listRelatedCareersQuery(areaId, excludeCareerId, limit),
    decode: passthrough,
  });
}

export {
  buildAreaIntro,
  buildCareerCityIntro,
  buildCareerIntro,
  hasEditorialCopy,
  MIN_EDITORIAL_WORDS,
  wordCount,
  type Paragraph,
} from './copy';

/**
 * The anti-doorway gate (seo.md §4): a city variant of a career hub may exist
 * only where real supply justifies it. Both numbers are required — three
 * offerings from one institution is one institution's course list, not a
 * market, and the whole reason this gate exists is to stop a career page from
 * forking into ten near-duplicates with a city name swapped in.
 */
export const CITY_GATE_MIN_OFFERINGS = 3;
export const CITY_GATE_MIN_INSTITUTIONS = 2;

export function passesCityGate(stat: { offeringCount: number; institutionCount: number }): boolean {
  return (
    stat.offeringCount >= CITY_GATE_MIN_OFFERINGS &&
    stat.institutionCount >= CITY_GATE_MIN_INSTITUTIONS
  );
}
