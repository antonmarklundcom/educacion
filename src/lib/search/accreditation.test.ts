import { describe, expect, it } from 'vitest';

import { resolveAccreditation, type AccreditationCandidate } from './accreditation';

const NOW = new Date('2026-08-02T12:00:00Z');

function candidate(overrides: Partial<AccreditationCandidate> = {}): AccreditationCandidate {
  return {
    id: 1,
    scope: 'program',
    agency: 'ANEAES',
    status: 'vigente',
    sourceUrl: 'https://example.test/resolucion/1',
    resolutionNumber: null,
    resolutionDate: '2025-01-15',
    validTo: '2030-01-15',
    verifiedAt: new Date('2026-01-01T00:00:00Z'),
    isDisputed: false,
    ...overrides,
  };
}

describe('resolveAccreditation', () => {
  it('is sin_datos when there is nothing to say', () => {
    expect(resolveAccreditation([], NOW)).toEqual({
      status: 'sin_datos',
      agency: null,
      sourceUrl: null,
      validTo: null,
    });
  });

  it('prefers the more specific scope even when the broader row looks better', () => {
    const resolved = resolveAccreditation(
      [
        candidate({ id: 1, scope: 'institution', status: 'vigente' }),
        candidate({ id: 2, scope: 'program', status: 'no_acreditada', validTo: null }),
      ],
      NOW,
    );
    expect(resolved.status).toBe('no_acreditada');
  });

  it('ranks by status within one scope', () => {
    const resolved = resolveAccreditation(
      [
        candidate({ id: 1, status: 'en_proceso' }),
        candidate({ id: 2, status: 'vigente' }),
        candidate({ id: 3, status: 'vencida', sourceUrl: null }),
      ],
      NOW,
    );
    expect(resolved.status).toBe('vigente');
  });

  it('treats a lapsed vigente as vencida rather than claiming it is current', () => {
    const resolved = resolveAccreditation(
      [candidate({ validTo: '2025-01-01', resolutionDate: '2020-01-01' })],
      NOW,
    );
    expect(resolved.status).toBe('vencida');
    expect(resolved.validTo).toBe('2025-01-01');
  });

  it('drops disputed rows entirely', () => {
    const resolved = resolveAccreditation([candidate({ isDisputed: true })], NOW);
    expect(resolved.status).toBe('sin_datos');
    expect(resolved.sourceUrl).toBeNull();
  });

  it('drops a positive claim with no citation — no citation, no badge', () => {
    const resolved = resolveAccreditation(
      [candidate({ status: 'vigente', sourceUrl: null, resolutionNumber: null })],
      NOW,
    );
    expect(resolved.status).toBe('sin_datos');
  });

  it('accepts a resolution number as the citation', () => {
    const resolved = resolveAccreditation(
      [candidate({ sourceUrl: null, resolutionNumber: 'Res. 123/2025' })],
      NOW,
    );
    expect(resolved.status).toBe('vigente');
  });

  it('holds an uncited no_acreditada to the same bar, degrading to sin_datos', () => {
    const resolved = resolveAccreditation(
      [candidate({ status: 'no_acreditada', sourceUrl: null, resolutionNumber: '  ' })],
      NOW,
    );
    expect(resolved.status).toBe('sin_datos');
  });

  it('breaks ties on the newest resolution, then deterministically on id', () => {
    const older = candidate({ id: 9, resolutionDate: '2024-01-01' });
    const newer = candidate({ id: 3, resolutionDate: '2026-01-01', validTo: '2031-01-01' });
    expect(resolveAccreditation([older, newer], NOW).validTo).toBe('2031-01-01');

    const a = candidate({ id: 7, resolutionDate: null, verifiedAt: null, validTo: '2031-02-02' });
    const b = candidate({ id: 4, resolutionDate: null, verifiedAt: null, validTo: '2031-03-03' });
    expect(resolveAccreditation([a, b], NOW).validTo).toBe('2031-03-03');
  });

  it('carries the source link with the badge, never one without the other', () => {
    const resolved = resolveAccreditation([candidate()], NOW);
    expect(resolved.sourceUrl).toBe('https://example.test/resolucion/1');
    expect(resolved.agency).toBe('ANEAES');
  });
});
