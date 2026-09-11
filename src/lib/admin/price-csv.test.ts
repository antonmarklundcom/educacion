/**
 * The hand-written CSV parser, and the row→FormData bridge.
 *
 * CLAUDE.md forbids a dependency for this, so the cases a library would have
 * handled are the cases this file has to pin: quoted commas, doubled quotes,
 * CRLF, a BOM from Excel, and a trailing newline that must not become a row.
 */

import { describe, expect, it } from 'vitest';

import { parsePriceInput } from './validation';
import {
  MAX_IMPORT_ROWS,
  PRICE_CSV_HEADER,
  isTruthy,
  parseCsv,
  parseVerifiedOn,
  priceRowFormData,
  readPriceCsv,
  type PriceCsvRow,
} from './price-csv';

const HEADER = PRICE_CSV_HEADER.join(',');
const NOW = new Date('2026-09-11T12:00:00Z');

function row(overrides: Partial<PriceCsvRow> = {}): PriceCsvRow {
  return {
    institution_slug: 'una',
    program_slug: 'medicina',
    campus_slug: 'asuncion',
    modality: 'sin_datos',
    currency: 'PYG',
    matricula: '500000',
    monthly_fee: '1450000',
    installments_per_year: '10',
    admission_fee: '',
    is_free: 'no',
    source: 'institucion',
    source_url: '',
    valid_from: '',
    valid_to: '',
    notes: '',
    verified_on: '2026-08-01',
    ...overrides,
  };
}

describe('parseCsv', () => {
  it('keeps a comma inside a quoted field', () => {
    expect(parseCsv('a,"uno, dos",c')).toEqual([['a', 'uno, dos', 'c']]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a,"dice ""hola""",c')).toEqual([['a', 'dice "hola"', 'c']]);
  });

  it('handles CRLF and a trailing newline without inventing a row', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('strips the BOM Excel writes', () => {
    expect(parseCsv('﻿institution_slug,b')[0][0]).toBe('institution_slug');
  });

  it('keeps an empty field rather than collapsing it', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('a,"uno\ndos",c')).toEqual([['a', 'uno\ndos', 'c']]);
  });
});

describe('readPriceCsv', () => {
  it('refuses a file that is only a header', () => {
    expect(readPriceCsv(HEADER).error).toContain('solo tiene el encabezado');
  });

  it('refuses an empty file', () => {
    expect(readPriceCsv('').error).toContain('vacío');
  });

  it('refuses a header with a missing or extra column', () => {
    expect(readPriceCsv(`${HEADER},extra\n1`).error).toContain('El encabezado no coincide');
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows, and says why`, () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () =>
      PRICE_CSV_HEADER.map(() => 'x').join(','),
    ).join('\n');
    const result = readPriceCsv(`${HEADER}\n${body}`);
    expect(result.error).toContain(String(MAX_IMPORT_ROWS));
    expect(result.rows).toEqual([]);
  });

  it('keys the rows by column name and trims each cell', () => {
    const body = PRICE_CSV_HEADER.map((column) => ` ${column}-valor `).join(',');
    const [parsed] = readPriceCsv(`${HEADER}\n${body}`).rows;
    expect(parsed.institution_slug).toBe('institution_slug-valor');
    expect(parsed.verified_on).toBe('verified_on-valor');
  });
});

describe('isTruthy', () => {
  it('accepts the words a Paraguayan assistant actually types', () => {
    expect(isTruthy('si')).toBe(true);
    expect(isTruthy('Sí')).toBe(true);
    expect(isTruthy('x')).toBe(true);
    expect(isTruthy('no')).toBe(false);
    expect(isTruthy('')).toBe(false);
  });

  it('refuses to guess at anything else', () => {
    // A typo silently meaning "not free" would publish a price for a gratuita.
    expect(isTruthy('sii')).toBeNull();
    expect(isTruthy('tal vez')).toBeNull();
  });
});

describe('parseVerifiedOn', () => {
  it('requires a date rather than defaulting to today', () => {
    expect(parseVerifiedOn('', NOW).error).toContain('Falta verified_on');
  });

  it('refuses anything that is not AAAA-MM-DD', () => {
    expect(parseVerifiedOn('01/08/2026', NOW).error).toContain('AAAA-MM-DD');
  });

  it('refuses a future date, because it would suppress the staleness warning', () => {
    expect(parseVerifiedOn('2027-01-01', NOW).error).toContain('futuro');
  });

  it('reads a valid date as UTC midnight', () => {
    expect(parseVerifiedOn('2026-08-01', NOW).date).toEqual(new Date('2026-08-01T00:00:00Z'));
  });
});

describe('priceRowFormData', () => {
  it('produces a FormData parsePriceInput accepts, unchanged', () => {
    const result = parsePriceInput(priceRowFormData(row(), 101));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        offeringId: 101,
        currency: 'PYG',
        matricula: 500_000,
        monthlyFee: 1_450_000,
        installmentsPerYear: 10,
        isFree: false,
        source: 'institucion',
      });
    }
  });

  it('omits isFree entirely when the row says no, the way an unchecked box does', () => {
    expect(priceRowFormData(row({ is_free: 'no' }), 1).get('isFree')).toBeNull();
    expect(priceRowFormData(row({ is_free: 'si' }), 1).get('isFree')).toBe('on');
  });

  it('accepts the thousands separators a Paraguayan sheet uses', () => {
    const result = parsePriceInput(priceRowFormData(row({ matricula: '1.450.000' }), 1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.matricula).toBe(1_450_000);
  });

  /** CLAUDE.md rule 1: a number families budget against is never rounded. */
  it('refuses a decimal amount rather than rounding it', () => {
    const result = parsePriceInput(priceRowFormData(row({ matricula: '1450000,50' }), 1));
    expect(result.ok).toBe(false);
  });

  it('refuses a row with no currency rather than assuming guaraníes', () => {
    const result = parsePriceInput(priceRowFormData(row({ currency: '' }), 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.currency).toContain('moneda');
  });
});
