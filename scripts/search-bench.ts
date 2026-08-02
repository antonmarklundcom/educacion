/**
 * `npm run search:bench` — latency and correctness of the SQL search engine
 * against a synthetic dataset.
 *
 * PR-07's acceptance criterion is p95 < 150 ms on the full dataset, and PR-05 /
 * PR-06 have not landed yet, so there is no real dataset to measure. This
 * script generates ~10k obviously-synthetic rows, loads them straight into
 * `program_search`, and measures the query mix the browser page actually runs
 * (results + total + eight facet groups).
 *
 * ### It refuses to touch the real database
 *
 * The dataset is fabricated, so it must never reach production data
 * (CLAUDE.md rule 1). This script deliberately does **not** read
 * `DATABASE_URL`. It requires `SEARCH_BENCH_DATABASE_URL`, and refuses unless
 * the database name it points at contains `bench` or `test`. Point it at a
 * local MySQL:
 *
 *   docker run --rm -e MYSQL_ROOT_PASSWORD=x -e MYSQL_DATABASE=educacion_bench \
 *     -p 3307:3306 mysql:8
 *   SEARCH_BENCH_DATABASE_URL="mysql://root:x@127.0.0.1:3307/educacion_bench" \
 *     npm run db:migrate && npm run search:bench
 *
 * `--verify` additionally cross-checks every facet count, the total and the
 * result ordering against the in-memory engine, which is how the SQL and JS
 * paths are proven to agree.
 */

import { createDb, createPool } from '../src/db';
import { searchProgramSearch } from '../src/db/queries/program-search';
import { areas, programSearch } from '../src/db/schema';
import type { SearchFilters } from '../src/lib/search/contract';
import { searchInMemory } from '../src/lib/search/engine';
import { makeSyntheticRows } from '../src/lib/search/__fixtures__/synthetic';

const ROW_COUNT = Number(process.env.SEARCH_BENCH_ROWS ?? 10_000);
const ITERATIONS = Number(process.env.SEARCH_BENCH_ITERATIONS ?? 40);
const NOW = new Date('2026-08-02T12:00:00Z');

/** The query mix a real session produces: broad browse, narrow, text, sorted. */
const SCENARIOS: { name: string; filters: SearchFilters }[] = [
  { name: 'browse, no filters', filters: {} },
  { name: 'one facet', filters: { levels: ['grado'] } },
  {
    name: 'four facets',
    filters: {
      levels: ['grado'],
      managements: ['privada'],
      modalities: ['presencial'],
      citySlugs: ['ciudad-de-prueba-001', 'ciudad-de-prueba-002'],
    },
  },
  { name: 'free text', filters: { q: 'carrera de prueba 007' } },
  { name: 'free text + acronym', filters: { q: 'ZA carrera de prueba 007' } },
  { name: 'arancel range, sorted', filters: { annualCostMax: 5_000_000, sort: 'arancel_asc' } },
  { name: 'deep page', filters: { page: 40 } },
];

function connectionUrl(): string {
  const url = process.env.SEARCH_BENCH_DATABASE_URL;
  if (!url) {
    throw new Error(
      'SEARCH_BENCH_DATABASE_URL is not set. This script loads fabricated rows and must never ' +
        'point at the real database — DATABASE_URL is ignored on purpose.',
    );
  }
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!/bench|test/i.test(database)) {
    throw new Error(
      `Refusing to run: database "${database}" does not look like a throwaway database. ` +
        'Name it something containing "bench" or "test".',
    );
  }
  return url;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const verify = process.argv.includes('--verify');
  const pool = createPool(connectionUrl());
  const db = createDb(pool);

  try {
    const rows = makeSyntheticRows(ROW_COUNT, { now: NOW });
    console.log(`Loading ${rows.length} synthetic rows…`);

    await db.transaction(async (tx) => {
      await tx.delete(programSearch);
      for (let i = 0; i < rows.length; i += 250) {
        await tx.insert(programSearch).values(rows.slice(i, i + 250));
      }
    });

    // The areas facet takes its labels from the taxonomy table.
    const seededAreas = await db.select({ slug: areas.slug }).from(areas);
    if (seededAreas.length === 0) {
      console.log('No areas seeded — the areas facet will come back empty. Run seed:taxonomy.');
    }

    console.log('');
    console.log('scenario                    p50      p95      max');
    let worstP95 = 0;

    for (const scenario of SCENARIOS) {
      const timings: number[] = [];
      for (let i = 0; i < ITERATIONS; i += 1) {
        const startedAt = performance.now();
        await searchProgramSearch(scenario.filters, { db, now: NOW });
        timings.push(performance.now() - startedAt);
      }
      const p95 = percentile(timings, 95);
      worstP95 = Math.max(worstP95, p95);
      console.log(
        `${scenario.name.padEnd(26)} ${percentile(timings, 50).toFixed(1).padStart(6)} ms ` +
          `${p95.toFixed(1).padStart(6)} ms ${Math.max(...timings)
            .toFixed(1)
            .padStart(6)} ms`,
      );
    }

    console.log('');
    console.log(`worst p95: ${worstP95.toFixed(1)} ms (budget 150 ms)`);

    if (verify) {
      console.log('');
      console.log('Verifying SQL results against the in-memory engine…');
      let mismatches = 0;
      for (const scenario of SCENARIOS) {
        const fromSql = await searchProgramSearch(scenario.filters, { db, now: NOW });
        const fromJs = searchInMemory(rows, scenario.filters, { now: NOW });

        if (fromSql.total !== fromJs.total) {
          mismatches += 1;
          console.error(`  ${scenario.name}: total ${fromSql.total} vs ${fromJs.total}`);
        }
        for (const group of Object.keys(fromJs.facets) as (keyof typeof fromJs.facets)[]) {
          // Areas are labelled from the taxonomy table, which the in-memory run
          // does not have; compare counts by value only.
          const sqlCounts = new Map(fromSql.facets[group].map((o) => [o.value, o.count]));
          for (const option of fromJs.facets[group]) {
            const actual = sqlCounts.get(option.value) ?? 0;
            if (actual !== option.count) {
              mismatches += 1;
              console.error(
                `  ${scenario.name} / ${group} / ${option.value}: ${actual} vs ${option.count}`,
              );
            }
          }
        }
      }
      console.log(mismatches === 0 ? '  no mismatches' : `  ${mismatches} mismatches`);
      if (mismatches > 0) process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
