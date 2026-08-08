/**
 * The negative case PR-19 is graded on: a mutation invoked directly, with no
 * staff session, must throw before it ever reaches the database. These call
 * the query-module functions the way a forged server-action request would —
 * not through any UI, not through the layout guard.
 */

import { describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';

import { archiveInstitution, createInstitution, updateInstitution } from './institutions';

const validInput = {
  slug: null,
  nameOfficial: 'Universidad de Prueba',
  nameShort: 'UP',
  acronym: null,
  management: 'privada' as const,
  type: 'universidad' as const,
  conesCode: null,
  foundedYear: null,
  website: null,
  email: null,
  phoneE164: null,
  whatsappE164: null,
  brandColor: null,
  descriptionMd: null,
  status: 'draft' as const,
};

const institutionEditor: SessionUser = {
  id: 9,
  role: 'institution_editor',
  institutionId: 3,
  mustChangePassword: false,
};

describe('admin institution mutations without a staff session', () => {
  it('createInstitution throws for an anonymous caller', async () => {
    await expect(createInstitution(null, validInput)).rejects.toThrow(AuthError);
  });

  it('createInstitution throws for a signed-in institution user (not staff)', async () => {
    await expect(createInstitution(institutionEditor, validInput)).rejects.toThrow(AuthError);
  });

  it('updateInstitution throws before reading anything, for an anonymous caller', async () => {
    await expect(updateInstitution(null, 1, validInput)).rejects.toThrow(AuthError);
  });

  it('archiveInstitution throws for an anonymous caller', async () => {
    await expect(archiveInstitution(null, 1)).rejects.toThrow(AuthError);
  });

  it('archiveInstitution throws for an institution-scoped user', async () => {
    await expect(archiveInstitution(institutionEditor, 1)).rejects.toThrow(AuthError);
  });
});
