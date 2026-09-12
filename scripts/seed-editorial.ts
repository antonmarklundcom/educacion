/**
 * Editorial copy seed — writes `careers.description_md` from
 * `data/editorial/careers/<slug>.md`, and only where the column is currently
 * NULL (PR-63, `docs/pr-plan.md`).
 *
 * Idempotent and non-destructive by construction: the write itself is
 * conditioned on `description_md IS NULL`
 * (`setCareerDescriptionIfNull` in `src/db/queries/careers.ts`), so
 * re-running this script writes nothing on a second pass, and it can never
 * clobber copy an admin already wrote through `/admin/carreras` — that is
 * the whole point of "seeded only where null" (`docs/review-2026-09.md` §F-4).
 *
 * All SQL lives in `src/db/queries/careers.ts` (CLAUDE.md rule 5); this
 * script only reads the filesystem and reports counts.
 *
 *   $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
 *   npx tsx scripts/seed-editorial.ts
 *
 * tsx does NOT load .env — see docs/deployment.md §5.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createDb, createPool } from '../src/db';
import { listAllCareerSlugs, setCareerDescriptionIfNull } from '../src/db/queries/careers';

const CAREERS_DIR = path.join(process.cwd(), 'data/editorial/careers');

interface CareerFile {
  slug: string;
  descriptionMd: string;
}

function loadCareerFiles(): CareerFile[] {
  return readdirSync(CAREERS_DIR)
    .filter((name) => name.endsWith('.md') && name !== '_index.md')
    .map((name) => ({
      slug: name.replace(/\.md$/, ''),
      descriptionMd: readFileSync(path.join(CAREERS_DIR, name), 'utf-8').trim(),
    }));
}

export async function seedEditorial(database: ReturnType<typeof createDb>): Promise<void> {
  const files = loadCareerFiles();
  const knownSlugs = new Set((await listAllCareerSlugs(database)).map((c) => c.slug));

  let written = 0;
  let skippedNotFound = 0;
  let skippedNotNull = 0;

  for (const file of files) {
    if (!knownSlugs.has(file.slug)) {
      console.log(`seed-editorial: skip ${file.slug} — no matching career in the taxonomy yet`);
      skippedNotFound += 1;
      continue;
    }

    const wrote = await setCareerDescriptionIfNull(file.slug, file.descriptionMd, database);
    if (wrote) {
      written += 1;
    } else {
      console.log(`seed-editorial: skip ${file.slug} — description_md already set`);
      skippedNotNull += 1;
    }
  }

  console.log(
    `seed-editorial: files=${files.length} written=${written} ` +
      `skipped_not_found=${skippedNotFound} skipped_already_set=${skippedNotNull}`,
  );
}

async function main() {
  const pool = createPool();
  const db = createDb(pool);

  try {
    await seedEditorial(db);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
