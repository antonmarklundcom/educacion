import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ConsoleActionForm } from '@/components/admin/ConsoleActionForm';
import { Badge } from '@/components/ui';
import { lastCronRuns, type CronRunRecord } from '@/db/queries/admin/cron';
import {
  IMPORT_JOBS,
  STUCK_AFTER_MINUTES,
  importsOverview,
  isStuck,
  type ImportRunRow,
} from '@/db/queries/admin/imports';
import { CRON_JOBS } from '@/lib/cron/registry';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';

import { releaseImportRunAction, runCronJobAction, triggerImportAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const RUN_TONE = {
  running: 'info',
  succeeded: 'ok',
  failed: 'danger',
} as const;

const RUN_LABEL = {
  running: 'En curso',
  succeeded: 'Terminó',
  failed: 'Falló',
} as const;

/** "hace 3 minutos" / "hace 2 días" — enough precision for a job console. */
function ago(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return `hace ${Math.floor(hours / 24)} días`;
}

function CronRun({ run, now }: { run: CronRunRecord | undefined; now: Date }) {
  if (!run) {
    return (
      <span className="text-muted text-sm">Nunca corrió, o corrió antes de este registro.</span>
    );
  }
  const tone = run.outcome === 'ok' ? 'ok' : run.outcome === 'failed' ? 'danger' : 'neutral';
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={tone}>{run.outcome === 'ok' ? 'ok' : run.outcome}</Badge>
      <span className="text-body">
        {ago(run.at, now)} · {formatDate(run.at)}
      </span>
      <span className="text-muted">{run.userId === null ? 'cron' : 'a mano'}</span>
      {run.result && (
        <code className="text-muted text-xs">{JSON.stringify(run.result).slice(0, 120)}</code>
      )}
    </span>
  );
}

function RunRow({ run, now }: { run: ImportRunRow; now: Date }) {
  const stuck = isStuck(run, now);
  return (
    <li className="border-border bg-surface flex flex-wrap items-start justify-between gap-3 rounded-md border px-4 py-3">
      <span className="min-w-0">
        <span className="text-ink block text-sm font-medium">
          #{run.id} · {run.source}
        </span>
        <span className="text-muted block text-sm">
          {formatDate(run.startedAt)} · {ago(run.startedAt, now)} · {run.rowsIn} filas,{' '}
          {run.rowsNew} nuevas, {run.rowsUnchanged} sin cambios
          {run.rowsConflicted > 0 && `, ${run.rowsConflicted} a moderación`}
        </span>
        {run.log && <span className="text-muted block text-xs">{run.log}</span>}
      </span>
      <span className="flex flex-col items-end gap-2">
        <Badge tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</Badge>
        {stuck && (
          <ConsoleActionForm
            action={releaseImportRunAction}
            fields={{ id: String(run.id) }}
            label="Cerrar corrida colgada"
            pendingLabel="Cerrando…"
            variant="secondary"
          />
        )}
      </span>
    </li>
  );
}

/**
 * The data-operations console (PR-50).
 *
 * `plan.md` §6 calls arancel and registry collection the real bottleneck of
 * this project. It stayed a bottleneck partly for a boring reason: every import
 * ran from a shell with `DATABASE_URL` exported by hand, which is fine for the
 * person who wrote the scripts and impossible for anybody else. This page is
 * that same work with a button on it — the *same* entry functions, never a
 * second import path (the PR-20 rule).
 *
 * The cron half is deliberately read-only apart from "ejecutar ahora": nothing
 * here schedules anything, because hPanel does, and this page cannot know
 * whether the entry was ever created. What it can show is the last run we
 * actually observed next to the cadence we believe is configured — and the gap
 * between those two is the finding.
 */
export default async function ImportsConsolePage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const now = new Date();
  const [overview, cronRuns] = await Promise.all([importsOverview(user, now), lastCronRuns()]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Importaciones y trabajos</h1>
        <p className="text-muted max-w-prose text-sm">
          Los mismos comandos que corren en la terminal, con un botón. Importar escribe solo en la
          capa cruda; curar es lo que toca el catálogo, y nada con conflicto se publica solo — queda
          en moderación.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-sm font-semibold">Ejecutar</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {IMPORT_JOBS.map((job) => {
            const blocked = job.sources.filter((source) => overview.lockedSources.includes(source));
            return (
              <div
                key={job.job}
                className="border-border bg-surface flex flex-col gap-3 rounded-md border p-4"
              >
                <div>
                  <h3 className="text-ink text-sm font-semibold">{job.label}</h3>
                  <p className="text-muted text-xs">{job.detail}</p>
                </div>
                <ConsoleActionForm
                  action={triggerImportAction}
                  fields={{ job: job.job }}
                  label={job.label}
                  pendingLabel="Arrancando…"
                  disabled={blocked.length > 0}
                  disabledNote={`Hay una corrida de ${blocked.join(', ')} en curso.`}
                />
              </div>
            );
          })}
        </div>
        <p className="text-faint max-w-prose text-xs">
          Una importación completa del CONES son unas 65 peticiones y tarda minutos. El botón
          arranca la corrida y vuelve enseguida: el avance se ve abajo, en las corridas. Mientras
          una fuente tiene una corrida abierta no se puede arrancar otra de la misma fuente.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-ink text-sm font-semibold">Corridas</h2>
          <p className="text-muted text-xs">
            {overview.rowsLast24h} filas nuevas en las últimas 24 horas.
          </p>
        </div>
        {overview.runs.length === 0 ? (
          <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
            Todavía no corrió ninguna importación.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.runs.map((run) => (
              <RunRow key={run.id} run={run} now={now} />
            ))}
          </ul>
        )}
        <p className="text-faint max-w-prose text-xs">
          Una corrida que lleva más de {STUCK_AFTER_MINUTES} minutos abierta probablemente perdió su
          proceso —un reinicio del contenedor, por ejemplo—. Cerrarla a mano libera la fuente; no
          cancela nada, porque ya no hay nada corriendo.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-sm font-semibold">Trabajos programados</h2>
        <p className="text-muted max-w-prose text-sm">
          Los programa el cron de hPanel, no esta pantalla. Acá se ve la última corrida que
          registramos de cada uno: si dice “nunca corrió” y la cadencia es diaria, falta la entrada
          en hPanel.
        </p>
        <ul className="flex flex-col gap-2">
          {CRON_JOBS.map((definition) => (
            <li
              key={definition.job}
              className={`bg-surface flex flex-wrap items-start justify-between gap-3 rounded-md border px-4 py-3 ${
                definition.destructive ? 'border-warn/40' : 'border-border'
              }`}
            >
              <span className="min-w-0">
                <span className="text-ink block text-sm font-medium">
                  {definition.label}{' '}
                  <code className="text-muted text-xs">/api/cron/{definition.job}</code>
                </span>
                <span className="text-muted block text-sm">{definition.detail}</span>
                <span className="text-faint block text-xs">Cadencia: {definition.cadence}</span>
                <CronRun run={cronRuns.get(definition.job)} now={now} />
              </span>
              {definition.run !== null && (
                <ConsoleActionForm
                  action={runCronJobAction}
                  fields={{ job: definition.job }}
                  label="Ejecutar ahora"
                  pendingLabel="Ejecutando…"
                  variant="secondary"
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
