/**
 * `npm run search:rebuild`
 *
 * Rebuilds `program_search` from the curated tables. Safe to re-run: the whole
 * replace happens inside one transaction, so either the new index is complete
 * or the old one is untouched (see `src/db/queries/rebuild-search.ts` for why
 * that means DELETE rather than TRUNCATE).
 *
 *   $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
 *   npm run search:rebuild
 *
 * tsx does NOT load .env — see docs/deployment.md §5.
 *
 * Runs nightly via `/api/cron/rebuild-search` (architecture.md §10) and after
 * admin writes via the debounced job.
 */

import { createDb, createPool } from '../src/db';
import { rebuildProgramSearch } from '../src/db/queries/rebuild-search';

async function main() {
  const pool = createPool();
  const db = createDb(pool);

  try {
    const summary = await rebuildProgramSearch({
      db,
      onProgress: (message) => console.log(message),
    });

    console.log('');
    console.log(`Indexed              ${summary.rows} offerings`);
    console.log(`  published          ${summary.published}`);
    console.log(`  displayable price  ${summary.withDisplayablePrice}`);
    console.log(`  accreditation data ${summary.withAccreditationBadge}`);
    console.log(`Took                 ${summary.tookMs} ms`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
