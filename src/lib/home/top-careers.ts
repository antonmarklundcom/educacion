/**
 * "Carreras con más opciones" — the homepage's supply ranking.
 *
 * ### What this is not
 *
 * It is not "carreras más buscadas". We have no per-career search volume:
 * `src/db/queries/events.ts` counts events by type, by day and by institution
 * and by nothing else, and at launch the table is empty anyway. A heading that
 * claimed popularity would be a number we cannot produce (CLAUDE.md rule 1),
 * so the section ranks careers by the one thing the index can prove — how many
 * published offerings each one has — and says so on the page.
 *
 * ### Why the walk is bounded
 *
 * There is no "top careers" query and this module is not allowed to write one
 * (CLAUDE.md rule 5, and the task fixes `@/lib/careers` as the interface). It
 * therefore walks areas in descending order of published supply, reading each
 * area's careers through `listCareersByArea`, and stops as soon as the answer
 * can no longer change: a career cannot have more offerings than its own area,
 * so once the `limit`-th career held beats an area's total, no unvisited area
 * (they are sorted descending) can contain a career that belongs in the list.
 * On real data that terminates after the first few areas, and it is exact —
 * not "the top areas' top careers".
 */

import { getAreaBySlug, listCareersByArea, type CareerWithStats } from '@/lib/careers';

/** One area and its published-offering count — the `areas` facet, essentially. */
export interface AreaSupply {
  slug: string;
  offeringCount: number;
}

export type AreaCareerLoader = (areaSlug: string) => Promise<CareerWithStats[]>;

const loadAreaCareers: AreaCareerLoader = async (areaSlug) => {
  const area = await getAreaBySlug(areaSlug);
  return area ? listCareersByArea(area.id) : [];
};

/** Offerings desc, then institutions desc, then name — so the order is stable. */
function bySupply(a: CareerWithStats, b: CareerWithStats): number {
  return (
    b.stats.offeringCount - a.stats.offeringCount ||
    b.stats.institutionCount - a.stats.institutionCount ||
    a.nameEs.localeCompare(b.nameEs, 'es')
  );
}

export async function loadTopCareers(
  areas: readonly AreaSupply[],
  limit: number,
  load: AreaCareerLoader = loadAreaCareers,
): Promise<CareerWithStats[]> {
  if (limit <= 0) return [];

  const ordered = areas
    .filter((area) => area.offeringCount > 0)
    .slice()
    .sort((a, b) => b.offeringCount - a.offeringCount);

  const best: CareerWithStats[] = [];

  for (const area of ordered) {
    // Strictly greater, not `>=`: an area whose whole supply equals the
    // current cut-off can still hold a career that ties it, and a tie is
    // decided by name, not by which area we happened to read first.
    if (best.length >= limit && best[limit - 1].stats.offeringCount > area.offeringCount) break;

    const careers = await load(area.slug);
    for (const career of careers) {
      if (career.stats.offeringCount > 0) best.push(career);
    }
    best.sort(bySupply);
    best.length = Math.min(best.length, limit);
  }

  return best;
}
