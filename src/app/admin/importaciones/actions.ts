'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { releaseImportRun, triggerImportJob } from '@/db/queries/admin/imports';
import { cronJob } from '@/lib/cron/registry';
import { currentUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/roles';

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
  const protocol =
    incoming.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  try {
    const response = await fetch(`${protocol}://${host}/api/cron/${job}`, {
      headers: { 'x-cron-secret': secret, 'x-cron-actor': String(user!.id) },
      cache: 'no-store',
    });
    const body = (await response.json()) as { status?: string; error?: string };
    revalidatePath('/admin/importaciones');

    if (!response.ok || body.status === 'failed') {
      return { error: `${definition.label} falló: ${body.error ?? `HTTP ${response.status}`}` };
    }
    return { message: `${definition.label}: ${body.status ?? 'ok'}.` };
  } catch (error) {
    return failed(error);
  }
}
