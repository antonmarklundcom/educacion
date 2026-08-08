/**
 * The PR-19 negative case, extended to PR-20's five surfaces: every mutation
 * over prices, accreditations, admissions, the moderation queue and the bulk
 * verify must throw `AuthError` before it reaches the database when called with
 * no staff session — directly, not through the UI.
 *
 * These matter more than PR-19's did. Approving a conflict writes through the
 * importer's own path, and a bulk verify extends the life of every number it
 * touches; both are reachable as server actions, which are POST endpoints with
 * generated URLs and no layout guard in front of them.
 */

import { describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/auth/roles';

import { createPrice, retirePrice, updatePrice } from './prices';
import { createAccreditation, retractAccreditation, updateAccreditation } from './accreditations';
import { createAdmission, deactivateAdmission, updateAdmission } from './admissions';
import { listConflicts, resolveConflict, supersedeStaleConflicts } from './conflicts';
import { bulkVerify, listStalePrices, stalenessCounts } from './staleness';

const priceInput = {
  offeringId: 1,
  currency: 'PYG' as const,
  matricula: 500_000,
  monthlyFee: 1_450_000,
  installmentsPerYear: 10,
  admissionFee: null,
  isFree: false,
  notesMd: null,
  source: 'web_publica' as const,
  sourceUrl: 'https://example.edu.py/aranceles',
  validFrom: null,
  validTo: null,
};

const accreditationInput = {
  scope: 'program' as const,
  institutionId: null,
  programId: 1,
  offeringId: null,
  agency: 'ANEAES' as const,
  kind: 'acreditacion' as const,
  status: 'vigente' as const,
  model: null,
  resolutionNumber: 'RES-123/2026',
  resolutionDate: null,
  validFrom: null,
  validTo: null,
  sourceUrl: null,
};

const admissionInput = {
  scope: 'institution' as const,
  institutionId: 1,
  programId: null,
  offeringId: null,
  periodLabel: 'Convocatoria 2027 - 1er llamado',
  registrationOpens: '2026-11-01',
  registrationCloses: '2027-01-31',
  examDate: null,
  classesStart: null,
  requirementsMd: null,
  processMd: null,
  url: null,
  isActive: true,
};

describe('PR-20 mutations without a staff session', () => {
  it('prices: create, update and retire all throw', async () => {
    await expect(createPrice(null, priceInput)).rejects.toThrow(AuthError);
    await expect(updatePrice(null, 1, priceInput)).rejects.toThrow(AuthError);
    await expect(retirePrice(null, 1)).rejects.toThrow(AuthError);
  });

  it('accreditations: create, update and retract all throw', async () => {
    await expect(createAccreditation(null, accreditationInput)).rejects.toThrow(AuthError);
    await expect(updateAccreditation(null, 1, accreditationInput)).rejects.toThrow(AuthError);
    await expect(retractAccreditation(null, 1)).rejects.toThrow(AuthError);
  });

  it('admissions: create, update and deactivate all throw', async () => {
    await expect(createAdmission(null, admissionInput)).rejects.toThrow(AuthError);
    await expect(updateAdmission(null, 1, admissionInput)).rejects.toThrow(AuthError);
    await expect(deactivateAdmission(null, 1)).rejects.toThrow(AuthError);
  });

  it('the moderation queue refuses to be read or resolved', async () => {
    await expect(listConflicts(null)).rejects.toThrow(AuthError);
    await expect(resolveConflict(null, 1, { action: 'approve' })).rejects.toThrow(AuthError);
    await expect(supersedeStaleConflicts(null, 'program', 1, 2)).rejects.toThrow(AuthError);
  });

  it('the staleness surface and the bulk verify refuse', async () => {
    await expect(stalenessCounts(null)).rejects.toThrow(AuthError);
    await expect(listStalePrices(null)).rejects.toThrow(AuthError);
    await expect(bulkVerify(null, 'prices', [1, 2, 3])).rejects.toThrow(AuthError);
  });
});

describe('an institution user is not staff', () => {
  const institutionUser = {
    id: 7,
    role: 'institution_admin' as const,
    institutionId: 3,
    mustChangePassword: false,
  };

  /**
   * `roles.ts` is explicit that the roles are not a ladder: an
   * `institution_admin` outranks an `institution_editor` inside its own
   * institution and has no standing at all on a staff screen. This is that
   * rule asserted where it would actually be exploited — the moderation queue
   * carries every institution's data.
   */
  it('cannot resolve a conflict or bulk-verify', async () => {
    await expect(resolveConflict(institutionUser, 1, { action: 'approve' })).rejects.toThrow(
      AuthError,
    );
    await expect(bulkVerify(institutionUser, 'prices', [1])).rejects.toThrow(AuthError);
    await expect(createAccreditation(institutionUser, accreditationInput)).rejects.toThrow(
      AuthError,
    );
  });
});
