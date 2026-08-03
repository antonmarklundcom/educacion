import { describe, expect, it } from 'vitest';

import {
  ANEAES_CSV,
  ANEAES_CSV_SEMICOLON,
  ANEAES_LISTING_HTML,
  CONES_INSTITUTIONS_HTML,
  CONES_REGISTER_HTML,
  CONES_REGISTER_HTML_REORDERED,
} from '../__fixtures__/documents';
import { parseAneaesCsv, parseAneaesHtml } from './aneaes';
import { parseConesRegister } from './cones';

const CONTEXT = { sourceUrl: 'https://source.test/registro/' };

describe('parseConesRegister', () => {
  const records = parseConesRegister(CONES_REGISTER_HTML, CONTEXT);

  it('reads the register rows and skips the navigation table', () => {
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.payload.institutionName)).toEqual([
      'INSTITUCION DE PRUEBA A',
      'INSTITUCIÓN DE PRUEBA B',
    ]);
  });

  it('captures the CONES code as the external id — the only trustworthy key', () => {
    expect(records[0].externalId).toBe('C-001');
    expect(records[0].payload.conesCode).toBe('C-001');
  });

  it('resolves the resolution link against the source URL', () => {
    expect(records[0].payload.resolutionUrl).toBe('https://source.test/docs/res-test-1.pdf');
    expect(records[1].payload.resolutionUrl).toBeNull();
  });

  it('leaves level and modality uninterpreted for PR-06 to map', () => {
    expect(records[0].payload.levelRaw).toBe('Grado');
    expect(records[1].payload.modalityRaw).toBe('A distancia');
  });

  it('never emits an accreditation field — CONES is a habilitación source', () => {
    const keys = Object.keys(records[0].payload);
    expect(keys.some((key) => /acredit/i.test(key))).toBe(false);
  });

  it('addresses columns by header, not position', () => {
    const reordered = parseConesRegister(CONES_REGISTER_HTML_REORDERED, CONTEXT);
    expect(reordered[0].payload.institutionName).toBe('INSTITUCION DE PRUEBA A');
    expect(reordered[0].payload.conesCode).toBe('C-001');
    expect(reordered[0].payload.programName).toBe('Carrera de Prueba Uno');
  });

  it('classifies a row without a carrera as an institution row', () => {
    const rows = parseConesRegister(CONES_INSTITUTIONS_HTML, CONTEXT);
    expect(rows.map((r) => r.payload.kind)).toEqual(['institution', 'institution']);
  });

  it('records a missing resolution as null, never as an assertion', () => {
    const rows = parseConesRegister(CONES_INSTITUTIONS_HTML, CONTEXT);
    expect(rows[1].payload.resolutionNumber).toBeNull();
  });

  it('is deterministic: the same document yields the same checksums', () => {
    const again = parseConesRegister(CONES_REGISTER_HTML, CONTEXT);
    expect(again.map((r) => r.checksum)).toEqual(records.map((r) => r.checksum));
  });

  it('deduplicates rows repeated across paginated views', () => {
    const doubled = parseConesRegister(CONES_REGISTER_HTML + CONES_REGISTER_HTML, CONTEXT);
    expect(doubled).toHaveLength(2);
  });

  it('returns nothing for a page with no register table', () => {
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
