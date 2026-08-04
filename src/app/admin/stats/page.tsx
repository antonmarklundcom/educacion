/**
 * `/admin/stats` — the internal read-only view of the first-party event log.
 *
 * This is the page that answers "is any of this working" before PR-28 turns
 * the same numbers into something an institution sees. It reads, it never
 * writes, and it shows counts and nothing else — there is no PII in `events` to
 * show (`architecture.md` §12).
 *
 * **It 404s unless `ADMIN_STATS_TOKEN` is set and matches.** PR-18 owns real
 * auth; until then the gate fails closed, which is the flag `agent-workflow.md`
 * §6 requires around a feature whose access control is not built yet. See
 * `lib/analytics/admin-access`.
 *
 * **Every number here is measured.** With an empty `events` table the page says
 * so plainly rather than rendering a zero that looks like a reading
 * (CLAUDE.md rule 1).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  countEventsByDay,
  countEventsByInstitution,
  countEventsByType,
  type EventType,
} from '@/db/queries/events';
import { getInstitutionNames } from '@/db/queries/institutions';
import { STATS_TOKEN_PARAM, hasStatsAccess } from '@/lib/analytics/admin-access';
import {
  RANGE_DAYS,
  RANGE_LABELS,
  RANGE_PARAM,
  fillDays,
  parseRangeDays,
  toRange,
} from '@/lib/analytics/range';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Estadísticas internas',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Spanish labels for the event vocabulary. The enum is the source of truth. */
const EVENT_LABELS: Record<EventType, string> = {
  offering_view: 'Vistas de carrera',
  profile_view: 'Vistas de institución',
  whatsapp_click: 'Clics a WhatsApp',
  compare_add: 'Agregados al comparador',
  lead_submit: 'Solicitudes enviadas',
};

const EVENT_ORDER: EventType[] = [
  'offering_view',
  'profile_view',
  'whatsapp_click',
  'compare_add',
  'lead_submit',
];

export default async function AdminStatsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (!hasStatsAccess(params[STATS_TOKEN_PARAM])) notFound();

  const token = String(params[STATS_TOKEN_PARAM]);
  const days = parseRangeDays(params[RANGE_PARAM]);
  const range = toRange(days);

  const [byType, byDay, topInstitutions] = await Promise.all([
    countEventsByType(range),
    countEventsByDay(range),
    countEventsByInstitution(range, 'offering_view'),
  ]);

  const names = await getInstitutionNames(topInstitutions.map((row) => row.institutionId));
  const daily = fillDays(range, byDay);
  const total = byType.reduce((sum, row) => sum + row.events, 0);
  const counts = new Map(byType.map((row) => [row.type, row]));

  const rangeHref = (target: number) =>
    `/admin/stats?${STATS_TOKEN_PARAM}=${encodeURIComponent(token)}&${RANGE_PARAM}=${target}`;

  return (
    <main className="mx-auto w-full max-w-[1000px] px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-xl font-bold">Estadísticas internas</h1>
        <p className="text-muted text-sm">
          Eventos propios de <code className="font-mono">events</code>. Sin datos personales: cada
          fila es un tipo, una carrera o institución, y un hash de sesión que rota cada día y no es
          reversible.
        </p>
        <nav className="flex flex-wrap gap-2" aria-label="Rango">
          {RANGE_DAYS.map((option) => (
            <Link
              key={option}
              href={rangeHref(option)}
              aria-current={option === days ? 'page' : undefined}
              className={
                option === days
                  ? 'border-ink text-ink rounded-md border px-3 py-1.5 text-sm font-medium'
                  : 'border-border text-muted hover:text-ink rounded-md border px-3 py-1.5 text-sm'
              }
            >
              {RANGE_LABELS[option]}
            </Link>
          ))}
        </nav>
      </header>

      {total === 0 ? (
        <section className="border-border bg-surface mt-8 rounded-lg border p-6">
          <h2 className="text-ink text-base font-semibold">Todavía no registramos eventos</h2>
          <p className="text-body mt-2 text-sm">
            No hay ningún evento en este rango. Puede ser porque nadie visitó el sitio todavía, o
            porque el registro se instaló después. No mostramos un cero que parezca una medición.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-ink text-base font-semibold">Por tipo</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EVENT_ORDER.map((type) => {
                const row = counts.get(type);
                return (
                  <div key={type} className="border-border bg-surface rounded-lg border p-4">
                    <p className="text-faint text-xs">{EVENT_LABELS[type]}</p>
                    <p className="text-ink mt-1 font-mono text-xl font-semibold">
                      {formatCount(row?.events ?? 0)}
                    </p>
                    <p className="text-muted mt-0.5 text-xs">
                      {formatCount(row?.sessions ?? 0)} sesiones distintas
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-ink text-base font-semibold">Por día</h2>
            <div className="border-border bg-surface mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-card-alt text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Día</th>
                    <th className="px-4 py-2 text-right font-medium">Eventos</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((row) => (
                    <tr key={row.day} className="border-border border-t">
                      <td className="text-body px-4 py-2 font-mono">{row.day}</td>
                      <td className="text-ink px-4 py-2 text-right font-mono">
                        {formatCount(row.events)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-ink text-base font-semibold">
              Instituciones con más vistas de carrera
            </h2>
            {topInstitutions.length === 0 ? (
              <p className="text-muted mt-3 text-sm">Ninguna vista de carrera en este rango.</p>
            ) : (
              <ol className="border-border bg-surface mt-3 divide-y divide-[var(--color-border)] rounded-lg border">
                {topInstitutions.map((row) => (
                  <li
                    key={row.institutionId}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span className="text-body">
                      {names.get(row.institutionId) ?? `Institución #${row.institutionId}`}
                    </span>
                    <span className="text-ink font-mono">{formatCount(row.events)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('es-PY').format(value);
}
