import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { Button } from '@/components/ui';
import { panelAnalytics, type PanelMetric } from '@/db/queries/panel/analytics';
import { formatDelta } from '@/lib/panel/report-csv';
import { RANGE_DAYS, RANGE_LABELS, RANGE_PARAM, parseRangeDays } from '@/lib/analytics/range';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function Metric({ label, metric, detail }: { label: string; metric: PanelMetric; detail: string }) {
  return (
    <div className="border-border bg-surface flex flex-col gap-1 rounded-md border p-4">
      <span className="text-ink font-mono text-2xl font-semibold">
        {metric.current.toLocaleString('es-PY')}
      </span>
      <span className="text-ink text-sm font-medium">{label}</span>
      <span className="text-muted text-xs">
        {formatDelta(metric.deltaPct)} vs. el período anterior (
        {metric.previous.toLocaleString('es-PY')})
      </span>
      <span className="text-faint text-xs">{detail}</span>
    </div>
  );
}

function lastMonth(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * `/panel/estadisticas` — what happened with this institution's carreras.
 *
 * Every number is scoped by `panelInstitutionId(user)` inside the query
 * module; this page passes no institution id and has none to pass. The free
 * tier gets the four totals and the comparison; the per-carrera table, the
 * daily series and the export need a plan, and the page says so in one line
 * rather than showing a blurred teaser of numbers the institution cannot read.
 */
export default async function PanelStatsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  const params = await searchParams;
  const days = parseRangeDays(params[RANGE_PARAM]);

  let stats;
  try {
    stats = await panelAnalytics(user, { days });
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  const month = lastMonth(new Date());

  return (
    <>
      <PanelNav current="/panel/estadisticas" />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-ink text-2xl font-bold">Estadísticas</h1>
            <p className="text-muted max-w-prose text-sm">
              Lo que pasó con tus carreras en el sitio. Las vistas y los clics se cuentan del lado
              del navegador, así que un robot o un chequeo automático no suma.
            </p>
          </div>
          <nav aria-label="Período" className="flex gap-2">
            {RANGE_DAYS.map((option) => (
              <Link
                key={option}
                href={`/panel/estadisticas?${RANGE_PARAM}=${option}`}
                aria-current={option === days ? 'page' : undefined}
                className={
                  option === days
                    ? 'text-ink border-border-strong bg-card-alt rounded-md border px-3 py-2 text-sm font-semibold'
                    : 'text-body hover:text-ink border-border rounded-md border px-3 py-2 text-sm'
                }
              >
                {RANGE_LABELS[option]}
              </Link>
            ))}
          </nav>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Vistas de tus carreras"
            metric={stats.views}
            detail="Páginas de carrera abiertas por una persona."
          />
          <Metric
            label="Clics a WhatsApp"
            metric={stats.whatsappClicks}
            detail="Chats abiertos con ustedes desde el sitio."
          />
          <Metric
            label="Solicitudes"
            metric={stats.leads}
            detail="Contado sobre las solicitudes guardadas, no sobre el evento."
          />
          <Metric
            label="Apariciones en el comparador"
            metric={stats.compareAppearances}
            detail="Veces que alguien puso una carrera tuya a comparar."
          />
        </section>

        {stats.full ? (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-ink text-lg font-semibold">Por carrera</h2>
              {stats.programs && stats.programs.length > 0 ? (
                <div className="border-border overflow-x-auto rounded-md border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-border bg-card-alt border-b text-left">
                        <th className="text-muted px-4 py-3 font-medium">Carrera</th>
                        <th className="text-muted px-4 py-3 font-medium">Sede</th>
                        <th className="text-muted px-4 py-3 text-right font-medium">Vistas</th>
                        <th className="text-muted px-4 py-3 text-right font-medium">WhatsApp</th>
                        <th className="text-muted px-4 py-3 text-right font-medium">Comparador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.programs.map((program) => (
                        <tr
                          key={program.offeringId}
                          className="border-border border-b last:border-0"
                        >
                          <td className="text-body px-4 py-3">{program.programName}</td>
                          <td className="text-muted px-4 py-3">{program.campusName}</td>
                          <td className="text-body px-4 py-3 text-right font-mono">
                            {program.views}
                          </td>
                          <td className="text-body px-4 py-3 text-right font-mono">
                            {program.whatsappClicks}
                          </td>
                          <td className="text-body px-4 py-3 text-right font-mono">
                            {program.compareAppearances}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
                  Todavía no hay actividad en este período. Cuando la haya, cada carrera aparece acá
                  con sus propios números.
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-ink text-lg font-semibold">Reporte mensual</h2>
              <p className="text-body max-w-prose text-sm">
                El mismo detalle para un mes cerrado, para imprimir o guardar como PDF, y en CSV
                para tu planilla.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button href={`/panel/estadisticas/reporte?mes=${month}`}>
                  Ver el reporte de {month}
                </Button>
                <Button variant="secondary" href={`/panel/estadisticas/export?mes=${month}`}>
                  Descargá el CSV
                </Button>
              </div>
            </section>
          </>
        ) : (
          <section className="border-border bg-card-alt flex flex-col gap-2 rounded-md border p-5">
            <h2 className="text-ink text-base font-semibold">
              El detalle por carrera es parte de los planes
            </h2>
            <p className="text-body max-w-prose text-sm">
              Los totales de arriba son tuyos siempre. Con un plan ves qué carrera concreta se lleva
              las vistas y los clics, la evolución día por día, y el reporte mensual exportable.{' '}
              <Link href="/para-instituciones" className="text-ink font-medium underline">
                Mirá los planes
              </Link>
              .
            </p>
          </section>
        )}

        <p className="text-faint max-w-prose text-xs">
          Las solicitudes se cuentan sobre las que quedaron guardadas, no sobre el evento de envío:
          si los dos números no coinciden, el que vale es el que podés responder. Todos los períodos
          se calculan en UTC.
        </p>
      </main>
    </>
  );
}
