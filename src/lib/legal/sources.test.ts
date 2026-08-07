import { describe, expect, it } from 'vitest';

import { DATA_SOURCES } from './sources';

/**
 * `data-sources.md` §2 makes attribution the defence for republishing public
 * register data, and PR-15's acceptance criteria name the four registers by
 * name. These assert the page cannot quietly lose one.
 */
describe('DATA_SOURCES', () => {
  it('lists the four official registers the site is built on', () => {
    const ids = DATA_SOURCES.map((source) => source.id);
    expect(ids).toContain('cones');
    expect(ids).toContain('aneaes');
    expect(ids).toContain('datos-gov-py');
    expect(ids).toContain('mec');
  });

  it('links every official register over https', () => {
    for (const id of ['cones', 'aneaes', 'datos-gov-py', 'mec']) {
      const source = DATA_SOURCES.find((entry) => entry.id === id);
      expect(source?.url, `${id} must carry a link`).toMatch(/^https:\/\//);
    }
  });

  it('gives every source a caveat — a source listed without one reads as endorsed', () => {
    for (const source of DATA_SOURCES) {
      expect(source.caveat.length, `${source.id} needs a caveat`).toBeGreaterThan(0);
      expect(source.provides.length).toBeGreaterThan(0);
      expect(source.refresh.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids, since they are the anchors on the page', () => {
    const ids = DATA_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
