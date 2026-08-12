/**
 * A deliberately small Markdown subset, rendered to React elements (PR-30).
 *
 * ### Why not a library, and why not `dangerouslySetInnerHTML`
 *
 * `architecture.md` §1's "deliberately excluded" list exists to stop unexamined
 * dependencies, and a full CommonMark parser plus a sanitizer is two of them
 * for content **we** write in our own admin. More importantly, every published
 * markdown pipeline that reaches for `dangerouslySetInnerHTML` needs a
 * sanitizer to stay safe forever; this renderer never produces HTML strings at
 * all — it builds React elements, so an injected `<script>` in a body is text,
 * not a script, by construction rather than by configuration.
 *
 * ### The subset, and what it refuses
 *
 * Supported: `##`/`###` headings, paragraphs, `-` lists, `1.` lists,
 * `> quotes`, `**bold**`, `*italic*`, `` `code` `` and `[text](href)` links.
 *
 * Not supported, on purpose: raw HTML (rendered as literal text), images
 * (editorial images need a schema and an upload path — `risks.md` §R-08 —
 * neither of which exists), and tables. An unsupported construct degrades to
 * visible text rather than disappearing, so an editor can see that it did not
 * work.
 *
 * Link targets are checked: anything that is not a relative path or an
 * `http(s)` URL renders as plain text, which is what closes `javascript:` and
 * `data:` without a sanitizer in the loop.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { parseBlocks, slugifyHeading } from './markdown';

export {
  internalLinks,
  parseBlocks,
  sectionHeadings,
  slugifyHeading,
  type Block,
} from './markdown';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function safeHref(href: string): string | null {
  const value = href.trim();
  if (value.startsWith('/') || value.startsWith('#')) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

/** Inline formatting inside one block of text. */
export function renderInline(text: string, keyPrefix = ''): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '');

  return parts.map((part, index) => {
    const key = `${keyPrefix}${index}`;

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="text-ink font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="bg-card-alt rounded px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]!);
      // An unsupported scheme renders as its own text rather than as a link:
      // silently dropping it would hide the editor's mistake.
      if (!href) return <span key={key}>{part}</span>;
      const label = link[1]!;
      return href.startsWith('http') ? (
        <a
          key={key}
          href={href}
          rel="noopener noreferrer"
          target="_blank"
          className="text-ink font-medium underline underline-offset-2"
        >
          {label}
        </a>
      ) : (
        <Link key={key} href={href} className="text-ink font-medium underline underline-offset-2">
          {label}
        </Link>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <div className="text-body flex max-w-prose flex-col gap-4 text-base leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === 'h2') {
          return (
            <h2
              key={index}
              id={slugifyHeading(block.text)}
              className="text-ink mt-4 scroll-mt-24 text-xl font-semibold"
            >
              {renderInline(block.text, `${index}-`)}
            </h2>
          );
        }
        if (block.kind === 'h3') {
          return (
            <h3 key={index} className="text-ink mt-2 text-lg font-semibold">
              {renderInline(block.text, `${index}-`)}
            </h3>
          );
        }
        if (block.kind === 'quote') {
          return (
            <blockquote key={index} className="border-border-strong text-muted border-l-2 pl-4">
              {renderInline(block.text, `${index}-`)}
            </blockquote>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={index} className="marker:text-faint flex list-disc flex-col gap-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item, `${index}-${itemIndex}-`)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'ol') {
          return (
            <ol key={index} className="marker:text-faint flex list-decimal flex-col gap-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item, `${index}-${itemIndex}-`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={index}>{renderInline(block.text, `${index}-`)}</p>;
      })}
    </div>
  );
}
