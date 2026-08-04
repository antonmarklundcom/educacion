/**
 * Finding one program's offerings by slug, through the search contract.
 *
 * `searchPrograms()` is the only interface any page may use to read the index
 * (contract, `SearchPrograms`), and it filters by `institutionSlug` but not by
 * `programSlug` — so this module scopes to the institution and picks out the
 * program from the page it gets back. At a few hundred offerings per
 * institution that is one or two queries, and it costs nothing at request time
 * that a dedicated query would not also cost.
 *
 * **One route, several rows.** `/universidades/[inst]/[program]` is one
 * program, but a program can be offered at more than one sede and in more than
 * one turno, and each of those is its own `program_search` row with its own
 * arancel and its own convocatoria. The page shows the program once and lists
 * its offerings — collapsing them to "the first row" would quietly hide a
 * cheaper sede or an open convocatoria.
 */

import { searchPrograms, type OfferingSummary } from '@/lib/search';

/** Read in pages of this size; the ceiling the contract allows is 100. */
const PAGE_SIZE = 100;

/**
 * How deep to page before giving up. 20 pages is 2 000 offerings for a single
 * institution — an order of magnitude past the largest real one, and a bound
 * rather than an unbounded loop over a hostile slug.
 */
const MAX_PAGES = 20;

export interface InstitutionPrograms {
  /** Every offering the institution has, in relevance order. */
  offerings: OfferingSummary[];
  total: number;
}

/**
 * One page of an institution's offerings. `page` is 1-based, matching the
 * contract's paging.
 */
export async function listInstitutionOfferings(
  institutionSlug: string,
  page = 1,
  pageSize = PAGE_SIZE,
): Promise<InstitutionPrograms> {
  const response = await searchPrograms({ institutionSlug, page, pageSize, sort: 'nombre_asc' });
  return { offerings: response.results, total: response.total };
}

/**
 * Every offering of one program at one institution — sedes and turnos included.
 *
 * Returns an empty array when nothing matches, which the route turns into a
 * 404. It never falls back to "something close": a URL that names a program we
 * do not have is a 404, not a guess.
 */
export async function findProgramOfferings(
  institutionSlug: string,
  programSlug: string,
): Promise<OfferingSummary[]> {
  const matches: OfferingSummary[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { offerings, total } = await listInstitutionOfferings(institutionSlug, page);
    matches.push(...offerings.filter((offering) => offering.programSlug === programSlug));
    if (page * PAGE_SIZE >= total || offerings.length === 0) break;
  }

  return matches;
}

/**
 * Programs to link to from a detail page — the same career at a *different*
 * institution, which is the highest-value internal link on the page (seo.md
 * §7). Falls back to the same área, then to nothing. Never pads the list with
 * unrelated programs to reach a target count.
 */
export async function findRelatedOfferings(
  offering: OfferingSummary,
  limit = 3,
): Promise<OfferingSummary[]> {
  const seenPrograms = new Set<string>();
  const related: OfferingSummary[] = [];

  const pools = [
    offering.careerSlug ? { careerSlugs: [offering.careerSlug] } : null,
    offering.areaSlug ? { areaSlugs: [offering.areaSlug] } : null,
  ].filter((pool): pool is NonNullable<typeof pool> => pool != null);

  for (const pool of pools) {
    if (related.length >= limit) break;
    const { results } = await searchPrograms({ ...pool, pageSize: limit * 5 });
    for (const candidate of results) {
      if (related.length >= limit) break;
      if (candidate.institutionSlug === offering.institutionSlug) continue;
      const key = `${candidate.institutionSlug}/${candidate.programSlug}`;
      if (seenPrograms.has(key)) continue;
      seenPrograms.add(key);
      related.push(candidate);
    }
  }

  return related;
}
