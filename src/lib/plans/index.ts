/**
 * The public plans read — the same shape as `@/lib/becas` and `@/lib/posts`
 * (CLAUDE.md rule 5). `/para-instituciones` (PR-26) renders the price table
 * from `listPlans()`, force-dynamic, per request.
 *
 * Unlike becas and posts, there is no write path here to teach
 * `expirePublicReads()` to: `plans` is written once by `npm run seed:plans`,
 * out of process, the same as `curate` (`cache/tags.ts`) — no cache exists in
 * that process to expire. A price change is a deploy-time seed re-run, not a
 * request the site serves, so the hour-long TTL backstop is the only clock
 * this needs.
 */

import { listPlans as listPlansQuery } from '@/db/queries/plans';
import { cachedRead, passthrough } from '@/lib/cache';
import type { PlanBand } from '@/lib/entitlements/bands';

export type { PlanBand } from '@/lib/entitlements/bands';

/** Every plan we sell, cheapest first. Cached. */
export function listPlans(): Promise<PlanBand[]> {
  return cachedRead<PlanBand[], PlanBand[]>({
    name: 'plans-list',
    key: 'all',
    load: () => listPlansQuery(),
    decode: passthrough,
  });
}
