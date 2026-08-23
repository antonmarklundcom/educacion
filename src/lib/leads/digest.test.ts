import { describe, expect, it } from 'vitest';

import { digestBody } from './digest';

describe('digestBody', () => {
  const now = new Date('2026-08-12T00:00:00Z');

  it('uses singular wording for one lead', () => {
    const body = digestBody(
      'Universidad Nacional',
      {
        institutionId: 1,
        newCount: 1,
        overdueCount: 0,
        oldestCreatedAt: now,
      },
      now,
    );
    expect(body).toContain('Tenés 1 solicitud sin responder');
  });

  it('uses plural wording and reports the wait for older leads', () => {
    const oldest = new Date('2026-08-09T00:00:00Z');
    const body = digestBody(
      'Universidad Nacional',
      { institutionId: 1, newCount: 3, overdueCount: 3, oldestCreatedAt: oldest },
      now,
    );
    expect(body).toContain('Tenés 3 solicitudes sin responder');
    expect(body).toContain('3 días esperando');
  });

  it('omits the waiting sentence when the lead just arrived', () => {
    const body = digestBody(
      'Universidad Nacional',
      { institutionId: 1, newCount: 1, overdueCount: 0, oldestCreatedAt: now },
      now,
    );
    expect(body).not.toContain('esperando');
  });

  /**
   * PR-49. The digest is the copy of the nudge that reaches an institution
   * which never logs in, so the count it states is the same count the panel
   * banner shows — and it says nothing at all when nothing is late.
   */
  it('states how many are past the 48 h SLA', () => {
    const body = digestBody(
      'Universidad Nacional',
      {
        institutionId: 1,
        newCount: 5,
        overdueCount: 2,
        oldestCreatedAt: new Date('2026-08-09T00:00:00Z'),
      },
      now,
    );
    expect(body).toContain('2 de ellas esperan hace más de 48 horas.');
  });

  it('uses the singular for one late lead', () => {
    const body = digestBody(
      'Universidad Nacional',
      {
        institutionId: 1,
        newCount: 3,
        overdueCount: 1,
        oldestCreatedAt: new Date('2026-08-09T00:00:00Z'),
      },
      now,
    );
    expect(body).toContain('1 de ellas espera hace más de 48 horas.');
  });

  it('omits the SLA sentence entirely when nothing is late', () => {
    const body = digestBody(
      'Universidad Nacional',
      { institutionId: 1, newCount: 4, overdueCount: 0, oldestCreatedAt: now },
      now,
    );
    expect(body).not.toContain('48 horas');
  });
});
