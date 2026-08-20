/**
 * `expirePublicReads()` against the real `revalidateTag` (PR-43).
 *
 * The independent review found this function untested: both of its guards could
 * be deleted with the whole suite green, because the only thing exercising them
 * was `isMissingWorkStore()` compared against a hand-built error — a predicate
 * checked against its own fixture, which would stay green if the function
 * ignored the predicate entirely.
 *
 * So these tests run the shipped function inside Next's own async storages,
 * exactly as a Server Action and a render do, and assert the observable effect:
 * `revalidateTag` pushes onto `workStore.pendingRevalidatedTags`, and that is
 * what the incremental cache acts on when the request finishes.
 */

import { describe, expect, it } from 'vitest';
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external';

import { expirePublicReads } from './next-cache';
import { PUBLIC_READ_TAG } from './tags';

/** The two fields `revalidateTag` reads off the work store, and nothing else. */
function workStore(): {
  incrementalCache: unknown;
  route: string;
  pendingRevalidatedTags?: string[];
} {
  return { incrementalCache: {}, route: '/carreras' };
}

function runInWork<T>(store: object, phase: 'action' | 'render' | null, body: () => T): T {
  const run = () => body();
  return workAsyncStorage.run(store as never, () =>
    phase === null ? run() : workUnitAsyncStorage.run({ type: 'request', phase } as never, run),
  );
}

describe('expirePublicReads', () => {
  it('really expires the tag from an action-phase request', () => {
    // A Server Action and a route handler both look like this. It is the path
    // `rebuildProgramSearch()` takes on every admin and panel write.
    const store = workStore();
    runInWork(store, 'action', () => expirePublicReads());

    expect(store.pendingRevalidatedTags).toContain(PUBLIC_READ_TAG);
  });

  it('does not throw where there is no work store at all', () => {
    // `npm run search:rebuild` — the CLI calls `rebuildProgramSearch()` in a
    // process that has no cache to expire. Swallowing E263 is what keeps that
    // script working; if this throws, the nightly rebuild from a shell dies.
    expect(() => expirePublicReads()).not.toThrow();
  });

  it('lets a call during render through, because that one is a real bug', () => {
    // `revalidateTag` during render is E7. §27.4 claims only E263 is swallowed;
    // this is the assertion behind that sentence. Remove the `isMissingWorkStore`
    // check from the catch and this test goes green in the wrong direction.
    expect(() => runInWork(workStore(), 'render', () => expirePublicReads())).toThrow(
      /during render/,
    );
  });

  it('does not swallow an unrelated throw from revalidateTag', () => {
    // The same guard, stated as a property rather than as a code path: any error
    // that is not "there is no work store" must reach the caller.
    const store = {
      get incrementalCache(): never {
        throw new Error('boom');
      },
      route: '/carreras',
    };
    expect(() => runInWork(store, 'action', () => expirePublicReads())).toThrow('boom');
  });
});
