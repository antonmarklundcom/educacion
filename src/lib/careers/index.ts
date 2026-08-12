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

export {
  getAreaBySlug,
  getCareerBySlug,
  getCareerCitySupply,
  getCareerStats,
  listCareersByArea,
  listRelatedCareers,
  type AreaRecord,
  type CareerCityStat,
  type CareerRecord,
  type CareerStats,
  type CareerWithStats,
} from '@/db/queries/careers';

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
