/**
 * Keeping `program_search` in step with an admin write.
 *
 * `architecture.md` §4 specifies the rebuild as "called automatically after any
 * admin write via a debounced job and nightly by cron". This is that debounced
 * job.
 *
 * ### Why debounced rather than immediate
 *
 * The rebuild replaces every row in the index inside a transaction. Editing
 * five offerings in a row would otherwise run it five times, each one holding a
 * write transaction over the table the public site is reading. A short trailing
 * window collapses a burst of edits into one rebuild, which is what an operator
 * working through a list actually produces.
 *
 * ### Why it does not block the action
 *
 * The mutation is committed before this is called. Making the operator wait for
 * a full index replace to see their own save would make every admin write feel
 * broken, and a failed rebuild is recoverable — the nightly cron and
 * `npm run search:rebuild` both fix it, and the previous index keeps serving in
 * the meantime because the rebuild deletes inside a transaction (§4.1).
 *
 * The trade is stated: for up to `DEBOUNCE_MS` after a save, the public index is
 * one edit stale. The admin's own screens read the curated tables directly, so
 * the operator never sees that lag on the row they just edited.
 */

import { rebuildProgramSearch } from '@/db/queries/rebuild-search';

export const DEBOUNCE_MS = 5_000;

const state = globalThis as unknown as {
  __educacionReindexTimer?: ReturnType<typeof setTimeout>;
  __educacionReindexRunning?: Promise<void>;
};

async function runRebuild(): Promise<void> {
  try {
    const summary = await rebuildProgramSearch();
    console.info(
      `[search] rebuilt after an admin write: ${summary.rows} rows, ` +
        `${summary.published} published, ${summary.tookMs} ms`,
    );
  } catch (error) {
    console.error(
      '[search] rebuild after an admin write failed. The previous index is still ' +
        'serving; the nightly cron will retry.',
      error,
    );
  }
}

/**
 * Ask for a rebuild. Returns immediately; the rebuild happens after the window.
 *
 * Never throws — a bookkeeping failure must not surface as a failed save.
 */
export function scheduleSearchRebuild(delayMs: number = DEBOUNCE_MS): void {
  if (state.__educacionReindexTimer) clearTimeout(state.__educacionReindexTimer);
  state.__educacionReindexTimer = setTimeout(() => {
    state.__educacionReindexTimer = undefined;
    // Serialize: a rebuild already in flight is awaited before the next starts,
    // so two overlapping transactions can never race over the same table.
    state.__educacionReindexRunning = (state.__educacionReindexRunning ?? Promise.resolve())
      .then(runRebuild)
      .catch(() => {});
  }, delayMs);
  // Node keeps the process alive for a pending timer; on a serverful host that
  // is harmless, but it must not hold a graceful shutdown open.
  state.__educacionReindexTimer.unref?.();
}

/** Run the rebuild now and wait for it — for the cron route and for scripts. */
export async function rebuildSearchNow(): Promise<void> {
  if (state.__educacionReindexTimer) {
    clearTimeout(state.__educacionReindexTimer);
    state.__educacionReindexTimer = undefined;
  }
  await runRebuild();
}
