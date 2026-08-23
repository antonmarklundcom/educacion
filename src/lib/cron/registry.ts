/**
 * Every `/api/cron/[job]` job, once (PR-50).
 *
 * Before this the route was a `switch` and the only list of jobs a human could
 * read was `deployment.md` §7. `/admin/importaciones` needs the same list — its
 * labels, its cadence and its "run now" button — and building a second one
 * beside the route is how the console ends up offering a job the route does not
 * have, or missing one it does. So the switch became a lookup in this table and
 * the console renders the same table. `registry.test.ts` holds the two of them
 * together.
 *
 * ### `run` is the job, `null` is an honest absence
 *
 * `sitemap` has no `run`: the sitemap index and its children are route handlers
 * generated per request (PR-40), so there is nothing to regenerate. It stays in
 * the table with `note` rather than disappearing, because an operator who reads
 * `architecture.md` §10 will look for it and deserves the answer on the screen
 * rather than a 404.
 *
 * ### Cadence is documentation, not a scheduler
 *
 * `cadence` is what hPanel is configured to do (`deployment.md` §7), written
 * down so the console can say "diario 06:00" beside a job whose last run was
 * three days ago. Nothing here schedules anything — Hostinger's cron does, and
 * this table cannot know whether somebody actually created the entry. That is
 * exactly why the console shows the **last observed run** next to the cadence:
 * the gap between them is the finding.
 */

import { runRenewalReminders, runSubscriptionSweep } from '@/lib/billing/jobs';
import {
  runAdmissionsRefresh,
  runLeadPurge,
  runSearchRebuild,
  runStalenessDigest,
} from '@/lib/freshness/jobs';
import { sendLeadDigests } from '@/lib/leads/digest';
import { retryLeadDelivery } from '@/lib/leads/retry';

export interface CronJobDefinition {
  job: string;
  /** Spanish, for `/admin/importaciones`. */
  label: string;
  /** What it does, in one sentence an operator can act on. */
  detail: string;
  /** What `deployment.md` §7 says hPanel is set to. */
  cadence: string;
  /**
   * The job itself. Null means there is nothing to run — see `note`.
   *
   * `Promise<object>` and not `Promise<Record<string, unknown>>`: half these
   * jobs return a declared `interface`, which TypeScript does not give an
   * implicit index signature, so the stricter type would reject the real
   * functions and invite an `as` at every call site.
   */
  run: (() => Promise<object>) | null;
  /** Why `run` is null. Set exactly when it is. */
  note?: string;
  /** The one job that deletes (`risks.md` §R-06). Rendered as a warning. */
  destructive?: boolean;
}

export const CRON_JOBS: readonly CronJobDefinition[] = [
  {
    job: 'lead-retry',
    label: 'Reintento de envío de solicitudes',
    detail: 'Reenvía a la institución las solicitudes cuyo correo no salió la primera vez.',
    cadence: 'Cada hora',
    run: retryLeadDelivery,
  },
  {
    job: 'lead-digest',
    label: 'Resumen diario de solicitudes',
    detail: 'Un correo por institución con las solicitudes que siguen sin responder.',
    cadence: 'Diario 08:00',
    run: sendLeadDigests,
  },
  {
    job: 'subscription-sweep',
    label: 'Barrido de suscripciones vencidas',
    detail: 'Marca como past_due las suscripciones activas cuyo período terminó.',
    cadence: 'Diario 06:00',
    run: runSubscriptionSweep,
  },
  {
    job: 'renewal-reminders',
    label: 'Avisos de renovación',
    detail: 'Un resumen al operador con las renovaciones a 90, 30 y 7 días.',
    cadence: 'Diario 06:15',
    run: runRenewalReminders,
  },
  {
    job: 'rebuild-search',
    label: 'Reconstrucción del índice de búsqueda',
    detail: 'Rearma program_search desde las tablas curadas.',
    cadence: 'Nocturno 03:00',
    run: runSearchRebuild,
  },
  {
    job: 'admissions',
    label: 'Estado de convocatorias',
    detail: 'Abre y cierra convocatorias según sus fechas.',
    cadence: 'Diario 05:00',
    run: runAdmissionsRefresh,
  },
  {
    job: 'staleness',
    label: 'Escaneo de datos vencidos',
    detail: 'Arma el digest de aranceles y acreditaciones sin verificar.',
    cadence: 'Semanal, lunes',
    run: runStalenessDigest,
  },
  {
    job: 'purge-leads',
    label: 'Purga de solicitudes',
    detail:
      'Borra las solicitudes de más de 24 meses, que es lo que promete /legal/privacidad. Es el único job que borra.',
    cadence: 'Semanal',
    run: runLeadPurge,
    destructive: true,
  },
  {
    job: 'sitemap',
    label: 'Sitemap',
    detail: 'No hay nada que regenerar.',
    cadence: 'No necesita cron',
    run: null,
    note: 'sitemap.xml is generated per request; no cron required.',
  },
] as const;

const BY_JOB = new Map(CRON_JOBS.map((definition) => [definition.job, definition]));

export function cronJob(job: string): CronJobDefinition | undefined {
  return BY_JOB.get(job);
}

/** The jobs the console offers a "run now" button for. */
export function runnableCronJobs(): CronJobDefinition[] {
  return CRON_JOBS.filter((definition) => definition.run !== null);
}
