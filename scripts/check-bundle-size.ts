/**
 * The JS budget, enforced in CI (PR-34).
 *
 * `architecture.md` §9 sets **150 kB gzipped of JavaScript on public pages**
 * and says PR-34 enforces it. This is that: it reads the manifests `next build`
 * already wrote, gzips every chunk a route loads, and fails the build if a
 * public route is over budget.
 *
 * ### Why it measures rather than parsing `next build`'s table
 *
 * The table is human output whose format and compression choices belong to
 * Next, not to us, and a budget that depends on scraping it breaks on an
 * upgrade with no signal. This reads the manifest and gzips the actual files at
 * level 9, so the number is ours, is reproducible, and is never more optimistic
 * than what a CDN serves.
 *
 * ### Why only public routes
 *
 * `/admin` and `/panel` are authenticated tools used on a laptop, on purpose:
 * `AdminForm` exists because `useActionState` keeps a half-filled form alive
 * through a validation error, and that is worth its kilobytes to a staff member
 * in a way it would not be to a student on 4G. The budget guards what the
 * budget was written for.
 *
 *   npm run perf:budget          # after npm run build
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** `architecture.md` §9. Gzipped bytes of JS loaded by one public route. */
export const BUDGET_BYTES = 150 * 1024;

/** Routes excluded from the budget, each with the reason it is excluded. */
export const EXEMPT_PREFIXES = [
  '/admin', // staff tooling on a laptop — see the docstring
  '/panel', // same: an institution's back office, not a student's phone
] as const;

const NEXT_DIR = join(process.cwd(), '.next');

interface AppBuildManifest {
  pages: Record<string, string[]>;
}

function gzippedSize(file: string): number {
  const path = join(NEXT_DIR, file);
  try {
    statSync(path);
  } catch {
    return 0; // A manifest entry with no file on disk is not a download.
  }
  return gzipSync(readFileSync(path), { level: 9 }).byteLength;
}

export function isExempt(route: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => route.startsWith(prefix));
}

/** Route → gzipped bytes of every JS chunk it loads, deduplicated. */
export function measureRoutes(manifest: AppBuildManifest): Map<string, number> {
  const sizes = new Map<string, number>();
  const cache = new Map<string, number>();

  for (const [route, files] of Object.entries(manifest.pages)) {
    let total = 0;
    for (const file of new Set(files)) {
      if (!file.endsWith('.js')) continue;
      let size = cache.get(file);
      if (size == null) {
        size = gzippedSize(file);
        cache.set(file, size);
      }
      total += size;
    }
    sizes.set(route, total);
  }

  return sizes;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function main(): void {
  let manifest: AppBuildManifest;
  try {
    manifest = JSON.parse(
      readFileSync(join(NEXT_DIR, 'app-build-manifest.json'), 'utf8'),
    ) as AppBuildManifest;
  } catch {
    console.error(
      'No .next/app-build-manifest.json — run `npm run build` before `npm run perf:budget`.',
    );
    process.exitCode = 1;
    return;
  }

  const sizes = [...measureRoutes(manifest)].sort((a, b) => b[1] - a[1]);
  const offenders = sizes.filter(([route, size]) => !isExempt(route) && size > BUDGET_BYTES);

  const worst = sizes.filter(([route]) => !isExempt(route)).slice(0, 8);
  console.log(`JS budget: ${kb(BUDGET_BYTES)} gzipped per public route.\n`);
  for (const [route, size] of worst) {
    console.log(`  ${size > BUDGET_BYTES ? '✗' : '·'} ${kb(size).padStart(9)}  ${route}`);
  }

  if (offenders.length > 0) {
    console.error(
      `\n${offenders.length} public ${offenders.length === 1 ? 'route is' : 'routes are'} over budget.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log('\nEvery public route is within budget.');
}

if (process.argv[1]?.endsWith('check-bundle-size.ts')) main();
