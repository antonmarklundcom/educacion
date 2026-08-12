import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { panelMonthlyReport } from '@/db/queries/panel/analytics';
import { getOwnInstitution } from '@/db/queries/panel/catalog';
import { formatDelta } from '@/lib/panel/report-csv';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  const name = MONTH_NAMES[Number(index) - 1];
  return name ? `${name} de ${year}` : month;
}

/**
 * The printable monthly report — the artefact a renewal conversation is built
 * on (`pr-plan.md` PR-28).
 *
 * ### Why "PDF" is the browser's print dialog and not a library
 *
 * The PR asks for PDF/CSV. CSV is a route handler. For the PDF, the options
 * were a rendering library (`puppeteer` — a second Chromium on a shared
 * Hostinger slot; `pdfkit`/`react-pdf` — a second layout engine to keep in
 * sync with this page forever) or a page designed to print. This is the page
 * designed to print: `@media print` hides the navigation and the button, the
 * layout is already a single column, and "Guardar como PDF" in the browser
 * produces a file with selectable text and working links. One layout, one set
 * of numbers, no dependency, and nothing to drift.
 *
 * Every number here comes from `panelMonthlyReport`, the same function the CSV
 * reads — the printed sheet and the spreadsheet cannot disagree.
 */
export default async function MonthlyReportPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  const params = await searchParams;
  const raw = params.mes;
  const month = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  let report;
  let institution;
  try {
    [report, institution] = await Promise.all([
      panelMonthlyReport(user, month),
      getOwnInstitution(user),
    ]);
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.reason === 'unauthenticated') redirect('/ingresar');
      notFound();
    }
    throw error;
  }

  const rows = [
    { label: 'Vistas de tus carreras', metric: report.views },
    { label: 'Clics a WhatsApp', metric: report.whatsappClicks },
    { label: 'Solicitudes recibidas', metric: report.leads },
    { label: 'Apariciones en el comparador', metric: report.compareAppearances },
  ];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 print:max-w-none print:py-0">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <Link
          href="/panel/estadisticas"
          className="text-body hover:text-ink text-sm underline underline-offset-4"
        >
          ← Volver a estadísticas
        </Link>
        <p className="text-muted text-sm">
          Para guardarlo en PDF: imprimí esta página y elegí “Guardar como PDF”.
        </p>
      </div>

      <header className="flex flex-col gap-1">
        <p className="text-muted text-xs">educacion.com.py · reporte mensual</p>
        <h1 className="text-ink text-2xl font-bold">
          {institution?.nameShort ?? 'Tu institución'} — {monthLabel(report.month)}
        </h1>
        <p className="text-muted text-sm">
          Período {report.range.since.toISOString().slice(0, 10)} a{' '}
          {new Date(report.range.until.getTime() - 86_400_000).toISOString().slice(0, 10)} (UTC).
          Comparado con el mes anterior.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-semibold">Totales</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="text-muted py-2 font-medium">Métrica</th>
              <th className="text-muted py-2 text-right font-medium">Mes</th>
              <th className="text-muted py-2 text-right font-medium">Mes anterior</th>
              <th className="text-muted py-2 text-right font-medium">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-border border-b last:border-0">
                <td className="text-body py-2">{row.label}</td>
                <td className="text-ink py-2 text-right font-mono">
                  {row.metric.current.toLocaleString('es-PY')}
                </td>
                <td className="text-muted py-2 text-right font-mono">
                  {row.metric.previous.toLocaleString('es-PY')}
                </td>
                <td className="text-body py-2 text-right">{formatDelta(row.metric.deltaPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-semibold">Por carrera</h2>
        {report.programs && report.programs.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-muted py-2 font-medium">Carrera</th>
                <th className="text-muted py-2 font-medium">Sede</th>
                <th className="text-muted py-2 text-right font-medium">Vistas</th>
                <th className="text-muted py-2 text-right font-medium">WhatsApp</th>
                <th className="text-muted py-2 text-right font-medium">Comparador</th>
              </tr>
            </thead>
            <tbody>
              {report.programs.map((program) => (
                <tr key={program.offeringId} className="border-border border-b last:border-0">
                  <td className="text-body py-2">{program.programName}</td>
                  <td className="text-muted py-2">{program.campusName}</td>
                  <td className="text-body py-2 text-right font-mono">{program.views}</td>
                  <td className="text-body py-2 text-right font-mono">{program.whatsappClicks}</td>
                  <td className="text-body py-2 text-right font-mono">
                    {program.compareAppearances}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted text-sm">
            No registramos actividad en tus carreras durante este mes.
          </p>
        )}
      </section>

      <footer className="border-border text-faint flex flex-col gap-1 border-t pt-4 text-xs">
        <p>
          Las vistas y los clics se cuentan del lado del navegador: un robot, un chequeo automático
          o un visitante sin JavaScript no suman. Preferimos que falte antes que inflar.
        </p>
        <p>
          Las solicitudes se cuentan sobre las que quedaron guardadas en el panel, no sobre el
          evento de envío. Los períodos se calculan en UTC.
        </p>
        <p>
          educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC,
          CONES ni ANEAES.
        </p>
      </footer>
    </main>
  );
}
