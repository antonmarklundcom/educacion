/**
 * The parsers PR-51 left untested, and the branches inside the tested ones that
 * nothing reached (PR-54).
 *
 * `validation.test.ts` covers the catalog forms — institution, campus, career,
 * programme, offering, admin user. The three that carry the sharpest integrity
 * rules did not have a test between them: `parseBecaInput` (money promised to a
 * student, CLAUDE.md rule 1), `parseJobPostingInput` (attribution and dating,
 * `risks.md` §R-11), `parseSubscriptionInput` (the money path). They are here,
 * with the rest of the uncovered branches, because every one of them is a
 * sentence the operator reads instead of a MySQL error — and a rule that only a
 * CHECK constraint enforces is a rule the form can be changed out from under.
 */

import { describe, expect, it } from 'vitest';

import {
  parseAccreditationInput,
  parseAreaInput,
  parseBecaInput,
  parseInstitutionInput,
  parseJobPostingInput,
  parsePriceInput,
  parseSubscriptionInput,
} from './validation';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe('parseBecaInput', () => {
  const base = {
    title: 'Beca de excelencia académica',
    summary: 'Cubre la matrícula y las cuotas del primer año.',
    type: 'institucional',
    coverage: 'total',
    sourceUrl: 'https://example.edu.py/becas',
    providerName: 'Universidad de ejemplo',
    status: 'draft',
  };

  it('accepts a complete submission', () => {
    const result = parseBecaInput(fd(base));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.coverage).toBe('total');
      expect(result.data.sourceUrl).toBe('https://example.edu.py/becas');
    }
  });

  // CLAUDE.md rule 1. The column is NOT NULL; this is the sentence a human gets
  // instead of the MySQL error, and it applies to drafts too.
  it('requires a source even on a draft', () => {
    const result = parseBecaInput(fd({ ...base, sourceUrl: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceUrl).toContain('fuente');
  });

  it('reports a malformed source once, as a URL problem', () => {
    const result = parseBecaInput(fd({ ...base, sourceUrl: 'example.edu.py/becas' }));
    expect(result.ok).toBe(false);
    // Not the "es obligatoria" message: the operator gave one, it is just wrong.
    if (!result.ok) expect(result.errors.sourceUrl).toContain('URL válida');
  });

  it('requires somebody to be giving the beca', () => {
    const result = parseBecaInput(fd({ ...base, providerName: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.providerName).toBeDefined();
  });

  it('accepts an institution id in place of a typed provider name', () => {
    const result = parseBecaInput(fd({ ...base, providerName: '', institutionId: '7' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.institutionId).toBe(7);
  });

  it('refuses "monto fijo" with no amount', () => {
    const result = parseBecaInput(fd({ ...base, coverage: 'monto_fijo' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.amountPyg).toBeDefined();
  });

  it('accepts "monto fijo" with an amount in the format the form shows', () => {
    const result = parseBecaInput(
      fd({ ...base, coverage: 'monto_fijo', amountPyg: '1.450.000' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.amountPyg).toBe(1_450_000);
  });

  it('refuses "parcial" with no percentage', () => {
    const result = parseBecaInput(fd({ ...base, coverage: 'parcial' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.percentage).toBeDefined();
  });

  it('refuses an amount attached to a coverage that is not "monto fijo"', () => {
    const result = parseBecaInput(fd({ ...base, coverage: 'total', amountPyg: '1.000.000' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.amountPyg).toContain('monto fijo');
  });

  it('refuses a percentage attached to a coverage that is not "parcial"', () => {
    const result = parseBecaInput(fd({ ...base, coverage: 'total', percentage: '50' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.percentage).toContain('parcial');
  });

  it.each(['0', '100', '50.5', 'la mitad'])('refuses the percentage %s', (percentage) => {
    const result = parseBecaInput(fd({ ...base, coverage: 'parcial', percentage }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.percentage).toBeDefined();
  });

  it('accepts a percentage at each end of the allowed range', () => {
    for (const percentage of ['1', '99']) {
      const result = parseBecaInput(fd({ ...base, coverage: 'parcial', percentage }));
      expect(result.ok, `percentage ${percentage}`).toBe(true);
    }
  });

  it('rejects an unknown coverage rather than falling back to sin_datos', () => {
    const result = parseBecaInput(fd({ ...base, coverage: 'quizas' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.coverage).toBeDefined();
  });

  it('rejects a malformed deadline', () => {
    const result = parseBecaInput(fd({ ...base, deadline: '31/12/2026' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.deadline).toBeDefined();
  });
});

describe('parseJobPostingInput', () => {
  const base = {
    careerId: '3',
    title: 'Analista de sistemas junior',
    employerName: 'Empresa de ejemplo S.A.',
    sourceLabel: 'trabajo.com.py',
    source: 'trabajo_com_py',
    status: 'published',
    url: 'https://example.com.py/aviso/1',
    postedOn: '2026-08-01',
  };
  // Injected rather than read from the clock: a test that passes only in
  // August is a test that fails in September for no reason.
  const today = '2026-08-26';

  it('accepts a complete posting', () => {
    const result = parseJobPostingInput(fd(base), today);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.postedOn).toBe('2026-08-01');
  });

  it('requires the link to the original notice', () => {
    const result = parseJobPostingInput(fd({ ...base, url: '' }), today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.url).toBeDefined();
  });

  it('reports a malformed link as a URL problem, not a missing one', () => {
    const result = parseJobPostingInput(fd({ ...base, url: 'ftp://example.com.py' }), today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.url).toContain('URL válida');
  });

  it('requires a posting date', () => {
    const result = parseJobPostingInput(fd({ ...base, postedOn: '' }), today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.postedOn).toBeDefined();
  });

  // A "publicado mañana" row sorts to the top of every list forever.
  it('refuses a posting date in the future', () => {
    const result = parseJobPostingInput(fd({ ...base, postedOn: '2026-08-27' }), today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.postedOn).toContain('futura');
  });

  it('accepts a posting dated today', () => {
    const result = parseJobPostingInput(fd({ ...base, postedOn: today }), today);
    expect(result.ok).toBe(true);
  });

  it('refuses an expiry before the posting date', () => {
    const result = parseJobPostingInput(
      fd({ ...base, postedOn: '2026-08-10', expiresOn: '2026-08-01' }),
      today,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.expiresOn).toBeDefined();
  });

  it('accepts an expiry in the future', () => {
    const result = parseJobPostingInput(fd({ ...base, expiresOn: '2026-12-01' }), today);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.expiresOn).toBe('2026-12-01');
  });

  it('requires the attribution the source label carries', () => {
    const result = parseJobPostingInput(fd({ ...base, sourceLabel: '' }), today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceLabel).toBeDefined();
  });

  it('rejects an unknown source', () => {
    const result = parseJobPostingInput(fd({ ...base, source: 'linkedin' }), today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.source).toBeDefined();
  });

  it('defaults its comparison date to today when none is passed', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const result = parseJobPostingInput(fd({ ...base, postedOn: tomorrow }));
    expect(result.ok).toBe(false);
  });
});

describe('parseSubscriptionInput', () => {
  const base = {
    institutionId: '4',
    planId: '2',
    status: 'active',
    startsOn: '2026-09-01',
  };

  it('accepts an open-ended subscription with no invoice yet', () => {
    const result = parseSubscriptionInput(fd(base));
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Deliberately not defaulted to a year out: open-ended is a real shape
      // (comped, trial) and the operator states it.
      expect(result.data.endsOn).toBeNull();
      expect(result.data.invoiceRef).toBeNull();
    }
  });

  it('requires a start date', () => {
    const result = parseSubscriptionInput(fd({ ...base, startsOn: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startsOn).toBeDefined();
  });

  // The `subscriptions_date_order` CHECK, in Spanish, before MySQL says it in
  // English.
  it('refuses an end date before the start date', () => {
    const result = parseSubscriptionInput(fd({ ...base, endsOn: '2026-08-01' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endsOn).toContain('anterior');
  });

  it('accepts an end date equal to the start date', () => {
    const result = parseSubscriptionInput(fd({ ...base, endsOn: base.startsOn }));
    expect(result.ok).toBe(true);
  });

  it('requires an institution and a plan', () => {
    const result = parseSubscriptionInput(fd({ ...base, institutionId: '', planId: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.institutionId).toBeDefined();
      expect(result.errors.planId).toBeDefined();
    }
  });

  it('rejects an unknown status', () => {
    const result = parseSubscriptionInput(fd({ ...base, status: 'moroso' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.status).toBeDefined();
  });

  it('parses the invoiced amount out of the format the form displays', () => {
    const result = parseSubscriptionInput(fd({ ...base, invoicedAmountPyg: '3.500.000' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.invoicedAmountPyg).toBe(3_500_000);
  });

  it('rejects an invoiced amount that is not a number', () => {
    const result = parseSubscriptionInput(fd({ ...base, invoicedAmountPyg: 'tres millones' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.invoicedAmountPyg).toBeDefined();
  });
});

describe('parseAreaInput', () => {
  it('accepts a name and defaults the sort order to 0', () => {
    const result = parseAreaInput(fd({ nameEs: 'Salud' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.sortOrder).toBe(0);
  });

  it('rejects a non-integer sort order', () => {
    const result = parseAreaInput(fd({ nameEs: 'Salud', sortOrder: '1.5' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sortOrder).toBeDefined();
  });

  it('requires a name', () => {
    const result = parseAreaInput(fd({ nameEs: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.nameEs).toBeDefined();
  });
});

describe('branches nothing else reached', () => {
  const institution = {
    nameOfficial: 'Universidad de ejemplo',
    nameShort: 'UE',
    management: 'privada',
    type: 'universidad',
    status: 'draft',
  };

  it('rejects a founding year outside 1800..now', () => {
    for (const foundedYear of ['1799', String(new Date().getFullYear() + 1), '19o0']) {
      const result = parseInstitutionInput(fd({ ...institution, foundedYear }));
      expect(result.ok, `foundedYear ${foundedYear}`).toBe(false);
    }
  });

  it('accepts a founding year at the lower bound', () => {
    const result = parseInstitutionInput(fd({ ...institution, foundedYear: '1800' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.foundedYear).toBe(1800);
  });

  it('rejects a brand colour that is not a six-digit hex', () => {
    const result = parseInstitutionInput(fd({ ...institution, brandColor: '#0d6' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.brandColor).toBeDefined();
  });

  it('rejects an address that is not an address', () => {
    const result = parseInstitutionInput(fd({ ...institution, email: 'contacto' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toBeDefined();
  });

  it('rejects a website on a scheme a browser will not follow', () => {
    const result = parseInstitutionInput(fd({ ...institution, website: 'javascript:alert(1)' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.website).toBeDefined();
  });

  it('rejects a name longer than the column', () => {
    const result = parseInstitutionInput(fd({ ...institution, nameOfficial: 'x'.repeat(600) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.nameOfficial).toContain('caracteres');
  });

  // `assertPriceIsCoherent`'s rules, surfaced as sentences rather than stacks.
  it('refuses a free programme that also charges a matrícula', () => {
    const result = parsePriceInput(
      fd({
        offeringId: '1',
        currency: 'PYG',
        source: 'web_publica',
        isFree: 'on',
        matricula: '500.000',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.isFree).toContain('gratuita');
  });

  it('refuses an installment count outside 1..24', () => {
    const result = parsePriceInput(
      fd({
        offeringId: '1',
        currency: 'PYG',
        source: 'web_publica',
        monthlyFee: '500.000',
        installmentsPerYear: '25',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.installmentsPerYear).toContain('1 y 24');
  });

  // risks.md §R-09: a positive status with nothing to cite is the one thing
  // this form exists to stop.
  it('refuses a positive accreditation with neither resolution nor source', () => {
    const result = parseAccreditationInput(
      fd({
        scope: 'program',
        programId: '5',
        agency: 'ANEAES',
        kind: 'acreditacion',
        status: 'vigente',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceUrl).toBeDefined();
  });

  it('refuses "no acreditada" without a source, in its own words', () => {
    const result = parseAccreditationInput(
      fd({
        scope: 'program',
        programId: '5',
        agency: 'ANEAES',
        kind: 'acreditacion',
        status: 'no_acreditada',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceUrl).toContain('Sin datos');
  });

  it('refuses CONES as an accrediting agency — it habilita, it does not acreditar', () => {
    const result = parseAccreditationInput(
      fd({
        scope: 'program',
        programId: '5',
        agency: 'CONES',
        kind: 'acreditacion',
        status: 'vigente',
        sourceUrl: 'https://cones.gov.py/resolucion',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.kind).toContain('habilitacion');
  });

  it('refuses a validity window that ends before it starts', () => {
    const result = parseAccreditationInput(
      fd({
        scope: 'program',
        programId: '5',
        agency: 'ANEAES',
        kind: 'acreditacion',
        status: 'vigente',
        sourceUrl: 'https://aneaes.gov.py/resolucion',
        validFrom: '2026-01-01',
        validTo: '2025-01-01',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.validTo).toBeDefined();
  });

  it('keeps only the id the scope names', () => {
    const result = parseAccreditationInput(
      fd({
        scope: 'program',
        institutionId: '9',
        programId: '5',
        offeringId: '11',
        agency: 'ANEAES',
        kind: 'acreditacion',
        status: 'vigente',
        resolutionNumber: 'Res. 123/2026',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.programId).toBe(5);
      expect(result.data.institutionId).toBeNull();
      expect(result.data.offeringId).toBeNull();
    }
  });
});
