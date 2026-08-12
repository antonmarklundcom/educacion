/**
 * Becas are editorial data an `editor` may curate, and every mutation asserts
 * that inside the query module — same negative-case shape as
 * `mutations-require-role.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/auth/roles';
import type { BecaInput } from '@/lib/admin/validation';

import { archiveBeca, createBeca, updateBeca } from './becas';

const input: BecaInput = {
  slug: null,
  title: 'Beca de prueba',
  institutionId: null,
  providerName: 'Fundación X',
  areaId: null,
  type: 'privada',
  coverage: 'sin_datos',
  amountPyg: null,
  percentage: null,
  summary: 'Resumen',
  detailsMd: null,
  requirementsMd: null,
  applyUrl: null,
  sourceUrl: 'https://example.org/beca',
  deadline: null,
  status: 'draft',
};

describe('beca mutations without a staff session', () => {
  it('refuse to touch the database', async () => {
    await expect(createBeca(null, input)).rejects.toThrow(AuthError);
    await expect(updateBeca(null, 1, input)).rejects.toThrow(AuthError);
    await expect(archiveBeca(null, 1)).rejects.toThrow(AuthError);
  });
});
