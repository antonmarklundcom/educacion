/**
 * PR-61's acceptance criteria, as tests.
 *
 * The fixture is four rows chosen to be the four things a real sheet contains:
 * one good row, one whose slugs resolve to nothing, one priced in cuotas with
 * no `installments_per_year`, and one verified more than 12 months ago. The
 * first three are the verdicts; the fourth is the rule-3 case — imported, and
 * flagged, never hidden and never silently refreshed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/lib/auth/roles';
import { PRICE_CSV_HEADER } from '@/lib/admin/price-csv';

import { applyPriceCsv, dryRunPriceCsv } from './price-import';
import { fakeDbState, makeFakeDb, type FakeDbState } from './__fixtures__/fake-db';

vi.mock('../rebuild-search', () => ({ rebuildProgramSearch: vi.fn(async () => undefined) }));

const NOW = new Date('2026-09-11T12:00:00Z');

const ADMIN = { id: 7, email: 'staff@test', role: 'admin', institutionId: null } as never;

const FIXTURE = readFileSync(join(__dirname, '__fixtures__/aranceles-fixture.csv'), 'utf8');

/** The offerings the fixture's first, third and fourth rows name. */
function seeded(overrides: Partial<FakeDbState> = {}): FakeDbState {
  return fakeDbState({
    offerings: [
      {
        id: 101,
        institutionSlug: 'institucion-de-prueba-a',
        programSlug: 'carrera-de-prueba-uno',
        campusSlug: 'sede-de-prueba',
        modality: 'sin_datos',
      },
      {
        id: 102,
        institutionSlug: 'institucion-de-prueba-a',
        programSlug: 'carrera-de-prueba-dos',
        campusSlug: 'sede-de-prueba',
        modality: 'presencial',
      },
      {
        id: 103,
        institutionSlug: 'institucion-de-prueba-a',
        programSlug: 'carrera-de-prueba-tres',
        campusSlug: 'sede-de-prueba',
        modality: 'distancia',
      },
    ],
    ...overrides,
  });
}

describe('the CSV template and the header the importer expects', () => {
  it('are the same list, in the same order', () => {
    const template = readFileSync(join(process.cwd(), 'data/templates/aranceles.csv'), 'utf8');
    expect(template.split('\n')[0].trim()).toBe(PRICE_CSV_HEADER.join(','));
  });

  it('ships an example row that could never be mistaken for real data', () => {
    const template = readFileSync(join(process.cwd(), 'data/templates/aranceles.csv'), 'utf8');
    const [, example] = template.trim().split('\n');
    expect(example).toContain('ejemplo-institucion');
    expect(example).toContain('fila de ejemplo');
    // Every amount is zero: no plausible arancel is shipped in this repo.
    expect(example.split(',').slice(5, 9).filter(Boolean)).toEqual(['0', '0', '10', '0']);
  });
});

describe('dryRunPriceCsv', () => {
  it('gives the four fixture rows their four verdicts', async () => {
    const state = seeded();
    const report = await dryRunPriceCsv(ADMIN, FIXTURE, makeFakeDb(state), NOW);

    expect(report.error).toBeUndefined();
    expect(report.rows.map((row) => row.verdict)).toEqual(['create', 'error', 'error', 'create']);
    expect(report.counts).toEqual({ create: 2, supersede: 0, error: 2 });
  });

  it('blames the slugs for the unresolvable row, and never creates anything', async () => {
    const state = seeded();
    const report = await dryRunPriceCsv(ADMIN, FIXTURE, makeFakeDb(state), NOW);

    expect(report.rows[1].errors.join(' ')).toContain('No encontramos esa oferta');
    expect(report.rows[1].offeringId).toBeNull();
    expect(state.inserted).toEqual([]);
    expect(state.offerings).toHaveLength(3);
  });

  it("uses the form's own sentence for a cuota with no number of cuotas", async () => {
    const report = await dryRunPriceCsv(ADMIN, FIXTURE, makeFakeDb(seeded()), NOW);
    expect(report.rows[2].errors.join(' ')).toContain('Indicá cuántas cuotas por año');
  });

  /** CLAUDE.md rule 3: a stale number is shown with its warning, not withheld. */
  it('imports a row verified more than 12 months ago, flagged as stale', async () => {
    const report = await dryRunPriceCsv(ADMIN, FIXTURE, makeFakeDb(seeded()), NOW);
    const stale = report.rows[3];

    expect(stale.verdict).toBe('create');
    expect(stale.staleNote).toContain('dato desactualizado');
    expect(report.rows[0].staleNote).toBeNull();
  });

  it('reads a quoted field containing a comma as one field', async () => {
    const report = await dryRunPriceCsv(ADMIN, FIXTURE, makeFakeDb(seeded()), NOW);
    // Row 1 parses at all only if `"incluye materiales, sin derecho de examen"`
    // did not shift every later column by one.
    expect(report.rows[0].verdict).toBe('create');
  });

  it('says a row already has a current price rather than calling it new', async () => {
    const state = seeded({ prices: [{ id: 1, offeringId: 101, isCurrent: true }] });
    const report = await dryRunPriceCsv(ADMIN, FIXTURE, makeFakeDb(state), NOW);
    expect(report.rows[0].verdict).toBe('supersede');
  });

  it('refuses a file whose header was reordered', async () => {
    const scrambled = FIXTURE.replace(
      'institution_slug,program_slug',
      'program_slug,institution_slug',
    );
    const report = await dryRunPriceCsv(ADMIN, scrambled, makeFakeDb(seeded()), NOW);
    expect(report.error).toContain('El encabezado no coincide');
    expect(report.rows).toEqual([]);
  });

  it('refuses a session with no staff role before it reads anything', async () => {
    await expect(dryRunPriceCsv(null, FIXTURE, makeFakeDb(seeded()), NOW)).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});

describe('applyPriceCsv', () => {
  it('writes exactly the valid rows, with one activity-log entry each', async () => {
    const state = seeded();
    const report = await applyPriceCsv(ADMIN, FIXTURE, makeFakeDb(state), NOW);

    expect(report.applied).toBe(2);
    expect(state.inserted).toHaveLength(2);
    expect(state.activity).toHaveLength(2);
    expect(state.inserted.map((row) => row.offeringId)).toEqual([101, 103]);
  });

  it('stamps verified_at from the row and verified_by from the session', async () => {
    const state = seeded();
    await applyPriceCsv(ADMIN, FIXTURE, makeFakeDb(state), NOW);

    const [first] = state.inserted;
    expect(first.verifiedAt).toEqual(new Date('2026-08-01T00:00:00Z'));
    expect(first.verifiedByUserId).toBe(7);
    // The stale row keeps its own old date — never refreshed to today.
    expect(state.inserted[1].verifiedAt).toEqual(new Date('2024-01-15T00:00:00Z'));
  });

  it('supersedes on a second identical apply rather than duplicating', async () => {
    const state = seeded();
    const db = makeFakeDb(state);

    await applyPriceCsv(ADMIN, FIXTURE, db, NOW);
    const second = await applyPriceCsv(ADMIN, FIXTURE, db, NOW);

    // Every row the first pass wrote is now the current one, so the second pass
    // calls them supersedes — and demotes exactly those before inserting.
    expect(second.rows.map((row) => row.verdict)).toEqual([
      'supersede',
      'error',
      'error',
      'supersede',
    ]);
    expect(state.demoted).toEqual([9001, 9002]);
    expect(state.prices.filter((row) => row.isCurrent && row.offeringId === 101)).toHaveLength(1);
  });

  it('writes one transaction per row, so a failing row does not roll back the others', async () => {
    const state = seeded({ failOnOfferingId: 103 });
    const report = await applyPriceCsv(ADMIN, FIXTURE, makeFakeDb(state), NOW);

    expect(report.applied).toBe(1);
    expect(state.inserted.map((row) => row.offeringId)).toEqual([101]);
    expect(report.counts.error).toBe(3);
    expect(report.rows[3].verdict).toBe('error');
    expect(report.rows[3].errors.join(' ')).toContain('current_offering_id');
  });

  it('refuses a session with no staff role', async () => {
    await expect(applyPriceCsv(null, FIXTURE, makeFakeDb(seeded()), NOW)).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});
