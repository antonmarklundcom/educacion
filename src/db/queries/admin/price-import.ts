/**
 * Arancel bulk import: CSV → `prices` (PR-61). CLAUDE.md rule 5 — the SQL for
 * it lives here, and the parsing that needs no database lives in
 * `src/lib/admin/price-csv.ts`.
 *
 * ### Two calls, one verdict function
 *
 * `dryRunPriceCsv` and `applyPriceCsv` both run `verdictsFor`. The dry run
 * stops there and renders; the apply writes the rows that came back `create` or
 * `supersede` and nothing else. They are not two readings of the file that must
 * be kept in agreement — they are the same reading, called twice.
 *
 * That matters because the confirm step **re-uploads the file** rather than
 * trusting anything the browser round-tripped back to us. If the operator
 * edited the sheet between the two clicks, the apply acts on what it can see
 * and reports what it did, which is the only honest outcome available. A
 * server-side staging table would buy a stricter guarantee and cost a
 * migration, a purge policy and a second thing to get stale.
 *
 * ### What it will not do
 *
 * It never creates an institution, a programme, a campus or an offering. A row
 * whose slugs resolve to nothing is an error row — the same refusal
 * `data-sources.md` §4.6 makes for the register, for the same reason: a create
 * whose NOT NULL fields the source does not supply is a guess.
 */

import { and, eq } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { priceFreshness } from '@/db/invariants';
import { MODALITY, campuses, institutions, offerings, programs } from '@/db/schema';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import {
  isTruthy,
  parseVerifiedOn,
  priceRowFormData,
  readPriceCsv,
  type PriceCsvRow,
} from '@/lib/admin/price-csv';
import { parsePriceInput } from '@/lib/admin/validation';

import { currentPriceIdFor, supersedeCurrentPrice } from './prices';
import { rebuildProgramSearch } from '../rebuild-search';

export type PriceImportVerdict = 'create' | 'supersede' | 'error';

export interface PriceImportRowResult {
  /** 1-based, counting the header as row 1, so it matches the spreadsheet. */
  line: number;
  verdict: PriceImportVerdict;
  /** How the row names its offering, for a table a human reads. */
  label: string;
  offeringId: number | null;
  /** The form's own Spanish, one sentence per failing field. */
  errors: string[];
  /**
   * Set when the row is importable but its `verified_on` is already past the
   * 12-month boundary. Rule 3: it is imported and shown *with* the warning,
   * never hidden and never silently refreshed.
   */
  staleNote: string | null;
}

export interface PriceImportReport {
  /** Set when the file itself is unreadable; `rows` is then empty. */
  error?: string;
  rows: PriceImportRowResult[];
  counts: Record<PriceImportVerdict, number>;
  /** Only on an apply: how many rows were actually written. */
  applied?: number;
}

const STALE_NOTE =
  'Se importará como dato desactualizado: hace más de 12 meses que se verificó, así que sale con el aviso visible.';

/* -------------------------------------------------------------------------- */
/* Resolving the four slugs                                                   */
/* -------------------------------------------------------------------------- */

interface OfferingKey {
  institutionSlug: string;
  programSlug: string;
  campusSlug: string;
  modality: string;
}

function rowLabel(row: PriceCsvRow): string {
  return `${row.institution_slug}/${row.program_slug} · ${row.campus_slug} · ${row.modality}`;
}

/**
 * One query per distinct key, memoised across the file.
 *
 * A sheet routinely carries 30 rows for the same institution, and the resolver
 * is the only thing in the loop that touches the database before the write. It
 * returns every matching offering id rather than the first, because "more than
 * one" is a verdict (an ambiguous key) and not a tie to break silently — see
 * the note on `shift` in `price-csv.ts`.
 */
async function resolveOfferingIds(database: Db, key: OfferingKey): Promise<number[]> {
  const rows = await database
    .select({ id: offerings.id })
    .from(offerings)
    .innerJoin(programs, eq(programs.id, offerings.programId))
    .innerJoin(institutions, eq(institutions.id, programs.institutionId))
    .innerJoin(campuses, eq(campuses.id, offerings.campusId))
    .where(
      and(
        eq(institutions.slug, key.institutionSlug),
        eq(programs.slug, key.programSlug),
        eq(campuses.slug, key.campusSlug),
        // Validated against `MODALITY` before we get here, so the cast is a
        // formality for Drizzle's enum typing rather than a widening.
        eq(offerings.modality, key.modality as (typeof MODALITY)[number]),
      ),
    )
    .limit(5);
  return rows.map((row) => row.id);
}

/* -------------------------------------------------------------------------- */
/* Verdicts                                                                   */
/* -------------------------------------------------------------------------- */

interface ResolvedRow {
  result: PriceImportRowResult;
  /** Present only on an importable row — what the apply needs and nothing more. */
  write?: { offeringId: number; verifiedAt: Date; input: ReturnType<typeof parsePriceInput> };
}

async function verdictFor(
  database: Db,
  row: PriceCsvRow,
  line: number,
  cache: Map<string, number[]>,
  now: Date,
): Promise<ResolvedRow> {
  const label = rowLabel(row);
  const fail = (...errors: string[]): ResolvedRow => ({
    result: { line, verdict: 'error', label, offeringId: null, errors, staleNote: null },
  });

  const missing = (['institution_slug', 'program_slug', 'campus_slug', 'modality'] as const).filter(
    (column) => row[column] === '',
  );
  if (missing.length > 0) {
    return fail(`Faltan columnas de la clave: ${missing.join(', ')}.`);
  }

  // Checked before `parsePriceInput`, because an unrecognised word here would
  // otherwise pass as "not free" and publish a price for a gratuita.
  if (isTruthy(row.is_free) === null) {
    return fail(`No entiendo "${row.is_free}" en is_free. Poné si o no.`);
  }

  // Checked here rather than left to the lookup, which would return no rows
  // and blame the slugs. `sin_datos` is legal (PR-59) and is what most rows
  // will carry until an institution states otherwise.
  if (!(MODALITY as readonly string[]).includes(row.modality)) {
    return fail(`"${row.modality}" no es una modalidad. Usá: ${MODALITY.join(', ')}.`);
  }

  const verified = parseVerifiedOn(row.verified_on, now);
  if (!verified.date) return fail(verified.error!);

  const key: OfferingKey = {
    institutionSlug: row.institution_slug,
    programSlug: row.program_slug,
    campusSlug: row.campus_slug,
    modality: row.modality,
  };
  const cacheKey = Object.values(key).join('|');
  let ids = cache.get(cacheKey);
  if (!ids) {
    ids = await resolveOfferingIds(database, key);
    cache.set(cacheKey, ids);
  }

  if (ids.length === 0) {
    return fail(
      'No encontramos esa oferta. Revisá los cuatro slugs contra la URL de la carrera; no creamos instituciones, carreras, sedes ni ofertas desde una planilla.',
    );
  }
  if (ids.length > 1) {
    return fail(
      `Esa combinación corresponde a ${ids.length} ofertas (distinto turno). Cargalas desde el formulario.`,
    );
  }

  const offeringId = ids[0];
  const parsed = parsePriceInput(priceRowFormData(row, offeringId));
  if (!parsed.ok) {
    return {
      result: {
        line,
        verdict: 'error',
        label,
        offeringId,
        errors: Object.values(parsed.errors),
        staleNote: null,
      },
    };
  }

  const existing = await currentPriceIdFor(database, offeringId);
  const stale = priceFreshness(verified.date, now) !== 'fresh';

  return {
    result: {
      line,
      verdict: existing ? 'supersede' : 'create',
      label,
      offeringId,
      errors: [],
      staleNote: stale ? STALE_NOTE : null,
    },
    write: { offeringId, verifiedAt: verified.date, input: parsed },
  };
}

function emptyCounts(): Record<PriceImportVerdict, number> {
  return { create: 0, supersede: 0, error: 0 };
}

async function verdictsFor(
  database: Db,
  text: string,
  now: Date,
): Promise<{
  error?: string;
  resolved: ResolvedRow[];
  counts: Record<PriceImportVerdict, number>;
}> {
  const file = readPriceCsv(text);
  if (file.error) return { error: file.error, resolved: [], counts: emptyCounts() };

  const cache = new Map<string, number[]>();
  const resolved: ResolvedRow[] = [];
  const counts = emptyCounts();

  for (const [index, row] of file.rows.entries()) {
    // Sequential on purpose: the resolver cache only pays off if the second row
    // for an institution runs after the first, and a 500-row fan-out against a
    // `connectionLimit` of 8 would queue anyway (`data-model.md` §3).
    const entry = await verdictFor(database, row, index + 2, cache, now);
    counts[entry.result.verdict] += 1;
    resolved.push(entry);
  }

  return { resolved, counts };
}

/* -------------------------------------------------------------------------- */
/* The two entry points                                                       */
/* -------------------------------------------------------------------------- */

/** Read the file, resolve every row, write nothing. */
export async function dryRunPriceCsv(
  actor: SessionUser | null | undefined,
  text: string,
  database: Db = defaultDb,
  now: Date = new Date(),
): Promise<PriceImportReport> {
  requireRole(actor, ['editor']);
  const { error, resolved, counts } = await verdictsFor(database, text, now);
  return { error, rows: resolved.map((entry) => entry.result), counts };
}

/**
 * Write the rows the dry run would have called `create` or `supersede`.
 *
 * One transaction per row, not one for the file: a 500-row transaction on
 * shared hosting holds locks on `prices` for as long as the slowest row takes,
 * and a single bad row would roll back 499 good ones the operator would then
 * have to identify by hand. Per-row means the report is the truth — "escribimos
 * 480, fallaron 20" — which is what a bulk tool owes its operator.
 *
 * `rebuildProgramSearch` runs once, after the loop. It is a full replace, so
 * running it per row would be 500 rebuilds of the same table for one result.
 */
export async function applyPriceCsv(
  actor: SessionUser | null | undefined,
  text: string,
  database: Db = defaultDb,
  now: Date = new Date(),
): Promise<PriceImportReport> {
  const user = requireRole(actor, ['editor']);
  const { error, resolved, counts } = await verdictsFor(database, text, now);
  if (error) return { error, rows: [], counts };

  let applied = 0;
  const rows: PriceImportRowResult[] = [];

  for (const entry of resolved) {
    if (!entry.write || !entry.write.input.ok) {
      rows.push(entry.result);
      continue;
    }
    const { offeringId, verifiedAt, input } = entry.write;
    try {
      await database.transaction((tx) =>
        supersedeCurrentPrice(
          tx,
          {
            ...input.data,
            offeringId,
            isCurrent: true,
            verifiedAt,
            verifiedByUserId: user.id,
          },
          user.id,
        ),
      );
      applied += 1;
      rows.push(entry.result);
    } catch (cause) {
      counts[entry.result.verdict] -= 1;
      counts.error += 1;
      rows.push({
        ...entry.result,
        verdict: 'error',
        errors: [cause instanceof Error ? cause.message : 'No se pudo guardar esta fila.'],
      });
    }
  }

  if (applied > 0) await rebuildProgramSearch({ db: database });
  return { rows, counts, applied };
}
