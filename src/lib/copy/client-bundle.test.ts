/**
 * The catalog must not ship server-only copy to the browser (PR-47).
 *
 * This is not a style preference. `perf:budget` caught the first version of
 * this PR putting **+2.2 kB gzipped on every public route** — the whole
 * catalog, empty-state paragraphs and admin-shaped strings included — because
 * `Footer` imported the composed `@/lib/copy` barrel and `src/app/error.tsx`,
 * a client boundary, imports `Footer`. Nothing in the diff looked like a
 * client component. The import graph is the only place that fact is visible.
 *
 * So the rule is a reachability rule, not a `'use client'` rule: **anything a
 * client boundary can reach imports its slice** (`@/lib/copy/nav`,
 * `@/lib/copy/lead`, …). The composed barrel, the locale index and the
 * server-only slices stay behind the server boundary, and this test walks the
 * graph to prove it — see `architecture.md` §30.2.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');

/**
 * Modules whose contents must never reach a browser bundle.
 *
 * `footer.ts` is deliberately **not** on this list: `src/app/error.tsx` renders
 * the footer client-side, and the R-07 disclaimer is required on that page like
 * every other (CLAUDE.md rule 9). Six short strings is the honest cost of that
 * requirement — the empty-state paragraphs in `browse.ts` are not.
 */
const SERVER_ONLY = ['lib/copy/index.ts', 'lib/copy/es-py.ts', 'lib/copy/browse.ts'].map((p) =>
  join(SRC, p),
);

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walkFiles(full);
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

const ALL_FILES = walkFiles(SRC);

function resolveImport(spec: string, fromFile: string): string | null {
  const base = spec.startsWith('@/')
    ? join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? resolve(dirname(fromFile), spec)
      : null;
  if (base === null) return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this candidate */
    }
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specs = [...source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].map((m) => m[1]);
  return specs.map((spec) => resolveImport(spec, file)).filter((p): p is string => p !== null);
}

/** Every file that declares a client boundary. */
const CLIENT_ENTRIES = ALL_FILES.filter((file) =>
  /^\s*'use client';\s*$/m.test(readFileSync(file, 'utf8')),
);

/** Transitive closure of the client entries, with the entry that reached each module. */
function clientReachable(): Map<string, string[]> {
  const reached = new Map<string, string[]>();
  for (const entry of CLIENT_ENTRIES) {
    const stack = [entry];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      reached.set(file, [...(reached.get(file) ?? []), entry]);
      stack.push(...importsOf(file));
    }
  }
  return reached;
}

describe('the copy catalog and the client bundle', () => {
  const reachable = clientReachable();

  it('finds the client boundaries at all', () => {
    // A resolver that quietly matched nothing would make every assertion below vacuous.
    expect(CLIENT_ENTRIES.length).toBeGreaterThan(20);
    expect(reachable.has(join(SRC, 'components/layout/Footer.tsx'))).toBe(true);
  });

  it.each(SERVER_ONLY)('keeps %s out of every client boundary', (module) => {
    const via = reachable.get(module);
    expect(
      via ? `reached from ${via.map((f) => relative(SRC, f)).join(', ')}` : 'not reachable',
    ).toBe('not reachable');
  });

  it('lets the browser-facing slices through, so the rule is a boundary and not a ban', () => {
    expect(reachable.has(join(SRC, 'lib/copy/lead.ts'))).toBe(true);
    expect(reachable.has(join(SRC, 'lib/copy/nav.ts'))).toBe(true);
    expect(reachable.has(join(SRC, 'lib/copy/footer.ts'))).toBe(true);
  });
});
