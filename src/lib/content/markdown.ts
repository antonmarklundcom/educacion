/**
 * The parsing half of the editorial markdown subset (PR-30) — pure, no JSX, so
 * it is testable under vitest (the project's `tsconfig` keeps `jsx: preserve`
 * for Next, which means a `.tsx` module cannot be parsed by the test runner).
 *
 * The rendering half is `markdown.tsx`. It builds React elements from these
 * blocks and never an HTML string, which is what makes the whole pipeline safe
 * without a sanitizer: an injected `<script>` in an editorial body is text.
 */

export type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

/** Pure: markdown → blocks. Exported so the parsing is unit-testable. */
export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let paragraph: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ').trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      blocks.push({ kind: 'h3', text: line.slice(4) });
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', text: line.slice(3) });
      continue;
    }
    if (line.startsWith('> ')) {
      flush();
      blocks.push({ kind: 'quote', text: line.slice(2) });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (list?.kind !== 'ul') {
        flushList();
        list = { kind: 'ul', items: [] };
      }
      list.items.push(bullet[1]!);
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (list?.kind !== 'ol') {
        flushList();
        list = { kind: 'ol', items: [] };
      }
      list.items.push(numbered[1]!);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flush();
  return blocks;
}

/** Every internal link target in a body — how the "links to a money page" rule is checked. */
export function internalLinks(markdown: string): string[] {
  const found: string[] = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\((\/[^)]*)\)/g)) {
    found.push(match[1]!.trim());
  }
  return found;
}

/** The heading text of every `##` — used to build the on-page table of contents. */
export function sectionHeadings(markdown: string): string[] {
  const headings: string[] = [];
  for (const block of parseBlocks(markdown)) {
    if (block.kind === 'h2') headings.push(block.text);
  }
  return headings;
}

export function slugifyHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
