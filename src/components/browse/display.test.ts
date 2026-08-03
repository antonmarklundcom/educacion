/**
 * The three anti-fabrication rules the browse UI is responsible for, asserted
 * where they are decided rather than where they are rendered.
 */

import { describe, expect, it } from 'vitest';

import type { AccreditationSummary, PriceSummary, SearchFilters } from '@/lib/search';

import { accreditationLabel, accreditationTone } from './accreditation-display';
import { countActiveFilters, filterValueLabel } from './filter-model';
import { NO_PRICE_LABEL, priceDisplay } from './price';

function accreditation(over: Partial<AccreditationSummary> = {}): AccreditationSummary {
  return { status: 'sin_datos', agency: null, sourceUrl: null, validTo: null, ...over };
}

function price(over: Partial<PriceSummary> = {}): PriceSummary {
  return {
    isDisplayable: false,
    isFree: false,
    currency: null,
    matricula: null,
    monthlyFee: null,
    installmentsPerYear: null,
    admissionFee: null,
    annualCost: null,
    verifiedAt: null,
    ...over,
  };
}

describe('accreditationLabel', () => {
  it('renders unknown accreditation as "Sin datos de acreditación", never "No acreditada"', () => {
    const label = accreditationLabel(accreditation({ status: 'sin_datos' }));
    expect(label).toBe('Sin datos de acreditación');
    expect(label).not.toContain('No acreditada');
    expect(accreditationTone(accreditation({ status: 'sin_datos' }))).toBe('neutral');
  });

  it('never calls a CONES habilitación an accreditation', () => {
    const cones = accreditation({ status: 'vigente', agency: 'CONES' });
    expect(accreditationLabel(cones)).toBe('Habilitada CONES');
    expect(accreditationTone(cones)).toBe('info');
  });

  it('names the agency on a valid accreditation', () => {
    const aneaes = accreditation({ status: 'vigente', agency: 'ANEAES' });
    expect(accreditationLabel(aneaes)).toBe('Acreditada ANEAES');
    expect(accreditationTone(aneaes)).toBe('ok');
  });

  it('keeps a lapsed accreditation distinct from a current one', () => {
    expect(accreditationLabel(accreditation({ status: 'vencida' }))).toBe('Acreditación vencida');
    expect(accreditationLabel(accreditation({ status: 'en_proceso' }))).toBe(
      'En proceso de acreditación',
    );
  });
});

describe('priceDisplay', () => {
  it('shows the honest gap when the 12-month rule has stripped the amounts', () => {
    // What `toPriceSummary` hands the UI for a price verified too long ago:
    // the verification date survives, every amount is null.
    const stale = price({ isDisplayable: false, verifiedAt: new Date('2022-01-01') });
    const display = priceDisplay(stale);
    expect(display.isGap).toBe(true);
    expect(display.label).toBe(NO_PRICE_LABEL);
  });

  it('never claims "Gratuita" from a non-displayable price', () => {
    // `isFree` cannot be true here — `row.ts` clears it — but the component
    // must not resurrect it even if a caller constructs the object by hand.
    const display = priceDisplay(price({ isDisplayable: false, isFree: true }));
    expect(display.isFree).toBe(false);
    expect(display.label).toBe(NO_PRICE_LABEL);
  });

  it('prefers the monthly fee, which is how aranceles are quoted here', () => {
    const display = priceDisplay(
      price({ isDisplayable: true, currency: 'PYG', monthlyFee: 1_450_000, annualCost: 17_400_000 }),
    );
    expect(display.label).toBe('Gs. 1.450.000');
    expect(display.unit).toBe('/mes');
  });

  it('renders a USD arancel as USD rather than converting it', () => {
    const display = priceDisplay(price({ isDisplayable: true, currency: 'USD', monthlyFee: 250 }));
    expect(display.label).toBe('USD 250');
  });

  it('marks a free program as free', () => {
    const display = priceDisplay(price({ isDisplayable: true, currency: 'PYG', isFree: true }));
    expect(display).toMatchObject({ isFree: true, isGap: false, label: 'Gratuita' });
  });
});

describe('countActiveFilters', () => {
  it('counts every narrowing choice, and the arancel range as one', () => {
    const filters: SearchFilters = {
      levels: ['grado', 'maestria'],
      citySlugs: ['asuncion'],
      annualCostMin: 1_000_000,
      annualCostMax: 5_000_000,
      isFree: false,
    };
    expect(countActiveFilters(filters)).toBe(5);
  });

  it('does not count the free-text query, the sort or the page', () => {
    expect(countActiveFilters({ q: 'medicina', sort: 'arancel_asc', page: 3 })).toBe(0);
  });
});

describe('filterValueLabel', () => {
  it('uses the fixed vocabulary for enum groups', () => {
    expect(filterValueLabel('levels', 'grado')).toBe('Grado');
    expect(filterValueLabel('accreditationStatuses', 'sin_datos')).toBe(
      'Sin datos de acreditación',
    );
  });

  it('falls back to the slug rather than inventing a display name', () => {
    expect(filterValueLabel('citySlugs', 'ciudad-del-este')).toBe('ciudad-del-este');
  });
});
