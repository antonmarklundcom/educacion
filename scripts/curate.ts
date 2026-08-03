/**
 * `npm run curate` — match the raw layer onto the curated tables.
 *
 * Reads `source_records` (written by `npm run import:cones` /
 * `npm run import:aneaes`), matches every row onto institutions / programs /
 * campuses / offerings / accreditations, applies what is safe and queues
 * everything else into `curation_conflicts`.
 *
 *   $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
 *   npm run curate
 *   npm run curate -- --dry-run          # decide everything, write nothing
 *   npm run curate -- --source ANEAES    # one source only
 *
 * tsx does NOT load .env — see docs/deployment.md §5.
 *
 * Safe to re-run: a second pass re-derives the same proposals, classifies them
 * `unchanged` and writes nothing. Run `npm run search:rebuild` afterwards —
 * `program_search` is derived from the tables this command writes.
 */

import { createDb, createPool } from '../src/db';
import { curate, type CurationPassSummary } from '../src/db/queries/curation';
import type { SourceName } from '../src/lib/ingest';

const CURATABLE_SOURCES: readonly SourceName[] = ['CONES', 'ANEAES', 'DATOS_GOV_PY'];

export function parseArgs(argv: readonly string[]): { dryRun: boolean; sources?: SourceName[] } {
  const options: { dryRun: boolean; sources?: SourceName[] } = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = (inline: string) => {
      const value = inline || argv[++i];
      if (!value) throw new Error('--source needs a source name');
      const upper = value.toUpperCase() as SourceName;
      if (!CURATABLE_SOURCES.includes(upper)) {
        throw new Error(`Unknown source "${value}". One of: ${CURATABLE_SOURCES.join(', ')}`);
      }
      (options.sources ??= []).push(upper);
    };

    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--source') take('');
    else if (arg.startsWith('--source=')) take(arg.slice('--source='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printSummary(summary: CurationPassSummary): void {
  console.log('');
  console.log(`${summary.source} — run #${summary.importRunId || '(dry run)'}`);
  console.log(`  raw records        ${summary.rowsIn}`);
  console.log(`  institution match  ${summary.autoMatchRate}%`);
  console.log(`    certain          ${summary.stats.certain}`);
  console.log(`    fuzzy (proposed) ${summary.stats.fuzzy}`);
  console.log(`    ambiguous        ${summary.stats.ambiguous}`);
  console.log(`  applied            ${summary.report.applied}`);
  console.log(`  queued for review  ${summary.report.queued}`);
  console.log(`  unchanged          ${summary.report.unchanged}`);
  console.log(`  deferred to next   ${summary.stats.deferred}`);
  console.log(`  aliases learned    ${summary.aliasesWritten}`);

  for (const [entity, counts] of Object.entries(summary.report.byEntity)) {
    console.log(`    ${entity.padEnd(15)} ${counts.applied} applied · ${counts.queued} queued`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pool = createPool();
  const db = createDb(pool);

  try {
    const summaries = await curate({
      db,
      sources: options.sources,
      dryRun: options.dryRun,
      onProgress: (message) => console.log(message),
    });

    for (const summary of summaries) printSummary(summary);

    const queued = summaries.reduce((total, summary) => total + summary.report.queued, 0);
    if (queued > 0) {
      console.log('');
      console.log(`${queued} rows need a human. Nothing on a conflict was published.`);
    }
    if (options.dryRun) {
      console.log('');
      console.log('Dry run — nothing was written.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
