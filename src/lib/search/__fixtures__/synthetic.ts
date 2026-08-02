/**
 * A synthetic `program_search` dataset for facet, sort and latency tests.
 *
 * ⚠️ THIS IS NOT SEED DATA AND MUST NEVER BECOME SEED DATA. ⚠️
 *
 * CLAUDE.md rule 1 forbids invented institutions, programs, aranceles and
 * accreditation statuses — in the UI, in seed data and in fixtures alike. The
 * way out is not to invent *plausible* Paraguayan data; it is to generate data
 * that could not possibly be mistaken for real. Every name here is literally
 * "Institución de prueba 042" / "Programa de prueba 137", every number is a
 * function of the row index, and nothing in this file may be written to the
 * production database. `scripts/search-bench.ts` refuses to run against
 * `DATABASE_URL` for exactly that reason.
 *
 * What it is legitimately for:
 *  - proving the eight facet groups cross-filter correctly,
 *  - proving sorting, pagination and the `plan_rank` tiebreaker,
 *  - measuring p95 latency at a realistic row count before real data exists.
 */

import { priceExpiresOn } from '@/db/invariants';

import { buildSearchText } from '../normalize';
import type { ProgramSearchRow } from '../row';

const LEVELS = ['tecnicatura', 'grado', 'especializacion', 'maestria', 'doctorado'] as const;
const MODALITIES = ['presencial', 'semipresencial', 'distancia'] as const;
const SHIFTS = ['manana', 'tarde', 'noche', 'flexible'] as const;
const MANAGEMENTS = ['publica', 'privada'] as const;
const INSTITUTION_TYPES = [
  'universidad',
  'instituto_superior',
  'instituto_tecnico',
  'ifd',
  'otro',
] as const;
const ACCREDITATION_STATUSES = [
  'vigente',
  'en_proceso',
  'vencida',
  'no_acreditada',
  'sin_datos',
] as const;
const ENROLLMENT_STATUSES = ['abiertas', 'proximamente', 'cerradas', 'sin_datos'] as const;

/**
 * Accented on purpose: the index is what proves accent-insensitivity works.
 *
 * The numbering is three digits everywhere in this file so that every
 * generated token clears `innodb_ft_min_token_size` — a fixture whose numbers
 * are invisible to FULLTEXT would test the wrong code path.
 */
const SYNTHETIC_AREAS = [
  { slug: 'area-de-prueba-001', name: 'Área de prueba 001' },
  { slug: 'area-de-prueba-002', name: 'Área de prueba 002' },
  { slug: 'area-de-prueba-003', name: 'Área de prueba 003' },
  { slug: 'area-de-prueba-004', name: 'Área de prueba 004' },
] as const;

export const SYNTHETIC_AREA_OPTIONS = SYNTHETIC_AREAS.map((area) => ({
  slug: area.slug,
  name: area.name,
}));

const SHORT_ACRONYMS = ['ZA', 'ZB', 'ZC', 'ZD'] as const;

const pad = (value: number, width = 3) => String(value).padStart(width, '0');

function daysFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export interface SyntheticOptions {
  /** Everything relative to this instant, so tests are not time-dependent. */
  now?: Date;
  /** Number of distinct synthetic institutions. */
  institutions?: number;
  /** Number of distinct synthetic cities. */
  cities?: number;
}

/**
 * `count` rows with fully deterministic, index-derived attributes — the same
 * input always produces the same dataset, so a failing assertion is
 * reproducible.
 */
export function makeSyntheticRows(
  count: number,
  options: SyntheticOptions = {},
): ProgramSearchRow[] {
  const now = options.now ?? new Date('2026-08-02T12:00:00Z');
  const institutionCount = options.institutions ?? 40;
  const cityCount = options.cities ?? 12;
  const rows: ProgramSearchRow[] = [];

  for (let i = 0; i < count; i += 1) {
    const institutionIndex = i % institutionCount;
    const cityIndex = i % cityCount;
    const areaIndex = i % SYNTHETIC_AREAS.length;
    const area = SYNTHETIC_AREAS[areaIndex];

    // Every fourth row has no price at all, every fifth priced row is stale
    // past the 12-month boundary, and one in nine is free.
    const hasPrice = i % 4 !== 0;
    const isStale = hasPrice && i % 5 === 0;
    const isFree = hasPrice && !isStale && i % 9 === 0;
    const verifiedAt = hasPrice ? daysFromNow(now, isStale ? -400 : -30) : null;
    const monthlyFee = isFree ? null : 300_000 + (i % 20) * 50_000;
    const installments = isFree ? null : 10;
    const matricula = isFree ? null : 500_000;
    const annualCost = isFree ? 0 : (matricula ?? 0) + (monthlyFee ?? 0) * (installments ?? 0);

    const accreditationStatus = ACCREDITATION_STATUSES[i % ACCREDITATION_STATUSES.length];
    const asserts = accreditationStatus === 'vigente' || accreditationStatus === 'en_proceso';

    // Every tenth institution gets a two-letter acronym, which is below
    // `innodb_ft_min_token_size` — that is the row shape the `LIKE` fallback on
    // `institution_short` exists for, so the fixture has to contain some.
    const institutionShort =
      institutionIndex % 10 === 0
        ? SHORT_ACRONYMS[(institutionIndex / 10) % SHORT_ACRONYMS.length]
        : `IP${pad(institutionIndex, 2)}`;
    const institutionName = `Institución de prueba ${pad(institutionIndex)}`;
    const programName = `Programa de prueba ${pad(i, 5)}`;
    const cityName = `Ciudad de prueba ${pad(cityIndex)}`;
    const departmentIndex = cityIndex % 6;
    const departmentName = `Departamento de prueba ${pad(departmentIndex)}`;
    const careerName = `Carrera de prueba ${pad(i % 60)}`;

    rows.push({
      offeringId: i + 1,
      programId: i + 1,
      institutionId: institutionIndex + 1,
      careerId: (i % 60) + 1,
      campusId: (i % 80) + 1,
      cityId: cityIndex + 1,
      departmentId: departmentIndex + 1,
      areaId: areaIndex + 1,

      institutionSlug: `institucion-de-prueba-${pad(institutionIndex)}`,
      programSlug: `programa-de-prueba-${pad(i, 5)}`,
      careerSlug: `carrera-de-prueba-${pad(i % 60)}`,
      areaSlug: area.slug,
      citySlug: `ciudad-de-prueba-${pad(cityIndex)}`,
      departmentSlug: `departamento-de-prueba-${pad(departmentIndex)}`,

      programName,
      careerName,
      titleAwarded: `Título de prueba ${pad(i % 60)}`,
      institutionName,
      institutionShort,
      institutionLogo: null,
      brandColor: null,
      campusName: `Sede de prueba ${pad(i % 80)}`,
      cityName,
      departmentName,

      level: LEVELS[i % LEVELS.length],
      modality: MODALITIES[i % MODALITIES.length],
      shift: SHIFTS[i % SHIFTS.length],
      management: MANAGEMENTS[institutionIndex % MANAGEMENTS.length],
      institutionType: INSTITUTION_TYPES[institutionIndex % INSTITUTION_TYPES.length],
      durationMonths: i % 7 === 0 ? null : 24 + (i % 6) * 12,

      priceCurrency: hasPrice ? 'PYG' : null,
      matriculaGs: hasPrice ? matricula : null,
      monthlyFeeGs: hasPrice ? monthlyFee : null,
      installmentsPerYear: hasPrice ? installments : null,
      admissionFeeGs: hasPrice ? 150_000 : null,
      annualCostGs: hasPrice ? annualCost : null,
      isFree,
      priceVerifiedAt: verifiedAt,
      // Written exactly the way `search:rebuild` writes it.
      priceExpiresOn: (() => {
        const expiry = priceExpiresOn(verifiedAt);
        return expiry ? dateOnly(expiry) : null;
      })(),

      accreditationStatus,
      accreditationAgency: accreditationStatus === 'sin_datos' ? null : 'ANEAES',
      accreditationSourceUrl: asserts ? `https://example.test/resolucion/${i}` : null,
      accreditationValidTo: asserts ? dateOnly(daysFromNow(now, 400)) : null,

      enrollmentStatus: ENROLLMENT_STATUSES[i % ENROLLMENT_STATUSES.length],
      admissionClosesOn: i % 3 === 0 ? dateOnly(daysFromNow(now, 45)) : null,

      planRank: institutionIndex % 17 === 0 ? 2 : institutionIndex % 7 === 0 ? 1 : 0,
      isPublished: i % 50 !== 0,

      // Built with the real indexer, so the fixture cannot drift from what
      // `search:rebuild` would actually write.
      searchText: buildSearchText({
        institutionName,
        institutionShort,
        programName,
        careerName,
        cityName,
        departmentName,
        areaName: area.name,
      }),
      updatedAt: now,
    });
  }

  return rows;
}
