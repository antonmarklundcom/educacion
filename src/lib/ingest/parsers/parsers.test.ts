import { describe, expect, it } from 'vitest';

import {
  ANEAES_CSV,
  ANEAES_CSV_SEMICOLON,
  ANEAES_CSV_SOURCE_URL_ONLY,
  ANEAES_LISTING_HTML,
  CONES_CARD_GRID_HTML,
  CONES_INSTITUTIONS_HTML,
  CONES_OFERTAS_TABLE_HTML,
  CONES_OFERTAS_TABLE_MIXED_HTML,
  CONES_REGISTER_HTML,
  CONES_REGISTER_HTML_REORDERED,
} from '../__fixtures__/documents';
import { parseAneaesCsv, parseAneaesHtml } from './aneaes';
import {
  conesPaginationLinks,
  parseConesInstitutions,
  parseConesPrograms,
  parseConesRegister,
} from './cones';

const CONTEXT = { sourceUrl: 'https://source.test/registro/' };

describe('parseConesInstitutions', () => {
  const records = parseConesInstitutions(CONES_CARD_GRID_HTML, CONTEXT);

  it('reads one record per card in a grid with no table on the page', () => {
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.payload.institutionName)).toEqual([
      'INSTITUCION DE PRUEBA A',
      'INSTITUCIÓN DE PRUEBA B',
    ]);
    expect(records.every((r) => r.payload.kind === 'institution')).toBe(true);
  });

  it('keeps the link to the institution page — the crawl follows it for carreras', () => {
    expect(records[0].payload.detailUrl).toBe('https://source.test/institucion-de-prueba-a/');
  });

  it('reads only labelled contact fields, and leaves the rest null', () => {
    expect(records[0].payload.phoneRaw).toBe('000 000000');
    expect(records[0].payload.addressRaw).toBe('Calle de Prueba 1');
    expect(records[0].payload.websiteRaw).toBe('https://a.test');
    // The card never says which city, so we do not say either.
    expect(records[0].payload.locationRaw).toBeNull();
    expect(records[1].payload.phoneRaw).toBeNull();
  });

  it('does not let a following label swallow the city', () => {
    expect(records[1].payload.locationRaw).toBe('Ciudad de Prueba');
    expect(records[1].payload.websiteRaw).toBe('www.b.test');
  });

  it('carries no CONES code — the directory does not publish one', () => {
    expect(records[0].externalId).toBeNull();
    expect(records[0].payload.conesCode).toBeNull();
  });
});

describe('conesPaginationLinks', () => {
  it('follows further pages of the same listing only', () => {
    expect(conesPaginationLinks(CONES_CARD_GRID_HTML, CONTEXT.sourceUrl)).toEqual([
      'https://source.test/registro/page/2/',
    ]);
  });

  it('paginates nowhere from a saved file', () => {
    expect(conesPaginationLinks(CONES_CARD_GRID_HTML, '/tmp/universidades.html')).toEqual([]);
  });
});

describe('parseConesPrograms', () => {
  const records = parseConesPrograms(CONES_OFERTAS_TABLE_HTML, CONTEXT);

  it('reads the wpDataTable the register publishes now', () => {
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.payload.programName)).toEqual([
      'Carrera de Prueba Uno',
      'Carrera de Prueba Dos',
      'Carrera de Prueba Tres',
    ]);
    expect(records.every((r) => r.payload.kind === 'program')).toBe(true);
  });

  it('reads the institution from "IES" and the level from "Tipo"', () => {
    expect(records[0].payload.institutionName).toBe('INSTITUCION DE PRUEBA A');
    expect(records[0].payload.institutionNameSource).toBe('row');
    expect(records[0].payload.levelRaw).toBe('Grado');
    expect(records[0].payload.locationRaw).toBe('Asunción');
  });

  it('takes the resolution number and its link from "Documento respaldatorio"', () => {
    expect(records[0].payload.resolutionNumber).toBe('RES-TEST-1');
    expect(records[0].payload.resolutionUrl).toBe('https://source.test/docs/res-test-1.pdf');
  });

  it('reports no modality, because the register no longer publishes one', () => {
    expect(records.every((r) => r.payload.modalityRaw === null)).toBe(true);
  });

  it('carries "Estado" as the offering\'s own standing, not as a status field', () => {
    expect(records[1].payload.offeringStatusRaw).toBe('INACTIVO');
    expect(records[0].payload.offeringStatusRaw).toBeNull();
    expect(records[1].payload.antecedentsRaw).toBe('RES-TEST-0');
  });

  it("recovers a truncated row from the table's own single institution", () => {
    expect(records[2].payload.institutionName).toBe('INSTITUCION DE PRUEBA A');
    expect(records[2].payload.institutionNameSource).toBe('table');
  });

  it('drops a truncated row when the table names more than one institution', () => {
    const mixed = parseConesPrograms(CONES_OFERTAS_TABLE_MIXED_HTML, CONTEXT);
    expect(mixed.map((r) => r.payload.programName)).toEqual([
      'Carrera de Prueba Uno',
      'Carrera de Prueba Dos',
    ]);
  });

  it('never files a resolution number as a CONES code', () => {
    // "Documento respaldatorio" contains an "n"; a bare "n" code candidate
    // would match it by substring and land it in `externalId`.
    expect(records.every((r) => r.payload.conesCode === null)).toBe(true);
    expect(records.every((r) => r.externalId === null)).toBe(true);
  });

  it('never emits an accreditation field — CONES is a habilitación source', () => {
    const keys = Object.keys(records[0].payload);
    expect(keys.some((key) => /acredit/i.test(key))).toBe(false);
  });

  it('addresses columns by header, not position', () => {
    const reordered = parseConesPrograms(CONES_REGISTER_HTML_REORDERED, CONTEXT);
    expect(reordered[0].payload.institutionName).toBe('INSTITUCION DE PRUEBA A');
    expect(reordered[0].payload.conesCode).toBe('C-001');
    expect(reordered[0].payload.programName).toBe('Carrera de Prueba Uno');
  });

  it('reads a differently-worded register table and skips the navigation table', () => {
    const rows = parseConesPrograms(CONES_REGISTER_HTML, CONTEXT);
    expect(rows).toHaveLength(2);
    expect(rows[0].payload.conesCode).toBe('C-001');
    expect(rows[0].externalId).toBe('C-001');
    expect(rows[1].payload.modalityRaw).toBe('A distancia');
  });

  it('records a missing resolution as null, never as an assertion', () => {
    const rows = parseConesPrograms(CONES_REGISTER_HTML, CONTEXT);
    expect(rows[1].payload.resolutionUrl).toBeNull();
  });

  it('ignores a table with no carrera column', () => {
    expect(parseConesPrograms(CONES_INSTITUTIONS_HTML, CONTEXT)).toEqual([]);
  });
});

describe('parseConesRegister', () => {
  it('reads whichever shape the page turns out to be', () => {
    expect(parseConesRegister(CONES_CARD_GRID_HTML, CONTEXT)).toHaveLength(2);
    expect(parseConesRegister(CONES_OFERTAS_TABLE_HTML, CONTEXT)).toHaveLength(3);
    expect(
      parseConesRegister(CONES_CARD_GRID_HTML + CONES_OFERTAS_TABLE_HTML, CONTEXT),
    ).toHaveLength(5);
  });

  it('is deterministic: the same document yields the same checksums', () => {
    const once = parseConesRegister(CONES_OFERTAS_TABLE_HTML, CONTEXT);
    const again = parseConesRegister(CONES_OFERTAS_TABLE_HTML, CONTEXT);
    expect(again.map((r) => r.checksum)).toEqual(once.map((r) => r.checksum));
  });

  it('deduplicates rows repeated across paginated views', () => {
    const doubled = parseConesRegister(
      CONES_OFERTAS_TABLE_HTML + CONES_OFERTAS_TABLE_HTML,
      CONTEXT,
    );
    expect(doubled).toHaveLength(3);
  });

  it('returns nothing for a page with neither cards nor a register table', () => {
    expect(parseConesRegister('<html><body><p>Mantenimiento</p></body></html>', CONTEXT)).toEqual(
      [],
    );
  });
});

describe('parseAneaesCsv', () => {
  const records = parseAneaesCsv(ANEAES_CSV, CONTEXT);

  it('reads every row', () => {
    expect(records).toHaveLength(3);
  });

  it('keeps a quoted comma inside the program name', () => {
    expect(records[0].payload.programName).toBe('Carrera de Prueba, con coma');
  });

  it('carries the status through as the source wrote it, uninterpreted', () => {
    expect(records[0].payload.statusRaw).toBe('Acreditada');
    expect(records[2].payload.statusRaw).toBe('En proceso');
  });

  it('flags a row with no resolution as not citable', () => {
    expect(records[0].payload.citable).toBe(true);
    expect(records[2].payload.citable).toBe(false);
    expect(records[2].payload.resolutionNumber).toBeNull();
  });

  it('keeps the original CKAN record so the mapping can be audited', () => {
    expect(records[0].payload.rawRecord?.Institucion).toBe('INSTITUCION DE PRUEBA A');
  });

  it('accepts a source URL as the citation when the source prints no resolution', () => {
    const rows = parseAneaesCsv(ANEAES_CSV_SOURCE_URL_ONLY, CONTEXT);
    expect(rows[0].payload.resolutionUrl).toBe('https://source.test/listado.pdf');
    expect(rows[0].payload.resolutionNumber).toBeNull();
    expect(rows[0].payload.citable).toBe(true);
  });

  it('refuses a citation a reader cannot open', () => {
    const rows = parseAneaesCsv(ANEAES_CSV_SOURCE_URL_ONLY, CONTEXT);
    expect(rows[1].payload.resolutionUrl).toBeNull();
    expect(rows[1].payload.citable).toBe(false);
  });

  it('handles a semicolon-delimited, BOM-prefixed export', () => {
    const rows = parseAneaesCsv(ANEAES_CSV_SEMICOLON, CONTEXT);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.institutionName).toBe('INSTITUCION DE PRUEBA A');
    expect(rows[0].payload.resolutionNumber).toBe('RES-TEST-10');
  });

  it('never emits a negative accreditation status of its own', () => {
    for (const record of records) {
      expect(record.payload.statusRaw).not.toMatch(/no acreditada/i);
    }
  });
});

describe('parseAneaesHtml', () => {
  const records = parseAneaesHtml(ANEAES_LISTING_HTML, CONTEXT);

  it('reads the listing rows', () => {
    expect(records).toHaveLength(2);
  });

  it('treats a resolution link alone as sufficient provenance', () => {
    expect(records[0].payload.resolutionUrl).toBe('https://example.test/res-test-10.pdf');
    expect(records[0].payload.citable).toBe(true);
  });

  it('flags a row with neither resolution number nor link as not citable', () => {
    expect(records[1].payload.citable).toBe(false);
  });

  it('agrees with the CSV parser on the payload shape', () => {
    expect(Object.keys(records[0].payload).sort()).toEqual(
      Object.keys(parseAneaesCsv(ANEAES_CSV, CONTEXT)[0].payload).sort(),
    );
  });
});
