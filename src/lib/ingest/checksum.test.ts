import { describe, expect, it } from 'vitest';

import { canonicalJson, canonicalize, checksumOf, collapseWhitespace } from './checksum';

describe('collapseWhitespace', () => {
  it('collapses the whitespace that comes out of government HTML', () => {
    expect(collapseWhitespace('  UNIVERSIDAD \n\t DE  PRUEBA  ')).toBe('UNIVERSIDAD DE PRUEBA');
  });

  it('treats non-breaking and zero-width spaces as whitespace', () => {
    expect(collapseWhitespace('A B​C')).toBe('A B C');
  });
});

describe('canonicalize', () => {
  it('sorts object keys so key order cannot change the hash', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('preserves array order, which is information in a source document', () => {
    expect(canonicalJson(['b', 'a'])).not.toBe(canonicalJson(['a', 'b']));
  });

  it('drops undefined but keeps null, which means "the source did not say"', () => {
    expect(canonicalize({ a: undefined, b: null })).toEqual({ b: null });
  });

  it('does not mutate its input', () => {
    const input = { b: '  x  ', a: 1 };
    canonicalize(input);
    expect(input).toEqual({ b: '  x  ', a: 1 });
  });

  it('normalizes nested strings and dates', () => {
    expect(canonicalize({ x: [{ y: ' a  b ' }] })).toEqual({ x: [{ y: 'a b' }] });
    expect(canonicalize(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('checksumOf', () => {
  it('is stable across key order and incidental whitespace', () => {
    expect(checksumOf({ name: 'A  B', code: '1' })).toBe(checksumOf({ code: '1', name: ' A B ' }));
  });

  it('changes when the data changes', () => {
    expect(checksumOf({ name: 'A' })).not.toBe(checksumOf({ name: 'B' }));
  });

  it('fits source_records.checksum (64 chars)', () => {
    expect(checksumOf({ name: 'A' })).toMatch(/^[0-9a-f]{64}$/);
  });
});
