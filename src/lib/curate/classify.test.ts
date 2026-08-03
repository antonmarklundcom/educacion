/**
 * The classifier and the apply gates — the rules that decide whether anything
 * is written at all.
 *
 * Every assertion here corresponds to a line in `CLAUDE.md`, `risks.md` §R-09
 * or the PR-06 acceptance criteria. If one of them starts failing, the correct
 * response is not to update the test.
 */

import { describe, expect, it } from 'vitest';

import { PROTECTED_FIELDS, type CurationProposal, type MatchResult } from '@/lib/ingest/contract';

import {
  accreditationBlocker,
  applicableUpdate,
  decideApply,
  isAutoApplicable,
  missingCreateFields,
} from './apply-rules';
import { changedFields, classify, isProtectedField } from './classify';

const certain: MatchResult = { entityId: 1, method: 'match_key', score: 100, candidates: [] };
const fuzzy: MatchResult = {
  entityId: 1,
  method: 'fuzzy',
  score: 92,
  candidates: [{ entityId: 1, label: 'INSTITUCION DE PRUEBA A', score: 92 }],
};

function proposal(overrides: Partial<CurationProposal>): CurationProposal {
  return {
    entityType: 'program',
    entityId: 100,
    classification: 'changed',
    match: certain,
    current: {},
    proposed: {},
    sourceRecordId: 1,
    ...overrides,
  };
}

describe('changedFields', () => {
  it('ignores undefined (the source said nothing) but not null (the source said none)', () => {
    expect(changedFields({ a: 'x', b: 'y' }, { a: undefined, b: null })).toEqual(['b']);
  });

  it('ignores curation-only keys so a re-run stays unchanged', () => {
    expect(changedFields({ status: 'vigente' }, { status: 'vigente', citable: true })).toEqual([]);
  });
});

describe('classify', () => {
  it('calls a row with no current row new', () => {
    expect(
      classify({ entityType: 'program', current: null, proposed: { a: 1 }, match: certain }),
    ).toBe('new');
  });

  it('calls an identical row unchanged — this is what makes a re-run a no-op', () => {
    expect(
      classify({ entityType: 'program', current: { a: 1 }, proposed: { a: 1 }, match: certain }),
    ).toBe('unchanged');
  });

  it('calls a plain difference changed', () => {
    expect(
      classify({
        entityType: 'program',
        current: { conesResolution: 'RES-TEST-1' },
        proposed: { conesResolution: 'RES-TEST-2' },
        match: certain,
      }),
    ).toBe('changed');
  });

  it('calls a protected difference a conflict even when the match is certain', () => {
    expect(
      classify({
        entityType: 'program',
        current: { level: 'grado' },
        proposed: { level: 'maestria' },
        match: certain,
      }),
    ).toBe('conflict');
  });

  it('calls every fuzzy match ambiguous — fuzzy proposes, never applies', () => {
    expect(
      classify({ entityType: 'institution', current: null, proposed: { a: 1 }, match: fuzzy }),
    ).toBe('ambiguous_match');
  });

  it('protects exactly the fields the contract lists', () => {
    for (const field of PROTECTED_FIELDS.accreditations) {
      expect(isProtectedField('accreditation', field)).toBe(true);
    }
    expect(isProtectedField('accreditation', 'model')).toBe(false);
  });
});

describe('decideApply', () => {
  it('never applies a conflict', () => {
    expect(isAutoApplicable(proposal({ classification: 'conflict' }))).toBe(false);
  });

  it('never applies an ambiguous match', () => {
    expect(isAutoApplicable(proposal({ classification: 'ambiguous_match', match: fuzzy }))).toBe(
      false,
    );
  });

  it('never applies a fuzzy proposal, whatever the score', () => {
    const high: MatchResult = { ...fuzzy, score: 99 };
    expect(
      isAutoApplicable(
        proposal({ classification: 'ambiguous_match', match: high, entityId: null, current: null }),
      ),
    ).toBe(false);
  });

  it('strips protected fields from an update it does apply', () => {
    const update = applicableUpdate(
      'program',
      { level: 'grado', conesResolution: null },
      { level: 'maestria', conesResolution: 'RES-TEST-3' },
    );
    expect(update).toEqual({ conesResolution: 'RES-TEST-3' });
  });

  it('refuses a create whose NOT NULL fields the source did not supply', () => {
    const institution = proposal({
      entityType: 'institution',
      entityId: null,
      classification: 'new',
      current: null,
      proposed: {
        nameOfficial: 'INSTITUCION DE PRUEBA C',
        nameShort: 'INSTITUCION DE PRUEBA C',
        slug: 'institucion-de-prueba-c',
        matchKey: 'INSTITUCION PRUEBA C',
        // Neither register prints gestión. We do not guess it.
        management: null,
        type: null,
      },
    });

    expect(missingCreateFields('institution', institution.proposed)).toEqual([
      'management',
      'type',
    ]);
    const decision = decideApply(institution);
    expect(decision.apply).toBe(false);
    expect(decision.reason).toContain('management');
  });

  it('applies a create the source fully supports', () => {
    expect(
      isAutoApplicable(
        proposal({
          entityType: 'program',
          entityId: null,
          classification: 'new',
          current: null,
          proposed: {
            institutionId: 1,
            nameOfficial: 'Carrera de Prueba Dos',
            slug: 'carrera-de-prueba-dos',
            matchKey: 'PRUEBA DOS',
            level: 'grado',
          },
        }),
      ),
    ).toBe(true);
  });
});

describe('the accreditation gate (risks.md §R-09)', () => {
  const base = {
    scope: 'program',
    programId: 100,
    agency: 'ANEAES',
    kind: 'acreditacion',
    status: 'vigente',
  };

  it('refuses a positive status with neither source_url nor resolution_number', () => {
    expect(
      accreditationBlocker({ ...base, resolutionNumber: null, sourceUrl: null, citable: false }),
    ).toBeTruthy();
  });

  it('refuses a positive status from a citable:false row even if a URL leaked in', () => {
    // The parser already judged the row uncitable. A URL that arrived some
    // other way does not overrule that judgement.
    expect(
      accreditationBlocker({
        ...base,
        resolutionNumber: null,
        sourceUrl: 'https://source.test/listado',
        citable: false,
      }),
    ).toBe('la fila de origen no es citable');
  });

  it('accepts a positive status backed by a resolution number', () => {
    expect(
      accreditationBlocker({
        ...base,
        resolutionNumber: 'RES-TEST-10',
        sourceUrl: null,
        citable: true,
      }),
    ).toBeNull();
  });

  it('never auto-applies a negative status, even cited', () => {
    expect(
      accreditationBlocker({
        ...base,
        status: 'no_acreditada',
        resolutionNumber: 'RES-TEST-11',
        sourceUrl: 'https://source.test/res-test-11.pdf',
        citable: true,
      }),
    ).toBeTruthy();
  });

  it('never lets CONES be recorded as an accrediting agency', () => {
    expect(
      accreditationBlocker({
        ...base,
        agency: 'CONES',
        resolutionNumber: 'RES-TEST-1',
        citable: true,
      }),
    ).toBe('CONES habilita, no acredita');
  });

  it('blocks the whole proposal, not just the field', () => {
    expect(
      isAutoApplicable(
        proposal({
          entityType: 'accreditation',
          entityId: null,
          classification: 'new',
          current: null,
          proposed: { ...base, resolutionNumber: null, sourceUrl: null, citable: false },
        }),
      ),
    ).toBe(false);
  });
});
