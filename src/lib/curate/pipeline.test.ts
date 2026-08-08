/**
 * End-to-end over the pure pipeline: raw payload → proposal → apply decision.
 *
 * These are the PR-06 acceptance criteria expressed as tests. In particular:
 * no accreditation without a citation, absence is never negative, CONES never
 * produces an accreditation, and a second pass over an unchanged source
 * proposes nothing.
 */

import { describe, expect, it } from 'vitest';

import { decideApply } from './apply-rules';
import { buildProposals } from './pipeline';
import {
  mapAccreditationStatus,
  mapLevel,
  mapModality,
  parseSourceDate,
  stageConesRecord,
} from './staging';
import {
  aneaesRecord,
  conesRecord,
  INSTITUTION_A,
  PROGRAM_ONE,
  snapshot,
} from './__fixtures__/snapshot';
import { buildMatchKey } from './match-key';

const find = (proposals: ReturnType<typeof buildProposals>['proposals'], entity: string) =>
  proposals.filter((proposal) => proposal.entityType === entity);

describe('staging vocabulary', () => {
  it('maps the wording it knows and nothing else', () => {
    expect(mapLevel('Grado')).toBe('grado');
    expect(mapLevel('Maestría')).toBe('maestria');
    expect(mapLevel('Postgrado')).toBeNull();
    expect(mapModality('A distancia')).toBe('distancia');
    expect(mapModality(null)).toBeNull();
    expect(parseSourceDate('01/02/2029')).toBe('2029-02-01');
    expect(parseSourceDate('no dice')).toBeNull();
  });

  it('reads a positive status but never invents a negative one', () => {
    expect(mapAccreditationStatus('Acreditada')).toBe('vigente');
    expect(mapAccreditationStatus('En proceso')).toBe('en_proceso');
    // Absence is sin_datos, which the pipeline represents as "no row at all".
    expect(mapAccreditationStatus(null)).toBeNull();
    expect(mapAccreditationStatus('')).toBeNull();
    expect(mapAccreditationStatus('otra cosa')).toBeNull();
  });
});

describe('CONES is a habilitación source', () => {
  it('stages no accreditation field of any kind', () => {
    const staged = stageConesRecord({
      kind: 'program',
      institutionName: INSTITUTION_A,
      institutionNameSource: 'row',
      conesCode: 'C-001',
      programName: PROGRAM_ONE,
      levelRaw: 'Grado',
      modalityRaw: 'Presencial',
      locationRaw: 'Asunción',
      resolutionNumber: 'RES-TEST-1',
      resolutionUrl: null,
      // The register's own "Estado" cell. It is a fact about the offering, and
      // it must not survive staging as anything resembling a status.
      offeringStatusRaw: 'INACTIVO',
      antecedentsRaw: null,
      detailUrl: null,
      phoneRaw: null,
      addressRaw: null,
      websiteRaw: null,
      rawCells: [],
    });

    expect(JSON.stringify(staged)).not.toContain('acredit');
    expect(staged.program?.conesResolution).toBe('RES-TEST-1');
  });

  it('produces no accreditation proposal from a CONES row', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        levelRaw: 'Grado',
        resolutionNumber: 'RES-TEST-1',
      }),
    ]);

    expect(find(proposals, 'accreditation')).toHaveLength(0);
  });
});

describe('buildProposals — CONES', () => {
  it('re-running over unchanged source records proposes no writes', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({
        institutionName: INSTITUTION_A,
        conesCode: 'C-001',
        programName: PROGRAM_ONE,
        levelRaw: 'Grado',
        resolutionNumber: 'RES-TEST-1',
      }),
    ]);

    for (const proposal of proposals) {
      expect(proposal.classification).toBe('unchanged');
      expect(decideApply(proposal).apply).toBe(false);
    }
  });

  it('creates a program under a known institution, at the level the source states', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({
        institutionName: 'Institución de Prueba A',
        programName: 'Carrera de Prueba Dos',
        levelRaw: 'Maestría',
        resolutionNumber: 'RES-TEST-2',
      }),
    ]);

    const [program] = find(proposals, 'program');
    expect(program.classification).toBe('new');
    expect(program.proposed).toMatchObject({ institutionId: 1, level: 'maestria' });
    expect(decideApply(program).apply).toBe(true);
  });

  it('queues a program whose level the source does not state', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({
        institutionName: INSTITUTION_A,
        programName: 'Carrera de Prueba Tres',
        levelRaw: 'Otra cosa',
      }),
    ]);

    const [program] = find(proposals, 'program');
    expect(program.classification).toBe('new');
    // Honest about being new, still not creatable without a guessed level.
    expect(decideApply(program).apply).toBe(false);
  });

  it('queues a near-miss name for review instead of creating a near-duplicate', () => {
    // "PRUEBA Z" scores high against "PRUEBA A". This is the R-05 case: the
    // matcher proposes the merge, a human decides, nothing is written.
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({ institutionName: 'INSTITUCION DE PRUEBA Z', programName: PROGRAM_ONE }),
    ]);

    const [institution] = find(proposals, 'institution');
    expect(institution.classification).toBe('ambiguous_match');
    expect(institution.match.method).toBe('fuzzy');
    expect(decideApply(institution).apply).toBe(false);
  });

  it('proposes a new institution but never auto-creates one', () => {
    const { proposals, stats } = buildProposals(snapshot(), [
      conesRecord({ institutionName: 'ENTIDAD DE ENSAYO Q', programName: PROGRAM_ONE }),
    ]);

    const [institution] = find(proposals, 'institution');
    expect(institution.classification).toBe('new');
    expect(decideApply(institution).apply).toBe(false);
    // The program under it is deferred, not attached to a guessed parent.
    expect(find(proposals, 'program')).toHaveLength(0);
    expect(stats.deferred).toBe(1);
  });

  // CONES prints the acronym inside the name on most of its institutions. It
  // has to survive into the row, because `program_search` indexes it and the
  // search engine ranks an acronym hit first — a visitor typing "IPA" expects
  // the institution, not zero results.
  it('carries the printed acronym into the proposed institution', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({ institutionName: 'ENTIDAD DE ENSAYO Q – EEQ', programName: PROGRAM_ONE }),
    ]);

    const [institution] = find(proposals, 'institution');
    expect(institution.proposed).toMatchObject({
      // The official name stays exactly as the source printed it…
      nameOfficial: 'ENTIDAD DE ENSAYO Q – EEQ',
      // …while the card name and the URL drop the suffix.
      nameShort: 'ENTIDAD DE ENSAYO Q',
      slug: 'entidad-de-ensayo-q',
      acronym: 'EEQ',
    });
  });

  it('leaves the acronym null when the source never printed one', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({ institutionName: 'ENTIDAD DE ENSAYO Q', programName: PROGRAM_ONE }),
    ]);

    expect(find(proposals, 'institution')[0].proposed).toMatchObject({ acronym: null });
  });

  it('queues rather than applies a cones_code that contradicts what we hold', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({ institutionName: INSTITUTION_A, conesCode: 'C-999' }),
    ]);

    const [institution] = find(proposals, 'institution');
    // `conesCode` is in PROTECTED_FIELDS.institutions.
    expect(institution.classification).toBe('conflict');
    expect(decideApply(institution).apply).toBe(false);
  });

  it('learns an alias for a spelling that resolved by any route but the alias table', () => {
    const { aliasCandidates } = buildProposals(snapshot(), [
      conesRecord({ institutionName: 'Institución de Prueba "A"', conesCode: 'C-001' }),
    ]);

    expect(aliasCandidates).toEqual([
      {
        institutionId: 1,
        rawName: 'Institución de Prueba "A"',
        matchKey: buildMatchKey('Institución de Prueba "A"'),
      },
    ]);
  });

  it('does not learn an alias from a fuzzy match', () => {
    const { aliasCandidates } = buildProposals(snapshot(), [
      conesRecord({ institutionName: 'INSTITUCION DE PRUEVA A' }),
    ]);

    expect(aliasCandidates).toEqual([]);
  });

  it('creates a campus for a seeded city and defers the offering to the next run', () => {
    const { proposals } = buildProposals(snapshot({ campuses: [] }), [
      conesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        locationRaw: 'Asunción',
        modalityRaw: 'Presencial',
      }),
    ]);

    const [campus] = find(proposals, 'campus');
    expect(campus.proposed).toMatchObject({ institutionId: 1, cityId: 1 });
    expect(decideApply(campus).apply).toBe(true);
    expect(find(proposals, 'offering')).toHaveLength(0);
  });

  it('creates the offering once the campus exists', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        locationRaw: 'Asunción',
        modalityRaw: 'Presencial',
      }),
    ]);

    const [offering] = find(proposals, 'offering');
    expect(offering.proposed).toMatchObject({
      programId: 100,
      campusId: 1000,
      modality: 'presencial',
      shift: 'flexible',
    });
    expect(decideApply(offering).apply).toBe(true);
  });

  it('does not invent a modality the register did not print', () => {
    const { proposals } = buildProposals(snapshot(), [
      conesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        locationRaw: 'Asunción',
        modalityRaw: null,
      }),
    ]);

    expect(find(proposals, 'offering')).toHaveLength(0);
  });
});

describe('buildProposals — ANEAES', () => {
  it('writes an accreditation backed by a resolution number', () => {
    const { proposals } = buildProposals(snapshot(), [
      aneaesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        statusRaw: 'Acreditada',
        modelRaw: 'Modelo Nacional',
        resolutionNumber: 'RES-TEST-10',
        validToRaw: '2029-01-01',
      }),
    ]);

    const [accreditation] = find(proposals, 'accreditation');
    expect(accreditation.classification).toBe('new');
    expect(accreditation.proposed).toMatchObject({
      scope: 'program',
      programId: 100,
      agency: 'ANEAES',
      status: 'vigente',
      resolutionNumber: 'RES-TEST-10',
      validTo: '2029-01-01',
    });
    expect(decideApply(accreditation).apply).toBe(true);
  });

  it('never writes an accreditation from a citable:false row', () => {
    const { proposals } = buildProposals(snapshot(), [
      aneaesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        statusRaw: 'Acreditada',
        resolutionNumber: null,
      }),
    ]);

    const [accreditation] = find(proposals, 'accreditation');
    expect(accreditation.proposed).toMatchObject({ citable: false, sourceUrl: null });
    const decision = decideApply(accreditation);
    expect(decision.apply).toBe(false);
    expect(decision.reason).toBeTruthy();
  });

  it('proposes nothing at all when the source states no status — absence is sin_datos', () => {
    const { proposals } = buildProposals(snapshot(), [
      aneaesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        statusRaw: null,
        resolutionNumber: 'RES-TEST-12',
      }),
    ]);

    expect(find(proposals, 'accreditation')).toHaveLength(0);
    // And nothing anywhere in the batch asserts a negative.
    expect(JSON.stringify(proposals)).not.toContain('no_acreditada');
  });

  it('queues, never applies, a change of an existing accreditation status', () => {
    const withAccreditation = snapshot({
      accreditations: [
        {
          id: 500,
          scope: 'program',
          institutionId: null,
          programId: 100,
          offeringId: null,
          agency: 'ANEAES',
          kind: 'acreditacion',
          status: 'vigente',
          model: 'Modelo Nacional',
          resolutionNumber: 'RES-TEST-10',
          sourceUrl: null,
          validFrom: null,
          validTo: '2029-01-01',
        },
      ],
    });

    const { proposals } = buildProposals(withAccreditation, [
      aneaesRecord({
        institutionName: INSTITUTION_A,
        programName: PROGRAM_ONE,
        statusRaw: 'Vencida',
        resolutionNumber: 'RES-TEST-10',
        validToRaw: '2029-01-01',
      }),
    ]);

    const [accreditation] = find(proposals, 'accreditation');
    expect(accreditation.classification).toBe('conflict');
    expect(decideApply(accreditation).apply).toBe(false);
  });

  it('queues an accreditation whose program it cannot identify', () => {
    const { proposals } = buildProposals(snapshot(), [
      aneaesRecord({
        institutionName: INSTITUTION_A,
        programName: 'Una carrera que no tenemos',
        statusRaw: 'Acreditada',
        resolutionNumber: 'RES-TEST-13',
      }),
    ]);

    const [accreditation] = find(proposals, 'accreditation');
    expect(accreditation.proposed).toMatchObject({ programId: null });
    expect(decideApply(accreditation).apply).toBe(false);
  });

  it('does not treat a local file path as a citation', () => {
    const record = aneaesRecord({
      institutionName: INSTITUTION_A,
      programName: PROGRAM_ONE,
      statusRaw: 'Acreditada',
      resolutionNumber: null,
    });
    record.sourceUrl = './tmp/carreras.html';

    const { proposals } = buildProposals(snapshot(), [record]);
    const [accreditation] = find(proposals, 'accreditation');
    expect(accreditation.proposed).toMatchObject({ sourceUrl: null });
    expect(decideApply(accreditation).apply).toBe(false);
  });
});
