import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { parseArgs, rehost, type LighthouseConfig } from './lighthouse';

const config = (): LighthouseConfig => ({
  ci: {
    collect: {
      url: ['https://educacion.com.py/', 'https://educacion.com.py/carreras'],
    },
  },
});

describe('rehost', () => {
  it('keeps every path and swaps only the origin', () => {
    expect(rehost(config(), 'http://localhost:3000').ci.collect.url).toEqual([
      'http://localhost:3000/',
      'http://localhost:3000/carreras',
    ]);
  });

  it('ignores a path on the base URL — the budget owns the paths', () => {
    expect(rehost(config(), 'http://localhost:3000/ignored').ci.collect.url).toEqual([
      'http://localhost:3000/',
      'http://localhost:3000/carreras',
    ]);
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(rehost(config(), 'http://localhost:3000/').ci.collect.url[1]).toBe(
      'http://localhost:3000/carreras',
    );
  });

  it('throws rather than silently auditing production on a typo', () => {
    expect(() => rehost(config(), 'localhost:3000')).toThrow();
  });

  it('does not mutate the config it was handed', () => {
    const original = config();
    rehost(original, 'http://localhost:3000');
    expect(original.ci.collect.url[0]).toBe('https://educacion.com.py/');
  });
});

describe('lighthouserc.json', () => {
  const rc = JSON.parse(readFileSync('lighthouserc.json', 'utf8'));

  it('audits on the mobile profile the budget is written against', () => {
    // PR-34 shipped `preset: "desktop"` alongside mobile emulation; the preset
    // won on the one field nothing below overrode (the user agent) and cost two
    // audits. Nothing may reintroduce it.
    expect(rc.ci.collect.settings.preset).toBeUndefined();
    expect(rc.ci.collect.settings.formFactor).toBe('mobile');
    expect(rc.ci.collect.settings.screenEmulation.mobile).toBe(true);
  });

  it('identifies as Lighthouse so Next serves the crawler HTML', () => {
    // Without the token Next streams metadata and `meta-description` fails on
    // every page. architecture.md §36.
    expect(rc.ci.collect.settings.emulatedUserAgent).toMatch(/Chrome-Lighthouse$/);
  });
});

describe('parseArgs', () => {
  it('defaults to production and passes everything else through', () => {
    expect(parseArgs(['--verbose'])).toEqual({
      base: 'https://educacion.com.py',
      passthrough: ['--verbose'],
    });
  });

  it('takes --url out of the passthrough and leaves its neighbours', () => {
    expect(parseArgs(['--verbose', '--url', 'http://localhost:3000', '--x=1'])).toEqual({
      base: 'http://localhost:3000',
      passthrough: ['--verbose', '--x=1'],
    });
  });

  it('rejects --url with nothing after it', () => {
    expect(() => parseArgs(['--url'])).toThrow(/needs a value/);
  });
});
