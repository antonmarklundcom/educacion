import { describe, expect, it } from 'vitest';

import {
  decodeEntities,
  extractTables,
  findColumn,
  firstHref,
  headerIndex,
  tableRows,
  textOf,
} from './html';

describe('decodeEntities', () => {
  it('decodes the named entities Spanish government pages actually use', () => {
    expect(decodeEntities('Asunci&oacute;n &ntilde; N&deg; &amp; &nbsp;')).toBe(
      'Asunción ñ N° &  ',
    );
  });

  it('decodes numeric and hex entities', () => {
    expect(decodeEntities('&#65;&#x42;')).toBe('AB');
  });

  it('leaves unknown entities alone rather than guessing', () => {
    expect(decodeEntities('&nosuchthing;')).toBe('&nosuchthing;');
  });
});

describe('textOf', () => {
  it('strips tags and collapses whitespace', () => {
    expect(textOf('<td>  <b>Universidad</b>\n  de   Prueba </td>')).toBe('Universidad de Prueba');
  });

  it('drops script and style content instead of inlining it', () => {
    expect(textOf('<div>a<script>var x = 1;</script>b</div>')).toBe('a b');
  });

  it('turns <br> into a space so two lines do not fuse into one word', () => {
    expect(textOf('Sede<br>Central')).toBe('Sede Central');
  });
});

describe('firstHref', () => {
  it('resolves a relative href against the source URL', () => {
    expect(firstHref('<a href="/docs/a.pdf">x</a>', 'https://e.test/registro/')).toBe(
      'https://e.test/docs/a.pdf',
    );
  });

  it('reads unquoted and single-quoted attributes', () => {
    expect(firstHref("<a href='a.pdf'>x</a>")).toBe('a.pdf');
    expect(firstHref('<a href=a.pdf>x</a>')).toBe('a.pdf');
  });

  it('ignores anchors and javascript: links', () => {
    expect(firstHref('<a href="#top">x</a>')).toBeNull();
    expect(firstHref('<a href="javascript:void(0)">x</a>')).toBeNull();
  });

  it('returns null when there is no link', () => {
    expect(firstHref('Res. N° 1/2024')).toBeNull();
  });
});

describe('extractTables', () => {
  it('finds each table on the page', () => {
    expect(
      extractTables('<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>'),
    ).toHaveLength(2);
  });

  it('closes on the matching </table> when tables nest', () => {
    const html = '<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>';
    const tables = extractTables(html);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toBe(html);
  });

  it('ignores an unclosed table rather than swallowing the rest of the page', () => {
    expect(extractTables('<table><tr><td>a</td></tr>')).toEqual([]);
  });
});

describe('tableRows', () => {
  it('reads rows and cells, marking header cells', () => {
    const rows = tableRows(
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].map((c) => c.text)).toEqual(['A', 'B']);
    expect(rows[0].every((c) => c.isHeader)).toBe(true);
    expect(rows[1].map((c) => c.text)).toEqual(['1', '2']);
  });

  it('tolerates unclosed <td>', () => {
    const rows = tableRows('<table><tr><td>1<td>2</tr></table>');
    expect(rows[0].map((c) => c.text)).toEqual(['1', '2']);
  });

  it('tolerates attributes containing a > character', () => {
    const rows = tableRows('<table><tr><td title="a>b">1</td><td>2</td></tr></table>');
    expect(rows[0]).toHaveLength(2);
    expect(rows[0][1].text).toBe('2');
  });

  it('preserves cell markup so a parser can read the link inside', () => {
    const rows = tableRows('<table><tr><td><a href="x.pdf">Res</a></td></tr></table>');
    expect(firstHref(rows[0][0].html)).toBe('x.pdf');
  });
});

describe('findColumn', () => {
  const header = headerIndex(
    tableRows(
      '<table><tr><th>Instituci&oacute;n</th><th>N&deg; de Resoluci&oacute;n</th></tr></table>',
    )[0],
  );

  it('matches ignoring case, accents and punctuation', () => {
    expect(findColumn(header, ['institucion'])).toBe(0);
  });

  it('matches on a substring when there is no exact header', () => {
    expect(findColumn(header, ['resolucion'])).toBe(1);
  });

  it('prefers an exact header match over a substring one', () => {
    const two = headerIndex(
      tableRows('<table><tr><th>Sede Central</th><th>Sede</th></tr></table>')[0],
    );
    expect(findColumn(two, ['sede'])).toBe(1);
  });

  it('returns -1 rather than guessing when the column is absent', () => {
    expect(findColumn(header, ['arancel'])).toBe(-1);
  });
});
