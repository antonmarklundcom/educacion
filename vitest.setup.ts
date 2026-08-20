/**
 * Next expects `AsyncLocalStorage` as a global — its server runtime installs it
 * before anything under `next/dist/server` is imported. Vitest is not that
 * runtime, so importing `next/cache` (which `src/lib/cache` does) throws
 * "Invariant: AsyncLocalStorage accessed in runtime where it is not available"
 * before any of our code runs.
 *
 * Node has the class; it is just not global. Installing it here is what lets
 * the cache module be tested as shipped, rather than stubbed — and it is also
 * what lets every *other* suite import a cached read path and get the uncached
 * fallback (`E469`) instead of an unrelated crash.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const globals = globalThis as { AsyncLocalStorage?: typeof AsyncLocalStorage };
globals.AsyncLocalStorage ??= AsyncLocalStorage;
