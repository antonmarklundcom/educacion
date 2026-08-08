/**
 * The same negative case as `institutions.test.ts`, for the remaining four
 * entities: every mutation must throw `AuthError` before it reaches the
 * database when called with no staff session — directly, not through the UI.
 */

import { describe, expect, it } from 'vitest';

import { AuthError } from '@/lib/auth/roles';

import { archiveCampus, createCampus, updateCampus } from './campuses';
import { archiveCareer, createCareer, updateCareer } from './careers';
import { archiveProgram, createProgram, updateProgram } from './programs';
import { archiveOffering, createOffering, updateOffering } from './offerings';

const campusInput = {
  institutionId: 1,
  name: 'Sede Central',
  slug: null,
  cityId: 1,
  address: null,
  phoneE164: null,
  isMain: false,
  status: 'published' as const,
};

const careerInput = {
  slug: null,
  nameEs: 'Medicina',
  areaId: null,
  levelDefault: 'grado' as const,
  synonyms: [],
  descriptionMd: null,
  salidaLaboralMd: null,
  status: 'draft' as const,
};

const programInput = {
  institutionId: 1,
  careerId: null,
  nameOfficial: 'Medicina y Cirugía',
  slug: null,
  level: 'grado' as const,
  titleAwarded: null,
  descriptionMd: null,
  conesResolution: null,
  status: 'draft' as const,
};

const offeringInput = {
  programId: 1,
  campusId: 1,
  modality: 'presencial' as const,
  shift: 'manana' as const,
  durationMonths: null,
  credits: null,
  planUrl: null,
  status: 'draft' as const,
};

describe('admin mutations without a staff session', () => {
  it('campuses: create, update and archive all throw', async () => {
    await expect(createCampus(null, campusInput)).rejects.toThrow(AuthError);
    await expect(updateCampus(null, 1, campusInput)).rejects.toThrow(AuthError);
    await expect(archiveCampus(null, 1)).rejects.toThrow(AuthError);
  });

  it('careers: create, update and archive all throw', async () => {
    await expect(createCareer(null, careerInput)).rejects.toThrow(AuthError);
    await expect(updateCareer(null, 1, careerInput)).rejects.toThrow(AuthError);
    await expect(archiveCareer(null, 1)).rejects.toThrow(AuthError);
  });

  it('programs: create, update and archive all throw', async () => {
    await expect(createProgram(null, programInput)).rejects.toThrow(AuthError);
    await expect(updateProgram(null, 1, programInput)).rejects.toThrow(AuthError);
    await expect(archiveProgram(null, 1)).rejects.toThrow(AuthError);
  });

  it('offerings: create, update and archive all throw', async () => {
    await expect(createOffering(null, offeringInput)).rejects.toThrow(AuthError);
    await expect(updateOffering(null, 1, offeringInput)).rejects.toThrow(AuthError);
    await expect(archiveOffering(null, 1)).rejects.toThrow(AuthError);
  });
});
