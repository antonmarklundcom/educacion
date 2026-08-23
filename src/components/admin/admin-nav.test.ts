/**
 * The rail and the index agree (PR-50).
 *
 * `AdminNav`'s docstring and `/admin`'s both say the two lists match — "if you
 * add a screen, add it to both". Nothing held that, and they had already
 * drifted: PR-44 added `/admin/actividad` and `/admin/privacidad` to the rail
 * and not to the index, so two screens were reachable from one place and
 * invisible from the other. This is the check that would have caught it.
 *
 * Read off the sources rather than from a shared constant, deliberately: a
 * shared constant would make the test true by construction and would not have
 * caught the drift it exists for. Both files are plain literal lists.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function hrefs(file: string): string[] {
  const source = readFileSync(resolve(__dirname, file), 'utf8');
  return [...source.matchAll(/href:\s*'(\/admin[^']*)'/g)]
    .map((match) => match[1]!)
    .filter((href) => href !== '/admin')
    .sort();
}

const RAIL = hrefs('./AdminNav.tsx');
const INDEX = hrefs('../../app/admin/page.tsx');

describe('the admin rail and the admin index', () => {
  it('finds both lists at all', () => {
    expect(RAIL.length).toBeGreaterThan(15);
    expect(INDEX.length).toBeGreaterThan(15);
  });

  it('offers exactly the same screens', () => {
    expect(RAIL).toEqual(INDEX);
  });

  it('includes the console this PR added', () => {
    expect(RAIL).toContain('/admin/importaciones');
  });
});
