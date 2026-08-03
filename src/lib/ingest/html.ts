/**
 * A small, tolerant HTML table reader.
 *
 * Why not cheerio: the two documents we parse are government-published tables
 * whose markup we cannot see from CI (the sites 403 whole networks — see
 * `docs/data-sources.md` §1), so a full DOM buys us correctness we have no way
 * to verify and a dependency we cannot pin to observed markup. What we need is
 * narrow and stable: find `<table>`s, read their rows and cells, decode
 * entities, strip tags. That is testable in isolation and easy for a human to
 * adjust once they have the real page in front of them.
 *
 * This is deliberately not a general HTML parser. It handles unclosed `<td>`,
 * attributes containing `>`, and nested inline markup. It does NOT handle
 * tables nested inside other tables' cells — if a source turns out to do that,
 * replace this module rather than patching around it.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  uuml: 'ü',
  Uuml: 'Ü',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/** Tag-strip, entity-decode and whitespace-collapse a fragment of markup. */
export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/[\s\u00a0\u200b]+/g, ' ')
    .trim();
}

/** The first `href` in a fragment, resolved against `baseUrl` when possible. */
export function firstHref(html: string, baseUrl?: string): string | null {
  const match = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
  const raw = match?.[2] ?? match?.[3] ?? match?.[4];
  if (!raw) return null;

  const href = decodeEntities(raw).trim();
  if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return null;
  if (!baseUrl) return href;

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/** Every `<table>…</table>` in the document, outermost first, markup included. */
export function extractTables(html: string): string[] {
  const tables: string[] = [];
  const open = /<table\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = open.exec(html)) !== null) {
    const start = match.index;
    // Walk forward counting nested <table> so we close on the right </table>.
    const scanner = /<table\b[^>]*>|<\/table\s*>/gi;
    scanner.lastIndex = start;
    let depth = 0;
    let end = -1;
    let token: RegExpExecArray | null;

    while ((token = scanner.exec(html)) !== null) {
      if (token[0].startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          end = token.index + token[0].length;
          break;
        }
      } else {
        depth += 1;
      }
    }

    if (end === -1) break; // Unclosed table: nothing trustworthy left to read.
    tables.push(html.slice(start, end));
    open.lastIndex = end;
  }

  return tables;
}

export interface HtmlCell {
  text: string;
  /** Preserved so a parser can pick up the link to a resolution PDF. */
  html: string;
  isHeader: boolean;
}

/** Rows of a single table, each row an array of cells. */
export function tableRows(tableHtml: string): HtmlCell[][] {
  const rows: HtmlCell[][] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table\s*>|$)/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const cells: HtmlCell[] = [];
    const cellPattern = /<(td|th)\b[^>]*>([\s\S]*?)(?=<t[dh]\b|<\/tr\s*>|<\/table\s*>|$)/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const inner = cellMatch[2].replace(/<\/t[dh]\s*>[\s\S]*$/i, '');
      cells.push({
        text: textOf(inner),
        html: inner,
        isHeader: cellMatch[1].toLowerCase() === 'th',
      });
    }

    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

/**
 * Map a table's header row to column indexes, so parsers address columns by
 * meaning rather than position. Government tables reorder columns between
 * publications; they rename headers far less often.
 *
 * Matching is accent- and case-insensitive and substring-based, because
 * headers arrive as "Carrera / Programa" or "Nº de Resolución".
 */
export function headerIndex(row: HtmlCell[]): Map<string, number> {
  const index = new Map<string, number>();
  row.forEach((cell, i) => {
    const key = normalizeHeader(cell.text);
    if (key && !index.has(key)) index.set(key, i);
  });
  return index;
}

export function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** First column whose header contains any of `candidates`; -1 when none does. */
export function findColumn(header: Map<string, number>, candidates: readonly string[]): number {
  for (const candidate of candidates) {
    const needle = normalizeHeader(candidate);
    for (const [key, i] of header) {
      if (key === needle) return i;
    }
  }
  for (const candidate of candidates) {
    const needle = normalizeHeader(candidate);
    for (const [key, i] of header) {
      if (key.includes(needle)) return i;
    }
  }
  return -1;
}
