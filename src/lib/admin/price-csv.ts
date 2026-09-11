/**
 * The arancel CSV contract — pure, no database, no session, no I/O (PR-61).
 *
 * ### Why a CSV at all
 *
 * `data-sources.md` §5 says arancel collection is fieldwork: 600–900 offerings
 * gathered by a person, one phone call and one web page at a time. That person
 * works in a spreadsheet, and the admin's one-price-at-a-time form is the wrong
 * instrument for a spreadsheet. This module is the other end of that sheet.
 *
 * ### Why the header keys on four slugs and not an offering id
 *
 * The header is the assistant's template. It gets printed, pasted into
 * WhatsApp, and filled in by a human for a year. An `offering_id` column would
 * be the most convenient thing for us and the most hostile thing for them:
 * a number they cannot look up, cannot sanity-check, and cannot notice they
 * have mistyped — `4711` is as plausible as `4171`, and the wrong one writes a
 * real price onto a real, different carrera. The four slugs
 * (`institution_slug`, `program_slug`, `campus_slug`, `modality`) are the same
 * four things that identify the offering in its own URL, so a filled row is
 * legible to the person who filled it and to the reviewer, and a typo produces
 * an error row rather than a wrong write.
 *
 * `modality` is part of the key because `offerings_uq` is
 * `(program_id, campus_id, modality, shift)` — one campus can run the same
 * programme presencial and a distancia at different prices. `sin_datos` is a
 * legal value there since PR-59, and is in fact what most rows will carry.
 * `shift` is deliberately **not** in the key: neither register prints a turno,
 * every imported offering is `flexible`, and asking a data assistant for a
 * column that is the same word on every row is how a template gets abandoned.
 * A programme + campus + modality that resolves to more than one offering is an
 * error row, not a guess — see `resolveOfferingKey` in the query module.
 *
 * ### What is never done here
 *
 * - **Validation is not forked.** Every row is turned into a `FormData` and
 *   handed to `parsePriceInput` — the same function the admin form calls, with
 *   the same Spanish messages. A second set of price rules that drifts from the
 *   form's is exactly the failure this shape exists to avoid.
 * - **Nothing is created to make a row fit.** An unresolvable slug is an error
 *   row. The importer never creates an institution, a programme, a campus or an
 *   offering — `data-sources.md` §4.6's refusals apply to a spreadsheet as much
 *   as to a register.
 * - **Money is never rounded and a currency is never assumed.** A missing
 *   `currency` is an error row, and `parsePriceInput`'s `optionalMoney` refuses
 *   a decimal point rather than rounding it (CLAUDE.md rule 1).
 */

/**
 * The columns, in order. This array **is** the template's header row, and
 * `data/templates/aranceles.csv` is generated from it in the test — so the file
 * an assistant downloads cannot drift from the file the importer expects.
 */
export const PRICE_CSV_HEADER = [
  'institution_slug',
  'program_slug',
  'campus_slug',
  'modality',
  'currency',
  'matricula',
  'monthly_fee',
  'installments_per_year',
  'admission_fee',
  'is_free',
  'source',
  'source_url',
  'valid_from',
  'valid_to',
  'notes',
  'verified_on',
] as const;

export type PriceCsvColumn = (typeof PRICE_CSV_HEADER)[number];

/**
 * Caps. Both are about the same thing: an apply runs inside a Server Action,
 * against shared hosting with a `connectionLimit` of 8, and each row is a
 * transaction plus an `activity_log` write. 500 rows is a working session's
 * worth of fieldwork and finishes inside the proxy's patience; a bigger sheet
 * is split, which also means a bad batch is 500 rows to review and not 5,000.
 */
export const MAX_IMPORT_ROWS = 500;
/** ~16 columns × 500 rows of plausible content, with room to spare. */
export const MAX_IMPORT_BYTES = 512 * 1024;

/** One data row, keyed by column name, exactly as the file spelled it. */
export type PriceCsvRow = Record<PriceCsvColumn, string>;

export interface PriceCsvFile {
  rows: PriceCsvRow[];
  /** Set when the file cannot be read at all. No rows are returned with it. */
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * RFC 4180 by hand, because CLAUDE.md forbids a dependency for it.
 *
 * The cases that actually occur in this file and that a naive `split(',')`
 * gets wrong: a quoted `notes` field containing a comma ("incluye materiales,
 * sin derecho de examen"), a doubled `""` inside one, and Windows line endings
 * from a sheet exported on a laptop. A BOM too — Excel writes one and it turns
 * the first header into `﻿institution_slug`.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
    started = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === ',') {
      endField();
      continue;
    }
    if (char === '\r') {
      // Swallow CR; the LF that follows ends the row. A lone CR ends it too.
      if (source[i + 1] === '\n') i += 1;
      endRow();
      continue;
    }
    if (char === '\n') {
      endRow();
      continue;
    }
    field += char;
    started = true;
  }

  // A file that does not end in a newline still has a last row; one that does
  // must not gain a phantom empty one.
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((entry) => !(entry.length === 1 && entry[0].trim() === ''));
}

/**
 * File text → rows keyed by column, or the one error that stops everything.
 *
 * The header is checked as an exact list rather than "contains what we need":
 * a sheet with the columns reordered is a sheet somebody edited, and reading it
 * positionally anyway is how `monthly_fee` ends up in `matricula`.
 */
export function readPriceCsv(text: string): PriceCsvFile {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: 'El archivo está vacío.' };

  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const expected = PRICE_CSV_HEADER as readonly string[];
  if (header.length !== expected.length || header.some((cell, i) => cell !== expected[i])) {
    return {
      rows: [],
      error:
        'El encabezado no coincide con la plantilla. Tiene que ser exactamente, y en este orden: ' +
        `${expected.join(', ')}. Bajá data/templates/aranceles.csv y partí de ahí.`,
    };
  }

  const body = table.slice(1);
  if (body.length === 0) return { rows: [], error: 'El archivo solo tiene el encabezado.' };
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      error: `El archivo tiene ${body.length} filas y el máximo por corrida es ${MAX_IMPORT_ROWS}. Partilo en varios archivos.`,
    };
  }

  const rows = body.map((cells) => {
    const entry = {} as PriceCsvRow;
    for (const [index, column] of PRICE_CSV_HEADER.entries()) {
      entry[column] = (cells[index] ?? '').trim();
    }
    return entry;
  });

  return { rows };
}

/* -------------------------------------------------------------------------- */
/* Row → FormData                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The bridge to `parsePriceInput`: a CSV row wearing the admin form's clothes.
 *
 * `offeringId` is supplied by the caller because the CSV does not carry one —
 * it is the result of resolving the four slugs, which needs the database and
 * therefore happens in `src/db/queries/admin/price-import.ts`.
 *
 * `isFree` is the one field whose form encoding is not its CSV encoding: an
 * unchecked HTML checkbox sends *nothing*, so the key is appended only for a
 * truthy cell. Anything but the accepted truthy words is false — and a cell
 * with an unrecognised word in it is flagged before we get here, because
 * "si " with a typo silently meaning "not free" is a price error.
 */
export function priceRowFormData(row: PriceCsvRow, offeringId: number): FormData {
  const form = new FormData();
  form.set('offeringId', String(offeringId));
  form.set('currency', row.currency.toUpperCase());
  form.set('matricula', row.matricula);
  form.set('monthlyFee', row.monthly_fee);
  form.set('installmentsPerYear', row.installments_per_year);
  form.set('admissionFee', row.admission_fee);
  form.set('source', row.source.toLowerCase());
  form.set('sourceUrl', row.source_url);
  form.set('validFrom', row.valid_from);
  form.set('validTo', row.valid_to);
  form.set('notesMd', row.notes);
  if (isTruthy(row.is_free) === true) form.set('isFree', 'on');
  return form;
}

const TRUE_WORDS = new Set(['si', 'sí', 'true', '1', 'x', 'verdadero']);
const FALSE_WORDS = new Set(['', 'no', 'false', '0', 'falso']);

/** `true` / `false` / `null` when the cell says something we will not guess at. */
export function isTruthy(cell: string): boolean | null {
  const value = cell.trim().toLowerCase();
  if (TRUE_WORDS.has(value)) return true;
  if (FALSE_WORDS.has(value)) return false;
  return null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `verified_on` is the date somebody actually checked the number, and it
 * becomes `prices.verified_at` — the clock the whole 12-month display rule is
 * measured from (`data-model.md` §2). It is required: a row with no date is a
 * number nobody will admit to having checked, and defaulting it to today would
 * fabricate the one fact that makes the arancel trustworthy.
 */
export function parseVerifiedOn(
  cell: string,
  now: Date = new Date(),
): { date?: Date; error?: string } {
  const raw = cell.trim();
  if (!raw) {
    return {
      error: 'Falta verified_on: poné la fecha en que verificaste el arancel (AAAA-MM-DD).',
    };
  }
  if (!DATE_PATTERN.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    return { error: 'verified_on tiene que ser una fecha AAAA-MM-DD.' };
  }
  const date = new Date(`${raw}T00:00:00Z`);
  // A future date would move the 12-month clock forward, which is the one
  // direction it must never move by accident: it would make a stale number
  // look fresh and suppress its "dato desactualizado" warning (CLAUDE.md
  // rule 3). Almost always a year typo.
  if (date.getTime() > now.getTime()) {
    return { error: 'verified_on está en el futuro. Revisá el año.' };
  }
  return { date };
}
