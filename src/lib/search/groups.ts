/**
 * The eight facet groups, defined once.
 *
 * Both engines read this: the SQL implementation in
 * `src/db/queries/program-search.ts` derives its `GROUP BY` column and its
 * "drop my own filter" rule from `filterKey`, and the in-memory engine derives
 * its counting from `valueOf`. Adding a ninth group is one entry here plus one
 * column mapping there, not a search-and-replace across two implementations.
 *
 * Cross-filtering semantics live in `filterKey`: a group's counts are computed
 * with every *other* active filter applied but not its own, which is what stops
 * selecting "Salud" from zeroing every other area (contract, `Facets`).
 */

import type { FacetGroupKey } from './contract';
import {
  ACCREDITATION_STATUS_LABELS,
  ENROLLMENT_STATUS_LABELS,
  LEVEL_LABELS,
  MANAGEMENT_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
} from './labels';
import type { ArrayFilterKey } from './params';
import type { ProgramSearchRow } from './row';

/**
 * Where a group's option list comes from:
 * - `enum` — the fixed vocabulary, always rendered, zero counts included, so
 *   the rail does not reflow as the user filters.
 * - `taxonomy` — the seeded `areas` table, in its own sort order.
 * - `dynamic` — whatever is in the data (cities: ~200 of them, listing the
 *   empty ones would be noise).
 */
export type FacetUniverse = 'enum' | 'taxonomy' | 'dynamic';

export interface FacetGroupDef {
  key: FacetGroupKey;
  /** The filter this group owns, and therefore the one its counts ignore. */
  filterKey: ArrayFilterKey;
  universe: FacetUniverse;
  /** Fixed vocabulary → label, for `universe: 'enum'`. */
  labels?: Record<string, string>;
  valueOf: (row: ProgramSearchRow) => string | null;
  labelOf: (row: ProgramSearchRow) => string;
}

export const FACET_GROUPS: readonly FacetGroupDef[] = [
  {
    key: 'areas',
    filterKey: 'areaSlugs',
    universe: 'taxonomy',
    valueOf: (row) => row.areaSlug,
    labelOf: (row) => row.areaSlug ?? '',
  },
  {
    key: 'levels',
    filterKey: 'levels',
    universe: 'enum',
    labels: LEVEL_LABELS,
    valueOf: (row) => row.level,
    labelOf: (row) => LEVEL_LABELS[row.level],
  },
  {
    key: 'managements',
    filterKey: 'managements',
    universe: 'enum',
    labels: MANAGEMENT_LABELS,
    valueOf: (row) => row.management,
    labelOf: (row) => MANAGEMENT_LABELS[row.management],
  },
  {
    key: 'modalities',
    filterKey: 'modalities',
    universe: 'enum',
    labels: MODALITY_LABELS,
    valueOf: (row) => row.modality,
    labelOf: (row) => MODALITY_LABELS[row.modality],
  },
  {
    key: 'shifts',
    filterKey: 'shifts',
    universe: 'enum',
    labels: SHIFT_LABELS,
    valueOf: (row) => row.shift,
    labelOf: (row) => SHIFT_LABELS[row.shift],
  },
  {
    key: 'cities',
    filterKey: 'citySlugs',
    universe: 'dynamic',
    valueOf: (row) => row.citySlug,
    labelOf: (row) => row.cityName,
  },
  {
    key: 'accreditationStatuses',
    filterKey: 'accreditationStatuses',
    universe: 'enum',
    labels: ACCREDITATION_STATUS_LABELS,
    valueOf: (row) => row.accreditationStatus,
    labelOf: (row) => ACCREDITATION_STATUS_LABELS[row.accreditationStatus],
  },
  {
    key: 'enrollmentStatuses',
    filterKey: 'enrollmentStatuses',
    universe: 'enum',
    labels: ENROLLMENT_STATUS_LABELS,
    valueOf: (row) => row.enrollmentStatus,
    labelOf: (row) => ENROLLMENT_STATUS_LABELS[row.enrollmentStatus],
  },
];

export const FACET_GROUP_BY_KEY = new Map(FACET_GROUPS.map((group) => [group.key, group]));

/** Area slug → display name, from the seeded taxonomy. Cheap enough to pass around. */
export interface AreaOption {
  slug: string;
  name: string;
}
