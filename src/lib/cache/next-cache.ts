/**
 * The caching primitive every public read path goes through (PR-43).
 *
 * `unstable_cache` is the mechanism, but calling it directly from a query is a
 * trap for three reasons this module exists to close:
 *
 * ### 1. A cache hit is not the object the function returned
 *
 * `unstable_cache` stores `JSON.stringify(result)` and returns
 * `JSON.parse(body)` on a hit — but returns the **live object** on a miss. So a
 * `Date` in the payload is a `Date` on the first request and an ISO *string* on
 * every request after it, and the code that reads it works in dev, works on the
 * first hit in production, and then quietly starts formatting `[object String]`
 * or throwing. Nothing in the type system notices: the miss path types check.
 *
 * This module makes the two paths identical by construction. A caller supplies
 * `load()` returning a **JSON-plain wire value** and `decode(wire)` turning it
 * back into the domain object, and `decode` runs on both paths. `load` is
 * therefore the only place a `Date` may be converted, and there is a test that
 * the wire form survives `JSON.parse(JSON.stringify(…))` unchanged.
 *
 * ### 2. Derived facts must not be cached
 *
 * A price's "dato desactualizado" warning is a function of `verified_at` **and
 * the current time** (CLAUDE.md rule 3). Cache the warning and it can outlive
 * the boundary it describes: an entry filled the day before a price turns
 * twelve months old would keep saying "vigente" for the rest of its TTL.
 * Because `decode` runs on every read, anything time-dependent is computed
 * there, from the cached `verified_at`, against the *request's* clock — one
 * object, exactly as `priceDisplay()` requires.
 *
 * ### 3. It has to work where there is no Next runtime
 *
 * `npm run search:bench`, `npm run search:rebuild` and the unit tests call the
 * same read paths outside a request. `unstable_cache` throws `E469`
 * ("incrementalCache missing") there, and `revalidateTag` throws `E263`. Both
 * mean "there is no cache in this process", which is not an error — so both are
 * translated into the uncached behaviour, and **only** those two codes are:
 * anything else propagates.
 */

import { revalidateTag, unstable_cache } from 'next/cache';

import { PUBLIC_READ_TAG, PUBLIC_READ_TTL_SECONDS } from './tags';

/**
 * `unstable_cache` outside a request scope. Next attaches a stable
 * `__NEXT_ERROR_CODE` to its invariants, which is a far better discriminator
 * than the message text — an upgrade that reworded the message would not
 * silently turn caching off.
 */
export function isMissingIncrementalCache(error: unknown): boolean {
  return nextErrorCode(error) === 'E469';
}

/** `revalidateTag` outside a request scope — the CLI rebuild, and tests. */
export function isMissingWorkStore(error: unknown): boolean {
  return nextErrorCode(error) === 'E263';
}

function nextErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE;
  return typeof code === 'string' ? code : undefined;
}

/**
 * The shape `unstable_cache` may hold without `JSON.stringify` changing it.
 *
 * Everything JSON does not round-trip maps to `never`, so a wire type
 * containing one cannot satisfy `load`'s return type below and the build stops
 * at the call site. That is the mechanism — there is no `extends` clause on
 * `CachedRead`; a constraint written as `Wire extends JsonPlain<Wire>` is
 * circular and TypeScript rejects it (TS2313), which is why the check lives on
 * `load` instead.
 *
 * What it catches, each for a different reason:
 *
 * - `Date` → an ISO string on a hit, a `Date` on a miss.
 * - `Map` / `Set` → `{}`. Both are also caught by the mapped branch below,
 *   which turns their methods into `never`; they are named here so the error
 *   points at the type rather than at `get`.
 * - `bigint` → `JSON.stringify` **throws**, at the moment the entry is written.
 * - `symbol`, a function → silently dropped.
 * - `undefined` → the key vanishes, so `decode` sees a *present* key on a miss
 *   and an *absent* one on a hit. `-?` on the mapped branch is what makes an
 *   optional property fail rather than pass, since `{ a?: string }` is not
 *   assignable to `{ a: string }`.
 *
 * `null` is deliberately not here: JSON round-trips it exactly, and every
 * nullable column on a cached row relies on that.
 *
 * `json-plain.test-d.ts` compiles a case for each of these.
 */
type NotJsonPlain = Date | Map<unknown, unknown> | Set<unknown> | RegExp | bigint | symbol;

export type JsonPlain<T> = T extends NotJsonPlain
  ? never
  : T extends undefined
    ? never
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T extends (...args: any[]) => unknown
      ? never
      : T extends (infer U)[]
        ? JsonPlain<U>[]
        : T extends object
          ? { [K in keyof T]-?: JsonPlain<T[K]> }
          : T;

export interface CachedRead<Wire, T> {
  /**
   * A stable name for the read path. Together with `key` it is the whole
   * cache identity, so it must not collide with another read path's name.
   */
  name: string;
  /**
   * Everything that changes the result, as one canonical string. Two calls
   * that must return the same rows have to produce the same key, and two that
   * must not, must not — see `searchCacheKey()` for the catalog's version and
   * the test that walks every filter.
   */
  key: string;
  /**
   * The uncached read, and the only place the round-trip is enforced: its
   * return type is `JsonPlain<Wire>`, so a `Wire` holding anything JSON would
   * change makes this property impossible to satisfy and the build fails here,
   * at the call site. Do not relax it to `Promise<Wire>` — that is the whole
   * guard.
   */
  load: () => Promise<JsonPlain<Wire>>;
  /**
   * Wire → domain. Runs on every read, hit or miss, so this is where anything
   * derived from the current time belongs. `passthrough` where the payload is
   * already the domain object and nothing in it is derived from a clock.
   */
  decode: (wire: Wire) => T;
}

/**
 * Read through the public cache.
 *
 * The `unstable_cache` wrapper is built per call, which is free: its identity
 * comes from `load.toString()` plus `keyParts`, both stable for a given call
 * site, and never from the closed-over arguments — which is why `key` has to
 * carry them.
 */
export async function cachedRead<Wire, T>(spec: CachedRead<Wire, T>): Promise<T> {
  const cached = unstable_cache(spec.load, [spec.name, spec.key], {
    tags: [PUBLIC_READ_TAG],
    revalidate: PUBLIC_READ_TTL_SECONDS,
  });

  let wire: JsonPlain<Wire>;
  try {
    wire = await cached();
  } catch (error) {
    if (!isMissingIncrementalCache(error)) throw error;
    // No incremental cache in this process (a `tsx` script, or a unit test).
    // Reading uncached is the correct behaviour, not a degradation.
    wire = await spec.load();
  }

  // `JsonPlain<Wire>` is `Wire` with every non-JSON member mapped to `never`;
  // `load`'s return type is what proves there was none, so the two are the same
  // type at every call site that compiles.
  return spec.decode(wire as Wire);
}

/**
 * Expire every cached public read.
 *
 * Called by `rebuildProgramSearch()`, which is the single funnel every catalog
 * write already passes through — see `tags.ts` for why the granularity is one
 * tag and not one per entity.
 *
 * A `Route … used "revalidateTag" during render` error (`E7`) is a real bug and
 * is deliberately **not** swallowed here: only "there is no work store at all"
 * is.
 */
export function expirePublicReads(): void {
  try {
    revalidateTag(PUBLIC_READ_TAG);
  } catch (error) {
    if (!isMissingWorkStore(error)) throw error;
  }
}

/**
 * `decode` for a payload that is already the domain object and holds nothing
 * derived from a clock. `JsonPlain` has already proved it survives the JSON
 * round-trip unchanged, so returning it is not a shortcut.
 */
export function passthrough<T>(value: T): T {
  return value;
}
