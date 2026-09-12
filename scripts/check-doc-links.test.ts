import { describe, expect, it } from 'vitest';
import { checkAll, checkFile, findMarkdownFiles, headingSlugs, slugify } from './check-doc-links';

describe('slugify', () => {
  it('follows GitHub-style slug rules', () => {
    expect(slugify('The `force-dynamic` audit')).toBe('the-force-dynamic-audit');
    expect(slugify('What is not in the catalog, and why')).toBe(
      'what-is-not-in-the-catalog-and-why',
    );
  });
});

describe('headingSlugs', () => {
  it('disambiguates repeated headings the way GitHub does', () => {
    const slugs = headingSlugs('## Same\n\ntext\n\n## Same\n');
    expect(slugs.has('same')).toBe(true);
    expect(slugs.has('same-1')).toBe(true);
  });

  it('ignores headings inside fenced code blocks', () => {
    const slugs = headingSlugs('```\n## Not a real heading\n```\n\n## Real\n');
    expect(slugs.has('not-a-real-heading')).toBe(false);
    expect(slugs.has('real')).toBe(true);
  });
});

describe('the repo\'s own docs', () => {
  it('scans a non-trivial number of files', () => {
    // A regression guard on the globs themselves: if this drops to zero, the
    // check below would pass on an empty scan and prove nothing.
    expect(findMarkdownFiles().length).toBeGreaterThan(20);
  });

  it('has no dead relative link or #anchor across docs/**, plan.md, CLAUDE.md and prompts/**', () => {
    const issues = checkAll();
    if (issues.length > 0) {
      const report = issues
        .map((i) => `  ${i.file}:${i.line}  [${i.link}]  — ${i.reason}`)
        .join('\n');
      throw new Error(`${issues.length} broken doc link(s):\n${report}`);
    }
  });
});

describe('checkFile catches what it is supposed to', () => {
  // These prove the check actually fails on a dead link/anchor rather than
  // trivially passing — run against fixtures under a scratch dir so they
  // never touch the real docs tree.
  it('flags a relative link to a file that does not exist', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'doclinks-'));
    const file = join(dir, 'a.md');
    writeFileSync(file, '[broken](./does-not-exist.md)\n');
    const cwdBefore = process.cwd();
    process.chdir(dir);
    try {
      const issues = checkFile('a.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toMatch(/does not exist/);
    } finally {
      process.chdir(cwdBefore);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a link to a real file with a stale anchor', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'doclinks-'));
    writeFileSync(join(dir, 'b.md'), '## Real Heading\n');
    writeFileSync(join(dir, 'a.md'), '[stale](./b.md#a-heading-that-moved)\n');
    const cwdBefore = process.cwd();
    process.chdir(dir);
    try {
      const issues = checkFile('a.md');
      expect(issues).toHaveLength(1);
      expect(issues[0].reason).toMatch(/no heading/);
    } finally {
      process.chdir(cwdBefore);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
