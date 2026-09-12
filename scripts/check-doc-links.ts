/**
 * PR-66's link check.
 *
 * `docs/architecture.md` was split into `docs/decisions/*.md` by moving headings —
 * exactly the operation that turns an internal `some-file.md#a-heading-that-moved`
 * link into a silent 404 inside our own docs, which nobody reading a rendered page
 * would notice. This walks every relative `.md` link and `#anchor` fragment in
 * `docs/**`, `plan.md`, `CLAUDE.md` and `prompts/**` and fails on the first one
 * that does not resolve.
 *
 * What it checks, and what it deliberately does not:
 * - A relative link's target file must exist on disk.
 * - A `#anchor` — on a relative link or a same-file `[text](#anchor)` — must match
 *   a heading in the target file (or the current file), by GitHub's own slug rule.
 * - `http(s)://` links, `mailto:`, and links inside fenced code blocks are ignored
 *   — a code sample showing a URL is not a navigation link.
 *
 *   npm test                              # wired in via scripts/check-doc-links.test.ts
 *   npx tsx scripts/check-doc-links.ts     # run directly, same output
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

function root(): string {
  return process.cwd();
}

/** Directories (and single files) whose markdown this check covers. */
export const SCANNED_ROOTS = ['docs', 'prompts'] as const;
export const SCANNED_FILES = ['plan.md', 'CLAUDE.md'] as const;

export interface LinkIssue {
  file: string; // repo-relative
  line: number;
  link: string;
  reason: string;
}

/** GitHub's heading→slug rule, close enough for our own docs: lowercase, strip
 * everything but word chars/spaces/hyphens, spaces to hyphens, collapse repeats. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, '') // inline code/emphasis markers inside a heading
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/** Every heading's slug in a markdown file, disambiguated the way GitHub does
 * (a repeated slug gets -1, -2, … suffixes in document order). */
export function headingSlugs(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const slugs = new Set<string>();
  const lines = markdown.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slugify(m[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

/** Strip fenced code blocks (``` … ```) so links shown as examples aren't checked. */
function stripFences(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
}

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/** All (line, link) pairs of markdown links found outside fenced code. */
function extractLinks(markdown: string): { line: number; link: string }[] {
  const cleaned = stripFences(markdown);
  const out: { line: number; link: string }[] = [];
  let lineNo = 1;
  for (const rawLine of cleaned.split('\n')) {
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(rawLine))) {
      out.push({ line: lineNo, link: m[1].trim() });
    }
    lineNo++;
  }
  return out;
}

function isExternal(link: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)/i.test(link) && !link.startsWith('#');
  // matches http:, https:, mailto:, tel:, etc. A bare `#anchor` has no scheme.
}

function walkMarkdown(dirRepoRel: string, out: string[]): void {
  const abs = join(root(), dirRepoRel);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return; // directory does not exist in this checkout — nothing to scan
  }
  for (const entry of entries) {
    const childRel = join(dirRepoRel, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(childRel, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(childRel);
    }
  }
}

export function findMarkdownFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCANNED_ROOTS) {
    walkMarkdown(dir, files);
  }
  for (const f of SCANNED_FILES) {
    if (existsSync(join(root(), f))) files.push(f);
  }
  return [...new Set(files)].sort();
}

export function checkFile(repoRelPath: string): LinkIssue[] {
  const abs = join(root(), repoRelPath);
  const markdown = readFileSync(abs, 'utf8');
  const ownSlugs = headingSlugs(markdown);
  const issues: LinkIssue[] = [];

  for (const { line, link } of extractLinks(markdown)) {
    if (isExternal(link)) continue;
    if (link.startsWith('#')) {
      const anchor = decodeURIComponent(link.slice(1));
      if (anchor && !ownSlugs.has(anchor)) {
        issues.push({ file: repoRelPath, line, link, reason: `no heading #${anchor} in this file` });
      }
      continue;
    }

    const [rawTarget, rawAnchor] = link.split('#');
    const targetPath = decodeURIComponent(rawTarget);
    if (!targetPath) continue; // shouldn't happen given the branch above, but be safe
    const targetAbs = resolve(dirname(abs), targetPath);

    const exists = existsSync(targetAbs);
    const isFile = exists && statSync(targetAbs).isFile();
    if (!exists || !isFile) {
      issues.push({
        file: repoRelPath,
        line,
        link,
        reason: `target does not exist: ${relative(root(), targetAbs)}`,
      });
      continue;
    }

    if (rawAnchor && targetAbs.endsWith('.md')) {
      const targetMarkdown = readFileSync(targetAbs, 'utf8');
      const targetSlugs = headingSlugs(targetMarkdown);
      const anchor = decodeURIComponent(rawAnchor);
      if (!targetSlugs.has(anchor)) {
        issues.push({
          file: repoRelPath,
          line,
          link,
          reason: `no heading #${anchor} in ${relative(root(), targetAbs)}`,
        });
      }
    }
  }

  return issues;
}

export function checkAll(files: string[] = findMarkdownFiles()): LinkIssue[] {
  return files.flatMap((f) => checkFile(f));
}

function main(): void {
  const issues = checkAll();
  if (issues.length === 0) {
    console.log(`Every relative link and #anchor across ${findMarkdownFiles().length} files resolves.`);
    return;
  }
  console.error(`${issues.length} broken doc link(s):\n`);
  for (const issue of issues) {
    console.error(`  ${issue.file}:${issue.line}  [${issue.link}]  — ${issue.reason}`);
  }
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith('check-doc-links.ts')) main();
