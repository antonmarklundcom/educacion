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
 * ## The site as it stands (verified against saved pages, Aug 2026)
 *
 * CONES reorganized: `/universidades-habilitadas/` and `/carreras-habilitadas/`
 * are both 404. The register now lives in two differently-shaped places, and
 * neither of them is one big table:
 *
 *  - `/universidades/` — a **card grid** (`div.dc-card`), 12 institutions per
 *    page, 5 pages, 59 records. No table anywhere on the page, which is why the
 *    old table-only parser returned zero. Each card links to the institution's
 *    own page and prints a labelled contact blurb.
 *  - each institution page, and `/category/ofertas-academicas/` — a
 *    **wpDataTable** of that institution's carreras: `Carrera/Programa`,
 *    `Tipo`, `Sede o Filial`, `Documento respaldatorio` (resolution number +
 *    link), `IES`, `Antecedentes`, `Estado`. Server-rendered; no JS or POST
 *    needed to read it.
 *
 * So this module exposes two parsers and a dispatcher that runs both, because a
 * single page can carry either shape and the operator running `--file` on a
 * page saved by hand should not have to know which.
 *
 * Columns are still addressed by header text, not position — government tables
 * reorder between publications. When a required column is missing the row is
 * skipped rather than guessed at: a silently mis-shifted column is worse than a
 * failed import.
 *
 * PR-05 scope: parse to raw records. No matching, no normalization beyond
 * whitespace, no writes to curated tables.
 */

import { checksumOf, collapseWhitespace } from '../checksum';
import {
  allHrefs,
  extractElements,
  extractTables,
  findColumn,
  firstHref,
  headerIndex,
  normalizeHeader,
  tableRows,
  textOf,
} from '../html';
import type { RawRecord, SourceParser } from '../contract';

/** The site answers on the bare host; `www.` is not used in its own links. */
export const CONES_BASE_URL = 'https://cones.gov.py';

/**
 * Verbatim-ish view of one register row. Every field is optional because the
 * register genuinely omits them; `null` here means "the source did not say",
 * never "no" (rule 2 in CLAUDE.md, applied at the source layer).
 */
export interface ConesPayload {
  kind: 'institution' | 'program';
  /** Institution name exactly as the register prints it. */
  institutionName: string;
  /**
   * Whether the institution name came from the row's own `IES` cell or from
   * the enclosing table (see `tableInstitutionName`). Carried so a human
   * resolving a conflict can see how the row was attributed.
   */
  institutionNameSource: 'row' | 'table' | 'card';
  /** CONES' own code where the table carries one — the only trustworthy key. */
  conesCode: string | null;
  /** Present on `kind: 'program'` rows. */
  programName: string | null;
  /** Free text: "Grado", "Maestría"… Left uninterpreted for PR-06 to map. */
  levelRaw: string | null;
  /**
   * Free text: "Presencial", "A distancia"… The current register **does not
   * publish a modality column at all**, so this is null on every program row
   * scraped today. That is an honest gap, not a parser bug: PR-06 refuses to
   * create an offering without a stated modality, and it should keep refusing.
   */
  modalityRaw: string | null;
  /** Where the register says it is taught ("Sede o Filial"). Not resolved to a city id here. */
  locationRaw: string | null;
  /** Habilitación resolution, e.g. "173/2026" as printed in "Documento respaldatorio". */
  resolutionNumber: string | null;
  /** Link to the resolution document. We link to it; we never republish it (§2). */
  resolutionUrl: string | null;
  /**
   * The register's own "Estado" cell — in practice empty or "INACTIVO".
   *
   * Deliberately **not** named `statusRaw`: this is the standing of the
   * *offering*, and it must never be fed to `mapAccreditationStatus`. CONES
   * cannot say anything about accreditation (`plan.md` §2).
   */
  offeringStatusRaw: string | null;
  /** "Antecedentes" — earlier resolutions the register cites, as printed. */
  antecedentsRaw: string | null;
  /** The institution's own page on cones.gov.py, where its carreras table lives. */
  detailUrl: string | null;
  /** Labelled contact fields off an institution card. Null unless labelled. */
  phoneRaw: string | null;
  addressRaw: string | null;
  websiteRaw: string | null;
  /** The row as the source printed it, for a human resolving a conflict later. */
  rawCells: string[];
}

const COLUMNS = {
  // "IES" is what the current tables use; the older wording is kept so a
  // reverted or differently-built page still parses.
  institution: ['ies', 'institucion', 'universidad', 'nombre de la institucion', 'entidad'],
  // NB: no bare "n" candidate here. `findColumn` falls back to substring
  // matching, and "n" matches "documento respaldatorio" — which would file
  // resolution numbers as CONES codes, and therefore as external ids.
  code: ['codigo cones', 'codigo', 'cod'],
  program: ['carrera programa', 'carrera', 'programa', 'denominacion'],
  level: ['tipo', 'nivel', 'grado academico', 'titulo'],
  modality: ['modalidad'],
  location: ['sede o filial', 'sede', 'filial', 'localidad', 'ciudad', 'departamento'],
  resolution: ['documento respaldatorio', 'resolucion', 'res', 'n de resolucion', 'acta'],
  status: ['estado', 'situacion', 'vigencia'],
  antecedents: ['antecedentes'],
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

function emptyPayload(): Omit<ConesPayload, 'kind' | 'institutionName' | 'institutionNameSource'> {
  return {
    conesCode: null,
    programName: null,
    levelRaw: null,
    modalityRaw: null,
    locationRaw: null,
    resolutionNumber: null,
    resolutionUrl: null,
    offeringStatusRaw: null,
    antecedentsRaw: null,
    detailUrl: null,
    phoneRaw: null,
    addressRaw: null,
    websiteRaw: null,
    rawCells: [],
  };
}

function toRecord(payload: ConesPayload, sourceUrl: string): RawRecord<ConesPayload> {
  return {
    source: 'CONES',
    externalId: payload.conesCode,
    sourceUrl,
    payload,
    checksum: checksumOf(payload),
  };
}

/* -------------------------------------------------------------------------- */
/* Institutions — the /universidades/ card grid                               */
/* -------------------------------------------------------------------------- */

/**
 * The labels a card blurb actually uses. A closed vocabulary, not a general
 * `word:` pattern — "Ciudad: Asunción URL: …" would otherwise read
 * "Asunción URL" as a label and swallow the city, and a directory that files
 * a university under the wrong city is worse than one that files it under
 * none.
 */
const CARD_LABELS: ReadonlyArray<[key: string, pattern: string]> = [
  ['phone', 'tel[eé]fonos?|tel'],
  ['address', 'direcci[oó]n|domicilio'],
  ['city', 'ciudad|localidad'],
  ['website', 'p[aá]gina web|sitio web|web|url'],
  ['email', 'correo electr[oó]nico|correo|e-?mail'],
];

const CARD_LABEL_PATTERN = new RegExp(
  `(?:^|[\\s.;·|])(${CARD_LABELS.map(([, pattern]) => pattern).join('|')})\\s*:`,
  'gi',
);

function labelKey(matched: string): string | null {
  const value = normalizeHeader(matched);
  for (const [key, pattern] of CARD_LABELS) {
    if (new RegExp(`^(?:${pattern})$`, 'i').test(value)) return key;
  }
  return null;
}

/**
 * A card's blurb arrives as one run of text: "Teléfono: 0981 224294 Dirección:
 * Calle X casi Y Web: https://…". Split it at its own labels — an unlabelled
 * fragment stays unclaimed, which is the point: we would rather store nothing
 * than store a phone number in `address`.
 */
export function labelledFields(text: string): Map<string, string> {
  const marks: Array<{ key: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  CARD_LABEL_PATTERN.lastIndex = 0;

  while ((match = CARD_LABEL_PATTERN.exec(text)) !== null) {
    const key = labelKey(match[1]);
    if (key) {
      marks.push({ key, start: match.index, end: match.index + match[0].length });
    }
  }

  const fields = new Map<string, string>();
  marks.forEach((mark, i) => {
    // A label's value runs to the next label, or to the end of the blurb.
    const value = collapseWhitespace(text.slice(mark.end, marks[i + 1]?.start ?? text.length));
    if (value && !fields.has(mark.key)) fields.set(mark.key, value);
  });

  return fields;
}

/**
 * `/universidades/` and its `page/N/` views: one record per institution card.
 *
 * A card carries no CONES code — the site does not publish one — so these rows
 * match by name downstream, which is exactly the case `institution_aliases`
 * exists to make cheap after the first cycle (§4.5).
 */
export const parseConesInstitutions: SourceParser<ConesPayload> = (document, context) => {
  const html = typeof document === 'string' ? document : document.toString('utf8');
  const records: RawRecord<ConesPayload>[] = [];

  for (const card of extractElements(html, 'div', { className: 'dc-card' })) {
    const heading = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(card);
    const institutionName = heading ? textOf(heading[1]) : '';
    if (!institutionName) continue;

    const blurb = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(card);
    const fields = labelledFields(blurb ? textOf(blurb[1]) : '');

    records.push(
      toRecord(
        {
          ...emptyPayload(),
          kind: 'institution',
          institutionName,
          institutionNameSource: 'card',
          // The card's own link is the institution's page — and the page that
          // carries its carreras table, which is how the crawl finds programs.
          detailUrl: firstHref(card, context.sourceUrl),
          locationRaw: fields.get('city') ?? null,
          phoneRaw: fields.get('phone') ?? null,
          addressRaw: fields.get('address') ?? null,
          websiteRaw: fields.get('website') ?? null,
          rawCells: [institutionName, blurb ? textOf(blurb[1]) : ''].filter(Boolean),
        },
        context.sourceUrl,
      ),
    );
  }

  return records;
};

/* -------------------------------------------------------------------------- */
/* Programs — the wpDataTable of carreras                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one institution named by a table, or null when it names several.
 *
 * The register publishes one table per institution and repeats the name in
 * every row — but not in *every* row: rows are occasionally truncated mid-way
 * and lose their trailing cells. Falling back to the table's own single
 * distinct `IES` value recovers those rows without inventing anything; a table
 * that genuinely lists more than one institution gets no fallback, and its
 * incomplete rows are dropped.
 */
export function tableInstitutionName(
  rows: readonly (readonly { text: string }[])[],
  institutionCol: number,
): string | null {
  if (institutionCol < 0) return null;
  const names = new Set<string>();
  for (const cells of rows) {
    const name = cellAt(cells, institutionCol);
    if (name) names.add(name);
    if (names.size > 1) return null;
  }
  return names.size === 1 ? [...names][0] : null;
}

/**
 * Any page carrying a carreras table: the institution's own page, or the
 * `/category/ofertas-academicas/` archive.
 *
 * `pageInstitutionName` is a caller-supplied last resort — the crawl knows
 * which institution's page it fetched, from the card it followed. It is only
 * consulted when the table itself is silent.
 */
export function parseConesPrograms(
  document: string | Buffer,
  context: { sourceUrl: string; pageInstitutionName?: string | null },
): RawRecord<ConesPayload>[] {
  const html = typeof document === 'string' ? document : document.toString('utf8');
  const records: RawRecord<ConesPayload>[] = [];

  for (const table of extractTables(html)) {
    const rows = tableRows(table);
    if (rows.length < 2) continue;

    const header = headerIndex(rows[0]);
    const programCol = findColumn(header, COLUMNS.program);
    if (programCol === -1) continue; // Not a carreras table.

    const institutionCol = findColumn(header, COLUMNS.institution);
    const codeCol = findColumn(header, COLUMNS.code);
    const levelCol = findColumn(header, COLUMNS.level);
    const modalityCol = findColumn(header, COLUMNS.modality);
    const locationCol = findColumn(header, COLUMNS.location);
    const resolutionCol = findColumn(header, COLUMNS.resolution);
    const statusCol = findColumn(header, COLUMNS.status);
    const antecedentsCol = findColumn(header, COLUMNS.antecedents);

    const body = rows.slice(1);
    const fallbackName = tableInstitutionName(body, institutionCol) ?? context.pageInstitutionName;

    for (const cells of body) {
      if (cells.every((cell) => cell.isHeader)) continue; // Repeated header row.

      const programName = cellAt(cells, programCol);
      if (!programName) continue;

      const rowInstitution = cellAt(cells, institutionCol);
      const institutionName = rowInstitution ?? fallbackName;
      // No name, no row. Attributing a carrera to the wrong university is
      // worse than losing it, and the raw cells are gone from the DB either
      // way — so it is dropped here rather than stored unattributed.
      if (!institutionName) continue;

      const resolutionCell = resolutionCol >= 0 ? cells[resolutionCol] : undefined;

      records.push(
        toRecord(
          {
            ...emptyPayload(),
            kind: 'program',
            institutionName,
            institutionNameSource: rowInstitution ? 'row' : 'table',
            conesCode: cellAt(cells, codeCol),
            programName,
            levelRaw: cellAt(cells, levelCol),
            modalityRaw: cellAt(cells, modalityCol),
            locationRaw: cellAt(cells, locationCol),
            resolutionNumber: cellAt(cells, resolutionCol),
            resolutionUrl: resolutionCell
              ? firstHref(resolutionCell.html, context.sourceUrl)
              : null,
            offeringStatusRaw: cellAt(cells, statusCol),
            antecedentsRaw: cellAt(cells, antecedentsCol),
            rawCells: cells.map((cell) => collapseWhitespace(cell.text)),
          },
          context.sourceUrl,
        ),
      );
    }
  }

  return records;
}

/* -------------------------------------------------------------------------- */
/* Dispatcher & crawl helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parse whatever a CONES page turns out to be. Both shapes are attempted, so
 * an operator pointing `--file` at a page saved by hand does not have to know
 * which one they saved, and a page carrying both is read whole.
 */
export const parseConesRegister: SourceParser<ConesPayload> = (document, context) => {
  const records = [
    ...parseConesInstitutions(document, context),
    ...parseConesPrograms(document, context),
  ];
  return dedupeByChecksum(records);
};

/**
 * A human-readable digest of a CONES parse, for `--dry-run`.
 *
 * The failure this exists to make loud: a source that reorganizes returns a
 * page that fetches fine and parses to nothing. A bare total hides that behind
 * a plausible-looking number — which is how the pre-rewrite parsers stayed
 * broken. Every line here is a number an operator can sanity-check against the
 * page in their browser.
 */
export function summarizeConesRecords(records: readonly RawRecord<ConesPayload>[]): string[] {
  const institutions = records.filter((record) => record.payload.kind === 'institution');
  const programs = records.filter((record) => record.payload.kind === 'program');
  const named = new Set(records.map((record) => record.payload.institutionName));
  const lines = [
    `Institutions          ${institutions.length}`,
    `Programs              ${programs.length}`,
    `Distinct institutions ${named.size}`,
  ];

  if (programs.length > 0) {
    const inactive = programs.filter((record) => record.payload.offeringStatusRaw).length;
    const noResolution = programs.filter((record) => !record.payload.resolutionNumber).length;
    const attributedByTable = programs.filter(
      (record) => record.payload.institutionNameSource === 'table',
    ).length;

    lines.push(`  with an Estado      ${inactive}   (INACTIVO and the like — not offered today)`);
    lines.push(
      `  without resolution  ${noResolution}${noResolution > 0 ? '   ← check the "Documento respaldatorio" column' : ''}`,
    );
    if (attributedByTable > 0) {
      lines.push(`  attributed by table ${attributedByTable}   (rows the register truncated)`);
    }
    // The register stopped publishing modality; a sudden non-zero here means it
    // started again, and PR-06 can begin creating offerings.
    const withModality = programs.filter((record) => record.payload.modalityRaw).length;
    lines.push(`  with a modality     ${withModality}   (expected 0 — see data-sources.md §1.1)`);
  }

  return lines;
}

/** The register repeats rows across paginated views; collapse them once. */
export function dedupeByChecksum(
  records: readonly RawRecord<ConesPayload>[],
): RawRecord<ConesPayload>[] {
  const seen = new Set<string>();
  const unique: RawRecord<ConesPayload>[] = [];
  for (const record of records) {
    if (seen.has(record.checksum)) continue;
    seen.add(record.checksum);
    unique.push(record);
  }
  return unique;
}

/**
 * Further pages of a paginated listing.
 *
 * WordPress prints these as `…/page/N/` (the card grid) or `?paged=N`. Only
 * links under the same path as the page we are on are followed — the point is
 * to walk one listing to its end, not to crawl the site.
 */
export function conesPaginationLinks(html: string, sourceUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(sourceUrl);
  } catch {
    return []; // A --file run has a path here, and a path paginates nowhere.
  }

  const listingPath = base.pathname.replace(/(?:page\/\d+\/?)$/, '');
  const links: string[] = [];

  for (const href of allHrefs(html, sourceUrl)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (url.host !== base.host) continue;

    const isPagePath = /\/page\/\d+\/?$/.test(url.pathname);
    const isPagedQuery = url.searchParams.has('paged');
    if (!isPagePath && !isPagedQuery) continue;
    if (!url.pathname.replace(/(?:page\/\d+\/?)$/, '').startsWith(listingPath)) continue;

    url.hash = '';
    const normalized = url.toString();
    if (normalized !== sourceUrl && !links.includes(normalized)) links.push(normalized);
  }

  return links;
}
