/**
 * The catalog cache key (PR-43).
 *
 * PR-43's acceptance criterion is that "cache keys include every searchParam
 * that changes the result". Rather than hand-list the fields — which is how a
 * filter added later ends up silently sharing another filter's cache entry —
 * the key is built from `serializeSearchFilters()`, the same canonical form the
 * public URLs use. It is already exhaustive (`FILTER_PARAMS` is
 * `satisfies Record<keyof SearchFilters, string>`, so the compiler refuses a
 * filter without a parameter name), already sorted, and already drops defaults,
 * so `{ sort: 'relevancia' }` and `{}` correctly share one entry.
 *
 * `search-key.test.ts` walks every key of `FILTER_PARAMS` and asserts that
 * changing that one field changes the cache key.
 *
 * ### Why the date is in the key
 *
 * `searchProgramSearch` compares `admission_closes_on` and `price_expires_on`
 * against **today**, so the same filters legitimately mean different rows on
 * either side of midnight. Putting the date in the key means an entry can never
 * serve yesterday's meaning of "inscripción abierta"; the cost is that the
 * catalog cache cold-starts once a day, at the hour of the night the site is
 * quietest.
 */

import { toDateOnly } from '@/lib/search/accreditation';
import { serializeSearchFilters } from '@/lib/search/params';
import type { SearchFilters } from '@/lib/search/contract';

export function searchCacheKey(filters: SearchFilters, now: Date): string {
  return `${toDateOnly(now)}|${serializeSearchFilters(filters).toString()}`;
}

export function offeringsByIdsCacheKey(ids: readonly number[]): string {
  // Order is part of the answer — the comparador's columns follow the user's
  // selection — so the ids are not sorted before they become a key.
  return ids.join(',');
}
