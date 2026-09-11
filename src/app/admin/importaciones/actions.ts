'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { applyPriceCsv, dryRunPriceCsv } from '@/db/queries/admin/price-import';
import { releaseImportRun, triggerImportJob } from '@/db/queries/admin/imports';
import { MAX_IMPORT_BYTES } from '@/lib/admin/price-csv';
import { adminImportCopy } from '@/lib/copy/admin-import';
import type { PriceImportState } from '@/components/admin/PriceCsvImportForm';
import { cronJob } from '@/lib/cron/registry';
import { currentUser } from '@/lib/auth/session';
// Kept as a separate line: `actions.test.ts`'s structural scan asserts this
// file reads the session from `currentUser()` by matching that import verbatim,
// and folding a type into it makes the check silently stop matching.
import type { SessionUser } from '@/lib/auth/session';
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

/* -------------------------------------------------------------------------- */
/* Arancel CSV import (PR-61)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Read the uploaded file, or say why not.
 *
 * The size cap is checked on the `File` itself, before anything reads it into a
 * string: a 40 MB upload should cost one `size` comparison, not 40 MB of memory
 * on a shared host.
 *
 * The role is checked *before* that, even though both query functions check it
 * again and those checks are the ones that matter (CLAUDE.md rule 4: security is
 * server-side, in the module that writes). The point of the early check is
 * narrower — a Server Action is a POST endpoint with a generated URL, and
 * without it anyone who finds that URL can make the server read half a megabyte
 * per request before being told no.
 */
async function readUpload(
  actor: SessionUser | null | undefined,
  formData: FormData,
): Promise<{ text?: string; error?: string }> {
  try {
    requireRole(actor, ['editor']);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No tenés permiso para esto.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: adminImportCopy.noFile };
  if (file.size > MAX_IMPORT_BYTES) return { error: adminImportCopy.tooLarge };
  return { text: await file.text() };
}

function priceImportFailure(error: unknown): PriceImportState {
  return { error: error instanceof Error ? error.message : 'No se pudo leer el archivo.' };
}

/** Verdict per row. Writes nothing, ever. */
export async function dryRunPriceCsvAction(
  _prevState: PriceImportState,
  formData: FormData,
): Promise<PriceImportState> {
  const user = await currentUser();
  const upload = await readUpload(user, formData);
  if (upload.error) return { error: upload.error };

  try {
    const report = await dryRunPriceCsv(user, upload.text!);
    return report.error ? { error: report.error } : { report };
  } catch (error) {
    return priceImportFailure(error);
  }
}

/**
 * Write the importable rows.
 *
 * It re-reads the uploaded file rather than trusting the dry run's report back
 * from the browser — a report that round-tripped through a client is an input,
 * and an input that says "write price X to offering Y" is the last thing this
 * action should take on faith.
 */
export async function applyPriceCsvAction(
  _prevState: PriceImportState,
  formData: FormData,
): Promise<PriceImportState> {
  const user = await currentUser();
  const upload = await readUpload(user, formData);
  if (upload.error) return { error: upload.error };

  try {
    const report = await applyPriceCsv(user, upload.text!);
    if (report.error) return { error: report.error };
    revalidatePath('/admin/aranceles');
    revalidatePath('/admin/importaciones');
    return {
      report,
      message: adminImportCopy.appliedMessage(report.applied ?? 0, report.counts.error),
    };
  } catch (error) {
    return priceImportFailure(error);
  }
}
