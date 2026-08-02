import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, FILTER_PARAMS, MAX_PAGE_SIZE } from './contract';
import {
  clearFilters,
  hasActiveFilters,
  parseSearchFilters,
  searchHref,
  serializeSearchFilters,
  toggleFilterValue,
} from './params';

const parse = (query: string) => parseSearchFilters(new URLSearchParams(query));

describe('parseSearchFilters', () => {
  it('reads every filter group from its Spanish parameter name', () => {
    const filters = parse(
      'q=medicina&area=salud&carrera=medicina&nivel=grado&gestion=privada&tipo=universidad' +
        '&modalidad=presencial&turno=noche&ciudad=asuncion&departamento=central' +
        '&acreditacion=vigente&inscripcion=abiertas&institucion=una' +
        '&arancel_min=1000000&arancel_max=9000000&gratuita=0&duracion_max=60' +
        '&orden=arancel_asc&pagina=3&por_pagina=40',
    );

    expect(filters).toEqual({
      q: 'medicina',
      areaSlugs: ['salud'],
      careerSlugs: ['medicina'],
      levels: ['grado'],
      managements: ['privada'],
      institutionTypes: ['universidad'],
      modalities: ['presencial'],
      shifts: ['noche'],
      citySlugs: ['asuncion'],
      departmentSlugs: ['central'],
      accreditationStatuses: ['vigente'],
      enrollmentStatuses: ['abiertas'],
      institutionSlug: 'una',
      annualCostMin: 1_000_000,
      annualCostMax: 9_000_000,
      isFree: false,
      durationMonthsMax: 60,
      sort: 'arancel_asc',
      page: 3,
      pageSize: 40,
    });
  });

  it('accepts both repeated and comma-separated values', () => {
    expect(parse('nivel=grado&nivel=maestria').levels).toEqual(['grado', 'maestria']);
    expect(parse('nivel=grado,maestria').levels).toEqual(['grado', 'maestria']);
  });

  it('drops values outside the vocabulary instead of failing the page', () => {
    const filters = parse('nivel=grado&nivel=licenciatura&acreditacion=inventada&orden=precio');
    expect(filters.levels).toEqual(['grado']);
    expect(filters.accreditationStatuses).toBeUndefined();
    expect(filters.sort).toBeUndefined();
  });

  it('rejects slugs that are not slugs', () => {
    expect(parse('ciudad=' + encodeURIComponent("asuncion' or 1=1")).citySlugs).toBeUndefined();
    expect(parse('institucion=' + encodeURIComponent('../admin')).institutionSlug).toBeUndefined();
  });

  it('clamps the page size and ignores nonsense numbers', () => {
    expect(parse(`por_pagina=${MAX_PAGE_SIZE + 500}`).pageSize).toBe(MAX_PAGE_SIZE);
    expect(parse('pagina=0').page).toBeUndefined();
    expect(parse('pagina=-4').page).toBeUndefined();
    expect(parse('arancel_min=mucho').annualCostMin).toBeUndefined();
  });

  it('reads Next.js-shaped searchParams objects too', () => {
    const filters = parseSearchFilters({ nivel: ['grado', 'doctorado'], q: 'derecho' });
    expect(filters.levels).toEqual(['grado', 'doctorado']);
    expect(filters.q).toBe('derecho');
  });

  it('is empty for an empty URL', () => {
    expect(parseSearchFilters(undefined)).toEqual({});
    expect(hasActiveFilters(parse(''))).toBe(false);
  });
});

describe('serializeSearchFilters', () => {
  it('round-trips: parse → serialize → parse is a fixed point', () => {
    const query =
      'q=medicina&area=salud&nivel=grado&nivel=maestria&gestion=publica&ciudad=asuncion' +
      '&acreditacion=vigente&arancel_max=9000000&gratuita=1&duracion_max=72&orden=duracion_asc&pagina=2';
    const once = parse(query);
    const twice = parseSearchFilters(serializeSearchFilters(once));
    expect(twice).toEqual(once);
  });

  it('omits defaults so one filter state has exactly one URL', () => {
    const params = serializeSearchFilters({
      sort: 'relevancia',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      levels: [],
    });
    expect(params.toString()).toBe('');
  });

  it('sorts array values, so option order in the UI cannot fork the URL', () => {
    const a = serializeSearchFilters({ levels: ['maestria', 'grado'] }).toString();
    const b = serializeSearchFilters({ levels: ['grado', 'maestria'] }).toString();
    expect(a).toBe(b);
    expect(a).toBe(`${FILTER_PARAMS.levels}=grado&${FILTER_PARAMS.levels}=maestria`);
  });

  it('carries the view toggle and the comparador selection alongside the filters', () => {
    const href = searchHref(
      '/carreras',
      { levels: ['grado'] },
      { vista: 'tabla', comparar: '1,2' },
    );
    expect(href).toBe('/carreras?nivel=grado&vista=tabla&comparar=1%2C2');
  });

  it('returns a bare pathname when nothing is filtered', () => {
    expect(searchHref('/carreras', {})).toBe('/carreras');
  });
});

describe('toggleFilterValue', () => {
  it('adds, removes and resets pagination', () => {
    const added = toggleFilterValue({ page: 7 }, 'levels', 'grado');
    expect(added.levels).toEqual(['grado']);
    expect(added.page).toBeUndefined();

    const removed = toggleFilterValue(added, 'levels', 'grado');
    expect(removed.levels).toBeUndefined();
  });
});

describe('clearFilters', () => {
  it('keeps the query, the scope and the sort but drops the rail', () => {
    const cleared = clearFilters(parse('q=medicina&institucion=una&nivel=grado&orden=nombre_asc'));
    expect(cleared).toEqual({
      q: 'medicina',
      institutionSlug: 'una',
      sort: 'nombre_asc',
      pageSize: undefined,
    });
  });
});
