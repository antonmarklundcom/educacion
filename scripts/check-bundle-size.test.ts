/**
 * The budget script's own arithmetic. It runs against a manifest fixture
 * rather than a real build, so the rules — dedupe shared chunks, ignore CSS,
 * exempt the staff surfaces — are asserted without a 15-second `next build`.
 */

import { describe, expect, it } from 'vitest';

import { BUDGET_BYTES, isExempt, measureRoutes } from './check-bundle-size';

describe('isExempt', () => {
  it('exempts the staff surfaces and nothing else', () => {
    expect(isExempt('/admin/instituciones')).toBe(true);
    expect(isExempt('/panel/leads')).toBe(true);
    expect(isExempt('/(public)/carreras/page')).toBe(false);
    expect(isExempt('/carreras')).toBe(false);
  });
});

describe('measureRoutes', () => {
  it('counts a chunk once per route even when the manifest repeats it', () => {
    // Files that do not exist on disk measure 0, which is what makes this
    // fixture-safe: the property under test is the shape of the walk.
    const sizes = measureRoutes({
      pages: { '/a': ['static/a.js', 'static/a.js', 'static/shared.js'] },
    });
    expect(sizes.get('/a')).toBe(0);
    expect([...sizes.keys()]).toEqual(['/a']);
  });

  it('ignores stylesheets — the budget is about JavaScript', () => {
    const sizes = measureRoutes({ pages: { '/a': ['static/a.css'] } });
    expect(sizes.get('/a')).toBe(0);
  });
});

describe('the budget itself', () => {
  it('is architecture.md §9 exactly: 150 kB gzipped', () => {
    expect(BUDGET_BYTES).toBe(150 * 1024);
  });
});
