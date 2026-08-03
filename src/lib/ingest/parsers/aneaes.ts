/**
 * ANEAES — accredited programs, via the datos.gov.py (CKAN) export and the
 * ANEAES site's own HTML listing.
 *
 * This is the source behind the product's wedge (`plan.md` §2), which makes it
 * the source where a careless write does the most damage. Two rules are
 * enforced right here at the raw layer rather than being left to PR-06:
 *
 * 1. **A row without a resolution number and without a source URL cannot
 *    support a positive accreditation status.** We still capture the row —
 *    provenance is never discarded — but it is flagged `citable: false`, and
 *    PR-06's apply step must refuse to write an accreditation from it
 *    (`pr-plan.md` PR-06 acceptance, `risks.md` §R-09).
 * 2. **Absence is never negative.** A program missing from this dataset is
 *    `sin datos`, not "no acreditada". Nothing here emits a negative status,
 *    and there is deliberately no code path that could.
 *
 * The accreditation *status* is carried through as the source's own words in
 * `statusRaw`. Mapping those words onto our enum is PR-06's job, done once,
 * reviewably — not smeared across two parsers.
 */

import { checksumOf, collapseWhitespace } from '../checksum';
import { parseCsvRecords } from '../csv';
import {
  extractTables,
  findColumn,
  firstHref,
  headerIndex,
  normalizeHeader,
  tableRows,
} from '../html';
import type { RawRecord, SourceParser } from '../contract';

export const DATOS_GOV_PY_BASE = 'https://www.datos.gov.py';
export const ANEAES_BASE_URL = 'https://www.aneaes.gov.py';

export interface AneaesPayload {
  institutionName: string;
  programName: string | null;
  /** The source's own status wording. Never interpreted here. */
  statusRaw: string | null;
  /** "Modelo Nacional", "ARCU-SUR"… */
  modelRaw: string | null;
  resolutionNumber: string | null;
  resolutionUrl: string | null;
  /** Validity window as printed; not parsed into dates at the raw layer. */
  validFromRaw: string | null;
  validToRaw: string | null;
  locationRaw: string | null;
  /**
   * False when the row carries neither a resolution number nor a source URL.
   * PR-06 must not write a positive accreditation from such a row.
   */
  citable: boolean;
  rawCells: string[] | null;
  /** Original CKAN field names, kept so a human can audit the mapping. */
  rawRecord: Record<string, string> | null;
}

const FIELDS = {
  institution: [
    'institucion',
    'universidad',
    'nombre de la institucion',
    'institucion educativa',
    'entidad',
  ],
  program: ['carrera', 'programa', 'nombre de la carrera', 'denominacion'],
  status: ['estado', 'situacion', 'estado de acreditacion', 'acreditacion'],
  model: ['modelo', 'mecanismo', 'tipo de acreditacion'],
  resolution: ['resolucion', 'res', 'n de resolucion', 'numero de resolucion'],
  validFrom: ['vigencia desde', 'fecha de acreditacion', 'desde', 'inicio'],
  validTo: ['vigencia hasta', 'hasta', 'vencimiento', 'fin de vigencia'],
  location: ['sede', 'filial', 'localidad', 'ciudad', 'departamento'],
} as const;

/** Same normalization the HTML column matcher uses, so CSV headers and table
 * headers are addressed by one vocabulary. */
const normalizeKey = normalizeHeader;

/** Pick a CKAN field by any of its known names, exact match before substring. */
function pick(record: Record<string, string>, candidates: readonly string[]): string | null {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(record)) {
    const norm = normalizeKey(key);
    if (!normalized.has(norm)) normalized.set(norm, value);
  }

  for (const candidate of candidates) {
    const value = normalized.get(normalizeKey(candidate));
    if (value != null && collapseWhitespace(value) !== '') return collapseWhitespace(value);
  }
  for (const candidate of candidates) {
    const needle = normalizeKey(candidate);
    for (const [key, value] of normalized) {
      if (key.includes(needle) && collapseWhitespace(value) !== '') {
        return collapseWhitespace(value);
      }
    }
  }
  return null;
}

function toRecord(
  payload: AneaesPayload,
  sourceUrl: string,
  externalId: string | null,
): RawRecord<AneaesPayload> {
  return {
    source: 'ANEAES',
    externalId,
    sourceUrl,
    payload,
    checksum: checksumOf(payload),
  };
}

/**
 * Parse the datos.gov.py CSV export ("Carreras de grado acreditadas").
 * Structured, so this is the preferred path; the HTML parser below is the
 * fallback for when the dataset lags the ANEAES site (`data-sources.md` §1).
 */
export function parseAneaesCsv(
  csv: string,
  context: { sourceUrl: string },
): RawRecord<AneaesPayload>[] {
  const records: RawRecord<AneaesPayload>[] = [];
  const seen = new Set<string>();

  for (const row of parseCsvRecords(csv)) {
    const institutionName = pick(row, FIELDS.institution);
    if (!institutionName) continue;

    const resolutionNumber = pick(row, FIELDS.resolution);
    const payload: AneaesPayload = {
      institutionName,
      programName: pick(row, FIELDS.program),
      statusRaw: pick(row, FIELDS.status),
      modelRaw: pick(row, FIELDS.model),
      resolutionNumber,
      resolutionUrl: null,
      validFromRaw: pick(row, FIELDS.validFrom),
      validToRaw: pick(row, FIELDS.validTo),
      locationRaw: pick(row, FIELDS.location),
      citable: resolutionNumber != null,
      rawCells: null,
      rawRecord: row,
    };

    const record = toRecord(payload, context.sourceUrl, resolutionNumber);
    if (seen.has(record.checksum)) continue;
    seen.add(record.checksum);
    records.push(record);
  }

  return records;
}

/** Parse an ANEAES HTML listing of accredited programs. */
export const parseAneaesHtml: SourceParser<AneaesPayload> = (document, context) => {
  const html = typeof document === 'string' ? document : document.toString('utf8');
  const records: RawRecord<AneaesPayload>[] = [];
  const seen = new Set<string>();

  for (const table of extractTables(html)) {
    const rows = tableRows(table);
    if (rows.length < 2) continue;

    const header = headerIndex(rows[0]);
    const institutionCol = findColumn(header, FIELDS.institution);
    if (institutionCol === -1) continue;

    const cols = {
      program: findColumn(header, FIELDS.program),
      status: findColumn(header, FIELDS.status),
      model: findColumn(header, FIELDS.model),
      resolution: findColumn(header, FIELDS.resolution),
      validFrom: findColumn(header, FIELDS.validFrom),
      validTo: findColumn(header, FIELDS.validTo),
      location: findColumn(header, FIELDS.location),
    };

    const at = (cells: ReturnType<typeof tableRows>[number], index: number): string | null => {
      if (index < 0) return null;
      const value = collapseWhitespace(cells[index]?.text ?? '');
      return value === '' ? null : value;
    };

    for (const cells of rows.slice(1)) {
      const institutionName = at(cells, institutionCol);
      if (!institutionName) continue;
      if (cells.every((cell) => cell.isHeader)) continue;

      const resolutionCell = cols.resolution >= 0 ? cells[cols.resolution] : undefined;
      const resolutionNumber = at(cells, cols.resolution);
      const resolutionUrl = resolutionCell
        ? firstHref(resolutionCell.html, context.sourceUrl)
        : null;

      const payload: AneaesPayload = {
        institutionName,
        programName: at(cells, cols.program),
        statusRaw: at(cells, cols.status),
        modelRaw: at(cells, cols.model),
        resolutionNumber,
        resolutionUrl,
        validFromRaw: at(cells, cols.validFrom),
        validToRaw: at(cells, cols.validTo),
        locationRaw: at(cells, cols.location),
        citable: resolutionNumber != null || resolutionUrl != null,
        rawCells: cells.map((cell) => collapseWhitespace(cell.text)),
        rawRecord: null,
      };

      const record = toRecord(payload, context.sourceUrl, resolutionNumber);
      if (seen.has(record.checksum)) continue;
      seen.add(record.checksum);
      records.push(record);
    }
  }

  return records;
};
