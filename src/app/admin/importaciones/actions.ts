'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { releaseImportRun, triggerImportJob } from '@/db/queries/admin/imports';
import { cronJob } from '@/lib/cron/registry';
import { currentUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/roles';

/**
 * How long "ejecutar ahora" waits before it stops watching.
 *
 * Under Hostinger's own proxy limit, so the operator gets our sentence rather
 * than a gateway error page. The job keeps running past it either way.
 */
const CRON_TRIGGER_TIMEOUT_MS = 30_000;

export interface ConsoleState {
  error?: string;
  message?: string;
}

function failed(error: unknown): ConsoleState {
  return { error: error instanceof Error ? error.message : 'No se pudo ejecutar.' };
}

/** Start `import:cones`, `import:aneaes` or `curate`. Gated in the query module. */
export async function triggerImportAction(
  _prevState: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const user = await currentUser();
  try {
    const { message } = await triggerImportJob(user, String(formData.get('job') ?? ''));
    revalidatePath('/admin/importaciones');
    return { message };
  } catch (error) {
    return failed(error);
  }
}

/** Close a run whose process is gone, so its source is not locked forever. */
export async function releaseImportRunAction(
  _prevState: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const user = await currentUser();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) return { error: 'Corrida desconocida.' };
  try {
    await releaseImportRun(user, id);
    revalidatePath('/admin/importaciones');
    return { message: `Corrida #${id} cerrada como fallida.` };
  } catch (error) {
    return failed(error);
  }
}

/**
 * "Ejecutar ahora" for a cron job.
 *
 * It calls **the route**, over HTTP, with `CRON_SECRET` in the header — not the
 * job function directly. Two reasons, and the acceptance criterion names the
 * first: the secret is read here, on the server, and never reaches the browser,
 * so the button cannot become a way to learn it. The second is that this way
 * the button exercises the same path hPanel does, header and all: a run that
 * works from this page is evidence the scheduled one will work, which a direct
 * call would not be.
 *
 * The origin comes from the request's own `Host` header rather than an env var,
 * so it works on localhost and behind Hostinger's proxy without configuration.
 * `x-cron-actor` labels the log row with who pressed it; the route authorizes on
 * the secret alone and ignores the actor otherwise.
 */
export async function runCronJobAction(
  _prevState: ConsoleState,
  formData: FormData,
): Promise<ConsoleState> {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch (error) {
    return failed(error);
  }

  const job = String(formData.get('job') ?? '');
  const definition = cronJob(job);
  if (!definition) return { error: 'Ese trabajo no existe.' };
  if (definition.run === null) return { error: definition.detail };

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { error: 'CRON_SECRET no está configurado en este entorno (deployment.md §6).' };
  }

  const incoming = await headers();
  const host = incoming.get('host');
  if (!host) return { error: 'No pudimos resolver la dirección del sitio.' };

  // `x-forwarded-proto` is a list when more than one proxy has touched the
  // request — "https,http" is ordinary behind a chain, and using it verbatim
  // builds `https,http://host/...`, which fails to parse and breaks every
  // trigger with an opaque error (PR-52). The first entry is the client's.
  const forwarded = incoming.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwarded || (host.startsWith('localhost') ? 'http' : 'https');

  try {
    const response = await fetch(`${protocol}://${host}/api/cron/${job}`, {
      headers: { 'x-cron-secret': secret, 'x-cron-actor': String(user!.id) },
      cache: 'no-store',
      // Bounded, because this awaits the whole job over HTTP inside a Server
      // Action. Without it a slow `rebuild-search` runs past the proxy's own
      // limit, the operator sees a generic failure and clicks again — and cron
      // jobs have no `import_runs`-style lock, so the second click is a second
      // concurrent pass (PR-52). The jobs are idempotent, so that is waste
      // rather than corruption, but waste on the one path that deletes.
      signal: AbortSignal.timeout(CRON_TRIGGER_TIMEOUT_MS),
    });
    const body = (await response.json()) as { status?: string; error?: string };
    revalidatePath('/admin/importaciones');

    if (!response.ok || body.status === 'failed') {
      return { error: `${definition.label} falló: ${body.error ?? `HTTP ${response.status}`}` };
    }
    return { message: `${definition.label}: ${body.status ?? 'ok'}.` };
  } catch (error) {
    // A timeout is not a failure of the job: it is still running, server-side,
    // and it will write its own `activity_log` row when it finishes. Saying so
    // is what stops the operator from clicking again.
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return {
        error:
          `${definition.label} sigue corriendo: pasó de ${Math.round(CRON_TRIGGER_TIMEOUT_MS / 1000)} ` +
          `segundos y dejamos de esperarlo. No lo ejecutes de nuevo — mirá el resultado abajo en unos minutos.`,
      };
    }
    return failed(error);
  }
}
