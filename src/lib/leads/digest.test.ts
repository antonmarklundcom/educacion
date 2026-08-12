import { describe, expect, it } from 'vitest';

import { digestBody } from './digest';

describe('digestBody', () => {
  const now = new Date('2026-08-12T00:00:00Z');

  it('uses singular wording for one lead', () => {
    const body = digestBody('Universidad Nacional', {
      institutionId: 1,
      newCount: 1,
      oldestCreatedAt: now,
    }, now);
    expect(body).toContain('Tenés 1 solicitud sin responder');
  });

  it('uses plural wording and reports the wait for older leads', () => {
    const oldest = new Date('2026-08-09T00:00:00Z');
    const body = digestBody('Universidad Nacional', { institutionId: 1, newCount: 3, oldestCreatedAt: oldest }, now);
    expect(body).toContain('Tenés 3 solicitudes sin responder');
    expect(body).toContain('3 días esperando');
  });

  it('omits the waiting sentence when the lead just arrived', () => {
    const body = digestBody('Universidad Nacional', { institutionId: 1, newCount: 1, oldestCreatedAt: now }, now);
    expect(body).not.toContain('esperando');
  });
});
