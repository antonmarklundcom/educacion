/**
 * Normalization, similarity and the resolution order of `data-sources.md` §4.
 *
 * The names here are the fixture institutions, spelled the several ways a
 * register spells things — that is the shape the matcher exists for, and it
 * does not require the names to be real.
 */

import { describe, expect, it } from 'vitest';

import { FUZZY_PROPOSE_THRESHOLD } from '@/lib/ingest/contract';

import {
  buildCareerIndex,
  buildInstitutionIndex,
  buildProgramIndex,
  isAmbiguous,
  isCertainMatch,
  matchCareer,
  matchInstitution,
  matchProgram,
} from './match';
import {
  acronymCandidate,
  buildCareerMatchKey,
  buildMatchKey,
  splitPrintedAcronym,
  uniqueSlug,
} from './match-key';
import { levenshteinRatio, similarityScore, trigramSimilarity } from './similarity';

describe('buildMatchKey', () => {
  it('is case, accent and punctuation insensitive', () => {
    expect(buildMatchKey('Institución de Prueba "Á"')).toBe(
      buildMatchKey('INSTITUCION DE PRUEBA A'),
    );
  });

  it('drops the stopwords §4.1 names', () => {
    expect(buildMatchKey('Universidad Nacional de Prueba')).toBe('PRUEBA');
  });

  it('expands the abbreviations the registers use interchangeably', () => {
    expect(buildMatchKey('Institución Ntra. Sra. de Prueba')).toBe(
      buildMatchKey('INSTITUCION NUESTRA SEÑORA DE PRUEBA'),
    );
  });

  // The register writes one institution both ways across its two shapes; a key
  // that keeps the suffix sends every one of them to the conflict queue.
  it('converges a name with its own printed-acronym spelling', () => {
    expect(buildMatchKey('Institución de Prueba A – IPA')).toBe(
      buildMatchKey('Institución de Prueba A'),
    );
  });

  it('never returns an empty key, even for an all-stopword name', () => {
    expect(buildMatchKey('Universidad Nacional')).toBe('UNIVERSIDAD NACIONAL');
  });

  it('keeps the words that distinguish careers from each other', () => {
    expect(buildCareerMatchKey('Carrera de Prueba Uno')).toBe('PRUEBA UNO');
    expect(buildCareerMatchKey('Licenciatura en Prueba')).toBe('LICENCIATURA PRUEBA');
  });
});

describe('acronymCandidate', () => {
  it('reads a dotted acronym', () => {
    expect(acronymCandidate('I.P.A.')).toBe('IPA');
  });

  it('reads a bare acronym', () => {
    expect(acronymCandidate('IPA')).toBe('IPA');
  });

  it('does not invent one from initials', () => {
    expect(acronymCandidate('Institución de Prueba A')).toBeNull();
  });

  // CONES prints the acronym inside the name on 10 of the 13 institutions on
  // the saved register pages: "… de Luque – UAL". Reading it is not deriving
  // it (docs/data-sources.md §4.1).
  it('reads an acronym the source printed inside a full name', () => {
    expect(acronymCandidate('Institución de Prueba A – IPA')).toBe('IPA');
    expect(acronymCandidate('Institución de Prueba A (IPA)')).toBe('IPA');
    expect(acronymCandidate('Institución de Prueba A - I.P.A.')).toBe('IPA');
  });

  it('still refuses a trailing word that is not an acronym', () => {
    expect(acronymCandidate('Institución de Prueba del Sur')).toBeNull();
    expect(acronymCandidate('Institución de Prueba A – Sede Central')).toBeNull();
  });
});

describe('splitPrintedAcronym', () => {
  it('separates a printed acronym from the name it is glued to', () => {
    expect(splitPrintedAcronym('Institución de Prueba A – IPA')).toEqual({
      name: 'Institución de Prueba A',
      acronym: 'IPA',
    });
  });

  it('leaves a name that is only an acronym alone', () => {
    expect(splitPrintedAcronym('IPA')).toEqual({ name: 'IPA', acronym: null });
  });

  it('leaves an ordinary name untouched', () => {
    expect(splitPrintedAcronym('Institución de Prueba A')).toEqual({
      name: 'Institución de Prueba A',
      acronym: null,
    });
  });
});

describe('uniqueSlug', () => {
  it('suffixes on collision instead of failing the import', () => {
    expect(uniqueSlug('Carrera de Prueba', new Set(['carrera-de-prueba']))).toBe(
      'carrera-de-prueba-2',
    );
  });
});

describe('similarity', () => {
  it('scores identical strings 100', () => {
    expect(similarityScore('PRUEBA A', 'PRUEBA A')).toBe(100);
  });

  it('scores a one-character typo above the propose threshold', () => {
    expect(
      similarityScore('INSTITUCION DE PRUEBA A', 'INSTITUCION DE PRUEVA A'),
    ).toBeGreaterThanOrEqual(FUZZY_PROPOSE_THRESHOLD);
  });

  it('scores unrelated strings well below it', () => {
    expect(similarityScore('PRUEBA A', 'OTRA COSA DISTINTA')).toBeLessThan(FUZZY_PROPOSE_THRESHOLD);
  });

  it('measures both metrics', () => {
    expect(levenshteinRatio('ABC', 'ABC')).toBe(1);
    expect(trigramSimilarity('ABC', 'XYZ')).toBe(0);
  });
});

const institutions = [
  {
    id: 1,
    nameOfficial: 'INSTITUCION DE PRUEBA A',
    nameShort: 'PRUEBA A',
    acronym: 'IPA',
    matchKey: buildMatchKey('INSTITUCION DE PRUEBA A'),
    conesCode: 'C-001',
  },
  {
    id: 2,
    nameOfficial: 'INSTITUCION DE PRUEBA B',
    nameShort: 'PRUEBA B',
    acronym: null,
    matchKey: buildMatchKey('INSTITUCION DE PRUEBA B'),
    conesCode: null,
  },
];

describe('matchInstitution', () => {
  it('prefers cones_code over everything else', () => {
    const index = buildInstitutionIndex(institutions);
    const match = matchInstitution(index, {
      rawName: 'Un nombre totalmente distinto',
      conesCode: 'C-001',
    });

    expect(match).toMatchObject({ entityId: 1, method: 'cones_code', score: 100 });
    expect(isCertainMatch(match)).toBe(true);
  });

  it('resolves an alias before the derived match key', () => {
    const index = buildInstitutionIndex(institutions, [
      { institutionId: 2, matchKey: buildMatchKey('INSTITUCION DE PRUEBA A') },
    ]);
    const match = matchInstitution(index, { rawName: 'Institución de Prueba A' });

    expect(match).toMatchObject({ entityId: 2, method: 'alias' });
  });

  it('matches on the match key across spelling variants', () => {
    const index = buildInstitutionIndex(institutions);
    const match = matchInstitution(index, { rawName: 'institución  de  prueba  "a"' });

    expect(match).toMatchObject({ entityId: 1, method: 'match_key' });
  });

  it('matches on the acronym', () => {
    const index = buildInstitutionIndex(institutions);
    expect(matchInstitution(index, { rawName: 'I.P.A.' })).toMatchObject({
      entityId: 1,
      method: 'acronym',
    });
  });

  it('proposes a fuzzy match instead of applying it', () => {
    const index = buildInstitutionIndex(institutions);
    const match = matchInstitution(index, { rawName: 'INSTITUCION DE PRUEVA A' });

    expect(match.method).toBe('fuzzy');
    expect(match.score).toBeGreaterThanOrEqual(FUZZY_PROPOSE_THRESHOLD);
    // The point: a fuzzy hit is never a certain identification.
    expect(isCertainMatch(match)).toBe(false);
    expect(isAmbiguous(match)).toBe(true);
  });

  it('refuses to pick when one key belongs to two institutions', () => {
    const index = buildInstitutionIndex([
      {
        ...institutions[0],
        id: 3,
        nameOfficial: 'Universidad Nacional de Prueba',
        matchKey: 'PRUEBA',
        conesCode: null,
      },
      {
        ...institutions[1],
        id: 4,
        nameOfficial: 'Universidad de Prueba',
        matchKey: 'PRUEBA',
        conesCode: null,
      },
    ]);
    const match = matchInstitution(index, { rawName: 'Universidad de Prueba' });

    expect(match.entityId).toBeNull();
    expect(match.candidates).toHaveLength(2);
    expect(isAmbiguous(match)).toBe(true);
  });

  it('returns no match, with candidates, for an unknown name', () => {
    const index = buildInstitutionIndex(institutions);
    const match = matchInstitution(index, { rawName: 'ALGO COMPLETAMENTE AJENO' });

    expect(match.entityId).toBeNull();
    expect(match.method).toBe('none');
  });
});

describe('matchCareer', () => {
  const index = buildCareerIndex([
    { id: 10, slug: 'prueba-uno', nameEs: 'Prueba Uno', synonymsJson: ['Prueba Uno y Otra Cosa'] },
  ]);

  it('matches through careers.synonyms_json', () => {
    expect(matchCareer(index, 'Carrera de Prueba Uno y Otra Cosa')).toMatchObject({
      entityId: 10,
      method: 'alias',
    });
  });

  it('matches on the career name', () => {
    expect(matchCareer(index, 'Carrera de Prueba Uno')).toMatchObject({
      entityId: 10,
      method: 'match_key',
    });
  });
});

describe('matchProgram', () => {
  const index = buildProgramIndex([
    { id: 100, institutionId: 1, nameOfficial: 'Carrera de Prueba Uno', matchKey: 'PRUEBA UNO' },
  ]);

  it('never matches a program across institutions', () => {
    expect(matchProgram(index, 2, 'Carrera de Prueba Uno').entityId).toBeNull();
    expect(matchProgram(index, 1, 'Carrera de Prueba Uno').entityId).toBe(100);
  });
});
