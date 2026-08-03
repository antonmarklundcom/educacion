/**
 * RFC 4180 CSV reader for the datos.gov.py (CKAN) export.
 *
 * The dataset is small enough to hold in memory and irregular enough that a
 * naive `split(',')` is wrong: institution names contain commas, and some
 * fields are quoted with embedded newlines. This handles quoting, escaped
 * quotes, CRLF, a UTF-8 BOM, and semicolon delimiters (which is what you get
 * when the file was last touched by Excel in a Spanish locale).
 */

export interface CsvOptions {
  /** Auto-detected from the header line when omitted. */
  delimiter?: string;
}

/** Detect the delimiter by counting candidates outside quotes on line 1. */
function detectDelimiter(input: string): string {
  const candidates = [',', ';', '\t', '|'];
  let inQuotes = false;
  const counts = new Map<string, number>(candidates.map((c) => [c, 0]));

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && (char === '\n' || char === '\r')) {
      break;
    } else if (!inQuotes && counts.has(char)) {
      counts.set(char, counts.get(char)! + 1);
    }
  }

  let best = ',';
  let bestCount = 0;
  for (const [char, count] of counts) {
    if (count > bestCount) {
      best = char;
      bestCount = count;
    }
  }
  return best;
}

/** Parse CSV into rows of raw string cells. Empty trailing line is dropped. */
export function parseCsv(input: string, options: CsvOptions = {}): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = options.delimiter ?? detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // A blank line is not a record.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      fieldWasQuoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Parse CSV into objects keyed by header. Duplicate headers get a `_2`, `_3`
 * suffix rather than silently overwriting each other; short rows yield empty
 * strings rather than `undefined`, so downstream code has one shape to handle.
 */
export function parseCsvRecords(
  input: string,
  options: CsvOptions = {},
): Array<Record<string, string>> {
  const rows = parseCsv(input, options);
  if (rows.length === 0) return [];

  const seen = new Map<string, number>();
  const headers = rows[0].map((raw) => {
    const base = raw.trim();
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });

  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = cells[i] ?? '';
    });
    return record;
  });
}
