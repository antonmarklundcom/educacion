/**
 * The renderer's parsing half, and the two safety properties that matter:
 * an unsupported link scheme never becomes a link, and raw HTML never becomes
 * markup. Both are structural here — this module builds React elements and
 * never an HTML string — so these tests pin the parse, and the rendering side
 * has nothing to sanitize.
 */

import { describe, expect, it } from 'vitest';

import { internalLinks, parseBlocks, sectionHeadings, slugifyHeading } from './markdown';

describe('parseBlocks', () => {
  it('splits headings, paragraphs and lists', () => {
    const blocks = parseBlocks(
      [
        '## Título',
        '',
        'Un párrafo',
        'que sigue en la misma línea lógica.',
        '',
        '- uno',
        '- dos',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'h2', text: 'Título' },
      { kind: 'p', text: 'Un párrafo que sigue en la misma línea lógica.' },
      { kind: 'ul', items: ['uno', 'dos'] },
    ]);
  });

  it('keeps ordered and unordered lists apart', () => {
    const blocks = parseBlocks(['1. primero', '2. segundo', '', '- otro'].join('\n'));
    expect(blocks).toEqual([
      { kind: 'ol', items: ['primero', 'segundo'] },
      { kind: 'ul', items: ['otro'] },
    ]);
  });

  it('treats raw HTML as text, not as markup', () => {
    const blocks = parseBlocks('<script>alert(1)</script>');
    expect(blocks).toEqual([{ kind: 'p', text: '<script>alert(1)</script>' }]);
  });
});

describe('link extraction', () => {
  it('finds internal targets only', () => {
    const md = 'Mirá [medicina](/carreras/medicina) y [ANEAES](https://aneaes.gov.py).';
    expect(internalLinks(md)).toEqual(['/carreras/medicina']);
  });
});

describe('headings', () => {
  it('lists the section titles and slugs them without accents', () => {
    expect(sectionHeadings('## ¿Qué es la acreditación?\n\ntexto\n\n### sub')).toEqual([
      '¿Qué es la acreditación?',
    ]);
    expect(slugifyHeading('¿Qué es la acreditación?')).toBe('que-es-la-acreditacion');
  });
});
