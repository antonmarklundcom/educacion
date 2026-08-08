/**
 * Fixtures for the curation tests.
 *
 * **No real data, deliberately** — the same rule and the same reason as
 * `src/lib/ingest/__fixtures__/documents.ts`: a fixture that pairs a real
 * university with an invented resolution number is the string that later gets
 * copied into a seed script. Institutions are `INSTITUCION DE PRUEBA <letter>`,
 * resolutions are `RES-TEST-<n>`, and the only real names here are the
 * departamento/ciudad names the taxonomy seed already contains.
 *
 * What these fixtures assert is *behaviour under a shape*: that a renamed
 * institution matches, that an uncited accreditation does not get written,
 * that a protected field queues. None of that depends on the data being real,
 * and the match *rate* is deliberately not asserted anywhere — see
 * `docs/data-sources.md` §4.7.
 */

import type { AneaesPayload } from '@/lib/ingest/parsers/aneaes';
import type { ConesPayload } from '@/lib/ingest/parsers/cones';

import { buildCareerMatchKey, buildMatchKey } from '../match-key';
import type { CurationSnapshot, SourceRecordRow } from '../pipeline';

export const INSTITUTION_A = 'INSTITUCION DE PRUEBA A';
export const INSTITUTION_B = 'INSTITUCION DE PRUEBA B';
export const PROGRAM_ONE = 'Carrera de Prueba Uno';

export function snapshot(overrides: Partial<CurationSnapshot> = {}): CurationSnapshot {
  return {
    institutions: [
      {
        id: 1,
        nameOfficial: INSTITUTION_A,
        nameShort: 'PRUEBA A',
        acronym: 'IPA',
        matchKey: buildMatchKey(INSTITUTION_A),
        conesCode: 'C-001',
      },
    ],
    aliases: [],
    careers: [
      {
        id: 10,
        slug: 'carrera-de-prueba-uno',
        nameEs: 'Carrera de Prueba Uno',
        synonymsJson: ['Prueba Uno con otro nombre'],
      },
    ],
    programs: [
      {
        id: 100,
        institutionId: 1,
        nameOfficial: PROGRAM_ONE,
        matchKey: buildCareerMatchKey(PROGRAM_ONE),
        slug: 'carrera-de-prueba-uno',
        level: 'grado',
        careerId: 10,
        conesResolution: 'RES-TEST-1',
      },
    ],
    campuses: [{ id: 1000, institutionId: 1, name: 'Asunción', slug: 'asuncion', cityId: 1 }],
    offerings: [],
    accreditations: [],
    cities: [{ id: 1, slug: 'asuncion', nameEs: 'Asunción' }],
    ...overrides,
  };
}

export function conesRecord(
  payload: Partial<ConesPayload> & { institutionName: string },
  id = 1,
): SourceRecordRow {
  return {
    id,
    source: 'CONES',
    sourceUrl: 'https://source.test/registro',
    payload: {
      kind: payload.programName ? 'program' : 'institution',
      institutionNameSource: payload.programName ? 'row' : 'card',
      conesCode: null,
      programName: null,
      levelRaw: null,
      modalityRaw: null,
      locationRaw: null,
      resolutionNumber: null,
      resolutionUrl: null,
      offeringStatusRaw: null,
      antecedentsRaw: null,
      detailUrl: null,
      phoneRaw: null,
      addressRaw: null,
      websiteRaw: null,
      rawCells: [],
      ...payload,
    } satisfies ConesPayload,
  };
}

export function aneaesRecord(
  payload: Partial<AneaesPayload> & { institutionName: string },
  id = 2,
): SourceRecordRow {
  const resolutionNumber = payload.resolutionNumber ?? null;
  return {
    id,
    source: 'ANEAES',
    sourceUrl: 'https://source.test/acreditadas',
    payload: {
      programName: null,
      statusRaw: null,
      modelRaw: null,
      resolutionUrl: null,
      validFromRaw: null,
      validToRaw: null,
      locationRaw: null,
      citable: resolutionNumber != null || payload.resolutionUrl != null,
      rawCells: null,
      rawRecord: null,
      ...payload,
      resolutionNumber,
    } satisfies AneaesPayload,
  };
}
