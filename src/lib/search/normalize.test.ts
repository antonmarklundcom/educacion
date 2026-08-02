import { describe, expect, it } from 'vitest';

import {
  buildBooleanModeQuery,
  buildSearchText,
  normalizeText,
  parseQuery,
  SEARCH_TEXT_MAX_LENGTH,
  tokenize,
} from './normalize';

describe('normalizeText', () => {
  it('strips accents so search never depends on collation', () => {
    expect(normalizeText('Ingeniería Informática')).toBe('ingenieria informatica');
    expect(normalizeText('INGENIERIA')).toBe(normalizeText('ingeniería'));
  });

  it('folds ñ to n', () => {
    expect(normalizeText('Diseño')).toBe('diseno');
  });

  it('removes every character that means something to the boolean parser', () => {
    expect(normalizeText('+medicina* -"cirugía" (UNA) @1 ~x <y >z')).toBe(
      'medicina cirugia una 1 x y z',
    );
  });

  it('collapses punctuation and whitespace', () => {
    expect(normalizeText('  Lic.  en   Administración,  turno-noche ')).toBe(
      'lic en administracion turno noche',
    );
  });
});

describe('tokenize', () => {
  it('de-duplicates while preserving order', () => {
    expect(tokenize('medicina Medicina MEDICINA cirugía')).toEqual(['medicina', 'cirugia']);
  });

  it('returns nothing for an empty query', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('buildSearchText', () => {
  const parts = {
    institutionName: 'Institución de prueba 001',
    institutionShort: 'IP01',
    acronym: 'IP',
    programName: 'Programa de prueba 00042',
    careerName: 'Carrera de prueba 07',
    careerSynonyms: ['Sinónimo de prueba'],
    titleAwarded: 'Título de prueba 07',
    campusName: 'Sede de prueba 03',
    cityName: 'Ciudad de prueba 02',
    departmentName: 'Departamento de prueba 01',
    areaName: 'Área de prueba 2',
  };

  it('is lowercase, accent-free and de-duplicated', () => {
    const text = buildSearchText(parts);
    expect(text).toMatch(/^[a-z0-9 ]+$/);
    const tokens = text.split(' ');
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(text).toContain('institucion');
    expect(text).toContain('ip01');
    expect(text).toContain('area');
  });

  it('never exceeds the column width', () => {
    const long = buildSearchText({
      ...parts,
      careerSynonyms: Array.from({ length: 500 }, (_, i) => `sinonimo${i}`),
    });
    expect(long.length).toBeLessThanOrEqual(SEARCH_TEXT_MAX_LENGTH);
    // Truncation happens on a token boundary, never mid-token.
    expect(long.endsWith(' ')).toBe(false);
  });
});

describe('parseQuery', () => {
  it('splits tokens at the InnoDB minimum token size', () => {
    const parsed = parseQuery('UC medicina');
    expect(parsed.shortTokens).toEqual(['uc']);
    expect(parsed.fullTextTokens).toEqual(['medicina']);
  });

  it('treats a three-character token as full-text', () => {
    expect(parseQuery('UNA').fullTextTokens).toEqual(['una']);
    expect(parseQuery('UNA').shortTokens).toEqual([]);
  });

  it('reports an empty query', () => {
    expect(parseQuery('  ...  ').isEmpty).toBe(true);
    expect(parseQuery(undefined).isEmpty).toBe(true);
  });
});

describe('buildBooleanModeQuery', () => {
  it('requires every token and matches prefixes', () => {
    expect(buildBooleanModeQuery(['medicina', 'asuncion'])).toBe('+medicina* +asuncion*');
  });
});
