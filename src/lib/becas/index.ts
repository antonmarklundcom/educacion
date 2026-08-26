/**
 * The becas public surface — the same shape as `@/lib/institutions` and
 * `@/lib/careers`: components import typed objects from here, never a Drizzle
 * row or raw SQL (CLAUDE.md rule 5).
 *
 * `architecture.md` §38.5 left these live on purpose, because the write path
 * did not know how to expire a cache yet: `db/queries/admin/becas.ts` writes
 * `becas`, which is not in `program_search`, so `rebuildProgramSearch()` never
 * runs and there is no cache expiry to hang off it. PR-57 closes that the same
 * way PR-55 closed it for `admin/areas.ts` — the mutation calls
 * `expirePublicReads()` itself; see that file and `cache/tags.ts`.
 *
 * ### Why `listBecas` and `becaTypeCounts` carry the date in their cache key
 *
 * `db/queries/becas.ts`'s `livePredicate` filters `WHERE … deadline is null or
 * deadline >= today` — the same shape `search-key.ts` already documents for
 * `admission_closes_on`: the same arguments legitimately mean fewer rows once
 * a deadline is in the past. Leaving the date out of the key would let a
 * closed convocatoria sit in "becas abiertas" for up to an hour after its
 * deadline — the honesty failure CLAUDE.md rule 1 is about, just on a clock
 * instead of a fabricated number. `getBecaBySlug` does not need this: its
 * `WHERE` only checks `status = 'published'`, and the one date-derived field
 * it returns, `isClosed`, is computed in `decode`, which runs on every read
 * against *that* request's clock — exactly like `price.freshness` in
 * `lib/search/index.ts`.
 */

import {
  becaTypeCounts as becaTypeCountsQuery,
  getBecaBySlug as getBecaBySlugQuery,
  listBecas as listBecasQuery,
  type BecaDetail,
  type BecaFilters,
  type BecaSummary,
  type BecaType,
} from '@/db/queries/becas';
import { cachedRead } from '@/lib/cache';
import { toDateOnly } from '@/lib/search/accreditation';

export type {
  BecaCoverage,
  BecaDetail,
  BecaFilters,
  BecaSummary,
  BecaType,
} from '@/db/queries/becas';

/** A `BecaSummary`/`BecaDetail` with its one `Date` column as an ISO string. */
type BecaSummaryWire = Omit<BecaSummary, 'verifiedAt'> & { verifiedAt: string | null };
type BecaDetailWire = Omit<BecaDetail, 'verifiedAt' | 'updatedAt' | 'isClosed'> & {
  verifiedAt: string | null;
  updatedAt: string;
};

function encodeSummary(beca: BecaSummary): BecaSummaryWire {
  return { ...beca, verifiedAt: beca.verifiedAt ? beca.verifiedAt.toISOString() : null };
}

function decodeSummary(wire: BecaSummaryWire): BecaSummary {
  return { ...wire, verifiedAt: wire.verifiedAt ? new Date(wire.verifiedAt) : null };
}

function filtersKey(filters: BecaFilters): string {
  return [
    filters.type ?? '',
    filters.areaSlug ?? '',
    filters.institutionSlug ?? '',
    filters.fullOnly ? '1' : '0',
  ].join('|');
}

/** Open becas for the given filters. Cached — the key rolls over at midnight. */
export function listBecas(
  filters: BecaFilters = {},
  now: Date = new Date(),
): Promise<BecaSummary[]> {
  return cachedRead<BecaSummaryWire[], BecaSummary[]>({
    name: 'becas-list',
    key: `${toDateOnly(now)}|${filtersKey(filters)}`,
    load: async () => (await listBecasQuery(filters, now)).map(encodeSummary),
    decode: (wire) => wire.map(decodeSummary),
  });
}

/** One published beca by slug, or `null` — a 404 on the route. Cached. */
export function getBecaBySlug(slug: string, now: Date = new Date()): Promise<BecaDetail | null> {
  const today = toDateOnly(now);
  return cachedRead<BecaDetailWire | null, BecaDetail | null>({
    name: 'beca-by-slug',
    key: slug,
    load: async () => {
      const beca = await getBecaBySlugQuery(slug, now);
      if (!beca) return null;
      return {
        id: beca.id,
        slug: beca.slug,
        title: beca.title,
        summary: beca.summary,
        type: beca.type,
        coverage: beca.coverage,
        amountPyg: beca.amountPyg,
        percentage: beca.percentage,
        deadline: beca.deadline,
        providerLabel: beca.providerLabel,
        institutionSlug: beca.institutionSlug,
        areaName: beca.areaName,
        areaSlug: beca.areaSlug,
        sourceUrl: beca.sourceUrl,
        verifiedAt: beca.verifiedAt ? beca.verifiedAt.toISOString() : null,
        detailsMd: beca.detailsMd,
        requirementsMd: beca.requirementsMd,
        applyUrl: beca.applyUrl,
        updatedAt: beca.updatedAt.toISOString(),
      };
    },
    decode: (wire) =>
      wire && {
        ...wire,
        verifiedAt: wire.verifiedAt ? new Date(wire.verifiedAt) : null,
        updatedAt: new Date(wire.updatedAt),
        isClosed: wire.deadline != null && wire.deadline < today,
      },
  });
}

/** The type values that actually have open becas, for the filter chips. Cached. */
export function becaTypeCounts(
  now: Date = new Date(),
): Promise<{ type: BecaType; count: number }[]> {
  return cachedRead<{ type: BecaType; count: number }[], { type: BecaType; count: number }[]>({
    name: 'beca-type-counts',
    key: toDateOnly(now),
    load: () => becaTypeCountsQuery(now),
    decode: (wire) => wire,
  });
}
