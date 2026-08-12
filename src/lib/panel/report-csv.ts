/**
 * The monthly report as CSV (PR-28). Pure — no I/O, no session, testable
 * without a database.
 *
 * Two sections in one file, separated by a blank line: the totals with their
 * month-over-month comparison, then one row per carrera. A spreadsheet opens
 * it, a person reads it, and every number in it is one the dashboard shows —
 * both come from `panelMonthlyReport`, so there is nothing here that could
 * disagree with the screen.
 *
 * The redaction question does not arise: this file contains no lead contact
 * details, only counts. `/panel/leads/export` is the one that carries personal
 * data and it has its own gate.
 */

import type { PanelAnalytics } from '@/db/queries/panel/analytics';

/** RFC 4180, same rule as `leads-csv.ts`. */
function cell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function row(values: (string | number | null | undefined)[]): string {
  return values.map(cell).join(',');
}

/** "+12,5%", "-8%", or the honest gap when the previous period was zero. */
export function formatDelta(deltaPct: number | null): string {
  if (deltaPct == null) return 'sin base de comparación';
  const sign = deltaPct > 0 ? '+' : '';
  return `${sign}${deltaPct.toString().replace('.', ',')}%`;
}

export function reportToCsv(report: PanelAnalytics & { month: string }): string {
  const lines: string[] = [];

  lines.push(row(['reporte', 'educacion.com.py']));
  lines.push(row(['mes', report.month]));
  lines.push(row(['desde', report.range.since.toISOString().slice(0, 10)]));
  lines.push(row(['hasta_exclusive', report.range.until.toISOString().slice(0, 10)]));
  lines.push('');

  lines.push(row(['metrica', 'periodo', 'periodo_anterior', 'variacion']));
  lines.push(
    row([
      'vistas',
      report.views.current,
      report.views.previous,
      formatDelta(report.views.deltaPct),
    ]),
  );
  lines.push(
    row([
      'clics_whatsapp',
      report.whatsappClicks.current,
      report.whatsappClicks.previous,
      formatDelta(report.whatsappClicks.deltaPct),
    ]),
  );
  lines.push(
    row([
      'solicitudes',
      report.leads.current,
      report.leads.previous,
      formatDelta(report.leads.deltaPct),
    ]),
  );
  lines.push(
    row([
      'apariciones_comparador',
      report.compareAppearances.current,
      report.compareAppearances.previous,
      formatDelta(report.compareAppearances.deltaPct),
    ]),
  );
  lines.push('');

  lines.push(row(['carrera', 'sede', 'vistas', 'clics_whatsapp', 'apariciones_comparador']));
  for (const program of report.programs ?? []) {
    lines.push(
      row([
        program.programName,
        program.campusName,
        program.views,
        program.whatsappClicks,
        program.compareAppearances,
      ]),
    );
  }

  return `${lines.join('\n')}\n`;
}
