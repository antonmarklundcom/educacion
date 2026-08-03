import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvRecords } from './csv';

describe('parseCsv', () => {
  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([['a', 'say "hi"', 'c']]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2"\nb,c')).toEqual([
      ['a', 'line1\nline2'],
      ['b', 'c'],
    ]);
  });

  it('handles CRLF and a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('detects a semicolon delimiter, as Excel produces in an es locale', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('does not split on a delimiter that only appears inside quotes', () => {
    expect(parseCsv('"a;b",c\n"d;e",f')).toEqual([
      ['a;b', 'c'],
      ['d;e', 'f'],
    ]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a,b\n\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('parseCsvRecords', () => {
  it('keys rows by header', () => {
    expect(parseCsvRecords('name,code\nA,1')).toEqual([{ name: 'A', code: '1' }]);
  });

  it('pads short rows so downstream code has one shape', () => {
    expect(parseCsvRecords('a,b,c\n1')).toEqual([{ a: '1', b: '', c: '' }]);
  });

  it('suffixes duplicate headers rather than losing a column', () => {
    expect(parseCsvRecords('a,a\n1,2')).toEqual([{ a: '1', a_2: '2' }]);
  });
});
