/**
 * CSV formatting for `/panel/leads/export` (PR-23). Pure — no I/O, testable
 * without a database or a request.
 *
 * Columns are exactly `PanelLeadExportRow`'s fields, so a free-plan
 * institution's redacted `null`s become empty cells rather than the word
 * "null" — the redaction already happened in `db/queries/panel/leads.ts`, and
 * this only ever renders what it was given.
 */

import { formatParaguayanPhone } from '@/lib/leads/phone';
import type { PanelLeadExportRow } from '@/db/queries/panel/leads';

const HEADERS = [
  'id',
  'fecha',
  'estado',
  'edad',
  'carrera',
  'nombre',
  'telefono',
  'email',
  'mensaje',
  'pagina',
] as const;

/** RFC 4180: double the quotes, wrap in quotes if the value needs it. */
function cell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function leadsToCsv(rows: readonly PanelLeadExportRow[]): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.createdAt.toISOString(),
        row.status,
        row.ageBracket,
        row.programName,
        row.name,
        row.phoneE164 ? formatParaguayanPhone(row.phoneE164) : null,
        row.email,
        row.message,
        row.sourcePage,
      ]
        .map(cell)
        .join(','),
    );
  }
  // CRLF: the format Excel expects, and the RFC 4180 default.
  return lines.join('\r\n') + '\r\n';
}
