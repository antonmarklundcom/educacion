/**
 * The importer CLI's argument parsing.
 *
 * These flags decide how many requests hit a government server, so a
 * mis-parsed argument is a politeness problem, not a cosmetic one: an operator
 * who types `--max-institutions 3` expecting a probe and gets a full pass has
 * been failed by this file.
 */

import { describe, expect, it } from 'vitest';

import { parseArgs } from './import-source';

describe('parseArgs', () => {
  it('defaults to a full network run that writes', () => {
    expect(parseArgs([])).toEqual({
      dryRun: false,
      files: [],
      urls: [],
      followInstitutions: true,
    });
  });

  it('reads the probe flags in both spellings', () => {
    expect(parseArgs(['--max-institutions', '3']).maxInstitutions).toBe(3);
    expect(parseArgs(['--max-institutions=3']).maxInstitutions).toBe(3);
    expect(parseArgs(['--no-institutions']).followInstitutions).toBe(false);
  });

  it('refuses a bound it cannot understand rather than running unbounded', () => {
    expect(() => parseArgs(['--max-institutions', 'todas'])).toThrow(/non-negative number/);
    expect(() => parseArgs(['--max-institutions'])).toThrow(/non-negative number/);
    expect(() => parseArgs(['--max-institutions', '-1'])).toThrow(/non-negative number/);
  });

  it('collects repeated files and urls', () => {
    const options = parseArgs([
      '--dry-run',
      '--file',
      'a.html',
      '--file=b.html',
      '--url',
      'https://source.test/1',
    ]);
    expect(options.dryRun).toBe(true);
    expect(options.files).toEqual(['a.html', 'b.html']);
    expect(options.urls).toEqual(['https://source.test/1']);
  });

  it('rejects an unknown argument instead of silently ignoring it', () => {
    expect(() => parseArgs(['--dry-runn'])).toThrow(/Unknown argument/);
  });
});
