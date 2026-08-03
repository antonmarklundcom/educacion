/**
 * Shared driver for `npm run import:cones` and `npm run import:aneaes`.
 *
 * Both importers do the same five things — open a run, fetch or read, parse,
 * write raw records, print a digest — and differ only in which collector they
 * call. Keeping that in one place means the run summary, the exit codes and
 * the `--dry-run` semantics cannot drift apart between sources.
 *
 * Usage:
 *   $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
 *   npm run import:cones
 *   npm run import:cones -- --dry-run
 *   npm run import:cones -- --file ./tmp/universidades.html --file ./tmp/carreras.html
 *
 * tsx does NOT load .env — see docs/deployment.md §5.
 *
 * `--file` is the documented fallback for when the government sites refuse the
 * request (they 403 whole networks — docs/data-sources.md §1): save the page
 * in a browser, then point the importer at it. `--dry-run` parses and reports
 * without opening a run or writing a row, which is the safe way to check a
 * parser against a freshly saved page.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createDb, createPool } from '../src/db';
import { runImport } from '../src/lib/ingest/repository';
import type { RawRecord, SourceInput, SourceName } from '../src/lib/ingest';

export interface CliOptions {
  dryRun: boolean;
  files: string[];
  urls: string[];
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { dryRun: false, files: [], urls: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--file') {
      const value = argv[i + 1];
      if (!value) throw new Error('--file needs a path');
      options.files.push(value);
      i += 1;
    } else if (arg.startsWith('--file=')) {
      options.files.push(arg.slice('--file='.length));
    } else if (arg === '--url') {
      const value = argv[i + 1];
      if (!value) throw new Error('--url needs a URL');
      options.urls.push(value);
      i += 1;
    } else if (arg.startsWith('--url=')) {
      options.urls.push(arg.slice('--url='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function runImporter<TPayload>(
  source: SourceName,
  collect: (input: SourceInput) => Promise<RawRecord<TPayload>[]>,
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const options = parseArgs(argv);
  const onProgress = (message: string) => console.log(message);

  const files = await Promise.all(
    options.files.map(async (file) => ({
      path: path.resolve(file),
      body: await readFile(file, 'utf8'),
    })),
  );

  const input: SourceInput = {
    files,
    urls: options.urls.length > 0 ? options.urls : undefined,
    onProgress,
  };

  // A dry run must not need a database — that is most of its value when
  // checking a parser against a page you just saved.
  if (options.dryRun) {
    const records = await collect(input);
    printDryRun(source, records);
    return;
  }

  const pool = createPool();
  const db = createDb(pool);

  try {
    const summary = await runImport(db, source, () => collect(input), { onProgress });

    console.log('');
    console.log(`Import run           #${summary.importRunId} (${summary.source})`);
    console.log(`Rows in              ${summary.rowsIn}`);
    console.log(`  new                ${summary.rowsNew}`);
    console.log(`  unchanged          ${summary.rowsUnchanged}`);
    if (summary.rowsNew === 0 && summary.rowsIn > 0) {
      console.log('');
      console.log('Nothing new — the source is unchanged since the last run.');
    }
  } finally {
    await pool.end();
  }
}

function printDryRun<TPayload>(source: SourceName, records: readonly RawRecord<TPayload>[]): void {
  console.log('');
  console.log(`Dry run (${source}) — parsed ${records.length} records, wrote nothing.`);

  const distinctChecksums = new Set(records.map((record) => record.checksum)).size;
  console.log(`Distinct checksums   ${distinctChecksums}`);
  if (distinctChecksums !== records.length) {
    console.log(`  (${records.length - distinctChecksums} duplicate rows collapse on insert)`);
  }

  const withExternalId = records.filter((record) => record.externalId != null).length;
  console.log(`With external id     ${withExternalId}`);

  // Sampling the parse is how a human catches a column that shifted, which is
  // the failure mode this parser is most exposed to.
  for (const record of records.slice(0, 3)) {
    console.log('');
    console.log(JSON.stringify(record.payload, null, 2));
  }
  if (records.length > 3) console.log(`\n… and ${records.length - 3} more.`);
}

export function main<TPayload>(
  source: SourceName,
  collect: (input: SourceInput) => Promise<RawRecord<TPayload>[]>,
) {
  runImporter(source, collect).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
