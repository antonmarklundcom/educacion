/**
 * CONES — the habilitación register.
 *
 * What this source is authoritative for is *legality*: which institutions and
 * which carreras are habilitadas, and under which resolution. It is not an
 * accreditation source — a habilitated program is not an accredited one, and
 * conflating the two is the single most damaging mistake this pipeline could
 * make (`plan.md` §2, `risks.md` §R-09). Nothing here emits an accreditation
 * status, and PR-06 must not infer one from a CONES row.
 *
 * The register is published as HTML tables whose columns move between
 * publications, so columns are addressed by header text, not position. When a
 * required column is missing the parser reports it rather than guessing —
 * a silently mis-shifted column is worse than a failed import.
 *
 * PR-05 scope: parse to raw records. No matching, no normalization beyond
 * whitespace, no writes to curated tables.
 */

import { checksumOf, collapseWhitespace } from '../checksum';
import { extractTables, findColumn, firstHref, headerIndex, tableRows } from '../html';
import type { RawRecord, SourceParser } from '../contract';

export const CONES_BASE_URL = 'https://www.cones.gov.py';

/**
 * Verbatim-ish view of one register row. Every field is optional because the
 * register genuinely omits them; `null` here means "the source did not say",
 * never "no" (rule 2 in CLAUDE.md, applied at the source layer).
 */
export interface ConesPayload {
  kind: 'institution' | 'program';
  /** Institution name exactly as the register prints it. */
  institutionName: string;
  /** CONES' own code where the table carries one — the only trustworthy key. */
  conesCode: string | null;
  /** Present on `kind: 'program'` rows. */
  programName: string | null;
  /** Free text: "Grado", "Maestría"… Left uninterpreted for PR-06 to map. */
  levelRaw: string | null;
  /** Free text: "Presencial", "A distancia"… */
  modalityRaw: string | null;
  /** Where the register says it is taught. Not resolved to a city id here. */
  locationRaw: string | null;
  /** Habilitación resolution, e.g. "Res. CONES N° 123/2024". */
  resolutionNumber: string | null;
  /** Link to the resolution PDF. We link to it; we never republish it (§2). */
  resolutionUrl: string | null;
  /** The row as the table printed it, for a human resolving a conflict later. */
  rawCells: string[];
}

const COLUMNS = {
  institution: ['institucion', 'universidad', 'nombre de la institucion', 'entidad'],
  code: ['codigo', 'cod', 'codigo cones', 'n'],
  program: ['carrera', 'programa', 'carrera programa', 'denominacion'],
  level: ['nivel', 'tipo', 'grado academico', 'titulo'],
  modality: ['modalidad'],
  location: ['sede', 'filial', 'localidad', 'ciudad', 'departamento'],
  resolution: ['resolucion', 'res', 'n de resolucion', 'acta'],
} as const;

export class ParseError extends Error {
  constructor(
    message: string,
    readonly sourceUrl: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

function cellAt(cells: readonly { text: string }[], index: number): string | null {
  if (index < 0) return null;
  const value = collapseWhitespace(cells[index]?.text ?? '');
  return value === '' ? null : value;
}

/**
 * Parse a CONES register page. Every table on the page is considered; those
 * without a recognizable institution column are skipped, which is how the
 * layout/navigation tables that wrap government pages get ignored.
 */
export const parseConesRegister: SourceParser<ConesPayload> = (document, context) => {
  const html = typeof document === 'string' ? document : document.toString('utf8');
  const records: RawRecord<ConesPayload>[] = [];
  const seen = new Set<string>();

  for (const table of extractTables(html)) {
    const rows = tableRows(table);
    if (rows.length < 2) continue;

    const header = headerIndex(rows[0]);
    const institutionCol = findColumn(header, COLUMNS.institution);
    if (institutionCol === -1) continue; // Not a register table.

    const codeCol = findColumn(header, COLUMNS.code);
    const programCol = findColumn(header, COLUMNS.program);
    const levelCol = findColumn(header, COLUMNS.level);
    const modalityCol = findColumn(header, COLUMNS.modality);
    const locationCol = findColumn(header, COLUMNS.location);
    const resolutionCol = findColumn(header, COLUMNS.resolution);

    for (const cells of rows.slice(1)) {
      // A row that repeats the header (these tables paginate by repeating it)
      // or that has no institution name carries no information.
      const institutionName = cellAt(cells, institutionCol);
      if (!institutionName) continue;
      if (cells.every((cell) => cell.isHeader)) continue;

      const programName = cellAt(cells, programCol);
      const resolutionCell = resolutionCol >= 0 ? cells[resolutionCol] : undefined;

      const payload: ConesPayload = {
        kind: programName ? 'program' : 'institution',
        institutionName,
        conesCode: cellAt(cells, codeCol),
        programName,
        levelRaw: cellAt(cells, levelCol),
        modalityRaw: cellAt(cells, modalityCol),
        locationRaw: cellAt(cells, locationCol),
        resolutionNumber: cellAt(cells, resolutionCol),
        resolutionUrl: resolutionCell ? firstHref(resolutionCell.html, context.sourceUrl) : null,
        rawCells: cells.map((cell) => collapseWhitespace(cell.text)),
      };

      const checksum = checksumOf(payload);
      // The register repeats rows across paginated views of the same list;
      // deduplicating here keeps the run summary honest about rows in.
      if (seen.has(checksum)) continue;
      seen.add(checksum);

      records.push({
        source: 'CONES',
        externalId: payload.conesCode,
        sourceUrl: context.sourceUrl,
        payload,
        checksum,
      });
    }
  }

  return records;
};
