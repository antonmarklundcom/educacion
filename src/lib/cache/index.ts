/**
 * The public-read cache (PR-43). Read `tags.ts` for the invalidation rule and
 * `next-cache.ts` for why a raw `unstable_cache` call is not the interface.
 */

export {
  cachedRead,
  expirePublicReads,
  passthrough,
  type CachedRead,
  type JsonPlain,
} from './next-cache';
export { PUBLIC_READ_TAG, PUBLIC_READ_TTL_SECONDS } from './tags';
export { offeringsByIdsCacheKey, searchCacheKey } from './search-key';
export { decodeProgramSearchRow, encodeProgramSearchRow, type ProgramSearchRowWire } from './wire';
