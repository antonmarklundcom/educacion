/**
 * PR-20's form rules, tested where they are decided.
 *
 * The first block is the acceptance criterion stated as a test: *the
 * accreditation form refuses to save a positive status without a source.*
 * Refuses, not warns — the assertion is that `parseAccreditationInput` returns
 * `ok: false`, so nothing downstream is ever handed the row.
 */

import { describe, expect, it } from 'vitest';

import { parseAccreditationInput, parseAdmissionInput, parsePriceInput } from './validation';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

/** The submitted form minus one field — "the moderator left this blank". */
function without<T extends Record<string, string>>(
  values: T,
  key: keyof T,
): Record<string, string> {
  const copy: Record<string, string> = { ...values };
  delete copy[key as string];
  return copy;
}

const CITED = {
  scope: 'program',
  programId: '4',
  agency: 'ANEAES',
  kind: 'acreditacion',
  status: 'vigente',
  resolutionNumber: 'RES-123/2026',
};

describe('parseAccreditationInput — the citation rule', () => {
  it('accepts a positive status with a resolution number', () => {
    const result = parseAccreditationInput(form(CITED));
    expect(result.ok).toBe(true);
  });

  it('accepts a positive status with a source URL instead', () => {
    const rest = without(CITED, 'resolutionNumber');
    const result = parseAccreditationInput(
      form({ ...rest, sourceUrl: 'https://aneaes.gov.py/resolucion-123' }),
    );
    expect(result.ok).toBe(true);
  });

  it('REFUSES a "vigente" with neither', () => {
    const rest = without(CITED, 'resolutionNumber');
    const result = parseAccreditationInput(form(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceUrl).toMatch(/fuente/i);
  });

  it('REFUSES an "en_proceso" with neither', () => {
    const rest = without(CITED, 'resolutionNumber');
    const result = parseAccreditationInput(form({ ...rest, status: 'en_proceso' }));
    expect(result.ok).toBe(false);
  });

  it('REFUSES an uncited "no_acreditada" — a negative needs a source too', () => {
    const rest = without(CITED, 'resolutionNumber');
    const result = parseAccreditationInput(form({ ...rest, status: 'no_acreditada' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceUrl).toMatch(/Sin datos/);
  });

  it('allows "sin_datos" with nothing at all — it asserts nothing', () => {
    const rest = without(CITED, 'resolutionNumber');
    const result = parseAccreditationInput(form({ ...rest, status: 'sin_datos' }));
    expect(result.ok).toBe(true);
  });

  it('whitespace is not a citation', () => {
    const rest = without(CITED, 'resolutionNumber');
    const result = parseAccreditationInput(form({ ...rest, resolutionNumber: '   ' }));
    expect(result.ok).toBe(false);
  });
});

describe('parseAccreditationInput — scope and agency', () => {
  it('requires the target the scope names', () => {
    const rest = without(CITED, 'programId');
    const result = parseAccreditationInput(form(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.programId).toBeTruthy();
  });

  it('drops the targets the scope does not name, so the CHECK cannot fire', () => {
    const result = parseAccreditationInput(form({ ...CITED, institutionId: '9', offeringId: '3' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.programId).toBe(4);
      expect(result.data.institutionId).toBeNull();
      expect(result.data.offeringId).toBeNull();
    }
  });

  it('refuses CONES + acreditación — CONES habilita, ANEAES acredita', () => {
    const result = parseAccreditationInput(
      form({ ...CITED, agency: 'CONES', kind: 'acreditacion' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.kind).toMatch(/habilita/);
  });

  it('accepts CONES as a habilitación', () => {
    const result = parseAccreditationInput(
      form({ ...CITED, agency: 'CONES', kind: 'habilitacion' }),
    );
    expect(result.ok).toBe(true);
  });
});

const PRICE = {
  offeringId: '12',
  currency: 'PYG',
  source: 'web_publica',
  matricula: '500000',
  monthlyFee: '1450000',
  installmentsPerYear: '10',
};

describe('parsePriceInput', () => {
  it('accepts a coherent arancel', () => {
    const result = parsePriceInput(form(PRICE));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.monthlyFee).toBe(1_450_000);
  });

  it('accepts thousands separators, because that is how the number is written', () => {
    const result = parsePriceInput(form({ ...PRICE, monthlyFee: '1.450.000' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.monthlyFee).toBe(1_450_000);
  });

  it('refuses a cuota with no number of cuotas — it cannot be compared', () => {
    const rest = without(PRICE, 'installmentsPerYear');
    const result = parsePriceInput(form(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.installmentsPerYear).toMatch(/costo anual/);
  });

  it('refuses "gratuita" alongside a matrícula — two contradictory claims', () => {
    const result = parsePriceInput(form({ ...PRICE, isFree: 'on' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.isFree).toBeTruthy();
  });

  it('accepts "gratuita" with only a derecho de examen', () => {
    const result = parsePriceInput(
      form({
        offeringId: '12',
        currency: 'PYG',
        source: 'institucion',
        isFree: 'on',
        admissionFee: '150000',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a decimal — guaraníes have no minor unit', () => {
    const result = parsePriceInput(form({ ...PRICE, monthlyFee: '1450000,50' }));
    expect(result.ok).toBe(false);
  });

  it('refuses installments outside 1–24', () => {
    const result = parsePriceInput(form({ ...PRICE, installmentsPerYear: '36' }));
    expect(result.ok).toBe(false);
  });

  it('refuses a vigencia that ends before it starts', () => {
    const result = parsePriceInput(
      form({ ...PRICE, validFrom: '2026-03-01', validTo: '2026-01-01' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.validTo).toBeTruthy();
  });
});

const ADMISSION = {
  scope: 'institution',
  institutionId: '3',
  periodLabel: 'Convocatoria 2027 - 1er llamado',
  registrationOpens: '2026-11-01',
  registrationCloses: '2027-01-31',
  isActive: 'on',
};

describe('parseAdmissionInput', () => {
  it('accepts a well-formed convocatoria', () => {
    const result = parseAdmissionInput(form(ADMISSION));
    expect(result.ok).toBe(true);
  });

  it('refuses a window that closes before it opens', () => {
    const result = parseAdmissionInput(
      form({ ...ADMISSION, registrationOpens: '2027-02-01', registrationCloses: '2026-11-01' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.registrationCloses).toBeTruthy();
  });

  it('requires the target its scope names', () => {
    const rest = without(ADMISSION, 'institutionId');
    const result = parseAdmissionInput(form(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.institutionId).toBeTruthy();
  });

  it('refuses a malformed date rather than storing an Invalid Date', () => {
    const result = parseAdmissionInput(form({ ...ADMISSION, examDate: '01/12/2026' }));
    expect(result.ok).toBe(false);
  });
});
