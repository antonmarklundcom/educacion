/**
 * The data-ops console's actions (PR-54, closing PR-50's and PR-51's gap).
 *
 * PR-51 tested the twenty near-identical admin CRUD actions with a scan and two
 * representatives. This file is not one of the twenty: "ejecutar ahora" reads
 * `CRON_SECRET`, builds an origin out of the request's own headers and awaits a
 * whole cron job over HTTP. Three of PR-52's six defects were in that paragraph
 * — the unbounded await, `x-forwarded-proto` used verbatim when it is a list —
 * and none of them had a test, which is why the review had to find them.
 *
 * `architecture.md` §33 is the design; this pins the parts of it a refactor
 * could quietly undo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const triggerImportJob = vi.fn();
const releaseImportRun = vi.fn();
const requireRole = vi.fn();
const dryRunPriceCsv = vi.fn();
const applyPriceCsv = vi.fn();

let sessionUser: unknown = { id: 7, role: 'editor', institutionId: null };
let requestHeaders = new Headers({ host: 'educacion.com.py' });

vi.mock('@/lib/auth/session', () => ({ currentUser: async () => sessionUser }));
vi.mock('@/lib/auth/roles', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));
vi.mock('@/db/queries/admin/imports', () => ({
  triggerImportJob: (...a: unknown[]) => triggerImportJob(...a),
  releaseImportRun: (...a: unknown[]) => releaseImportRun(...a),
}));
vi.mock('@/db/queries/admin/price-import', () => ({
  dryRunPriceCsv: (...a: unknown[]) => dryRunPriceCsv(...a),
  applyPriceCsv: (...a: unknown[]) => applyPriceCsv(...a),
}));

const {
  triggerImportAction,
  releaseImportRunAction,
  runCronJobAction,
  dryRunPriceCsvAction,
  applyPriceCsvAction,
} = await import('./actions');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const EMPTY_REPORT = { rows: [], counts: { create: 0, supersede: 0, error: 0 } };

/** A `File` the way the browser sends one from `<input type="file">`. */
function upload(text: string, name = 'aranceles.csv'): FormData {
  const data = new FormData();
  data.set('file', new File([text], name, { type: 'text/csv' }));
  return data;
}

const okResponse = () =>
  new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  sessionUser = { id: 7, role: 'editor', institutionId: null };
  requestHeaders = new Headers({ host: 'educacion.com.py' });
  triggerImportJob.mockReset().mockResolvedValue({ message: 'Importación iniciada.' });
  releaseImportRun.mockReset().mockResolvedValue(undefined);
  requireRole.mockReset().mockReturnValue(undefined);
  dryRunPriceCsv.mockReset().mockResolvedValue(EMPTY_REPORT);
  applyPriceCsv.mockReset().mockResolvedValue({ ...EMPTY_REPORT, applied: 0 });
  process.env.CRON_SECRET = 'un-secreto';
  vi.stubGlobal('fetch', vi.fn(okResponse));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('triggerImportAction', () => {
  it('hands the session and the raw job name to the query, which owns the gate', () => {
    return triggerImportAction({}, form({ job: 'import:cones' })).then((state) => {
      expect(triggerImportJob).toHaveBeenCalledWith(sessionUser, 'import:cones');
      expect(state.message).toBe('Importación iniciada.');
    });
  });

  it('passes a null session through rather than answering the question itself', async () => {
    sessionUser = null;
    triggerImportJob.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await triggerImportAction({}, form({ job: 'import:cones' }));
    expect(triggerImportJob).toHaveBeenCalledWith(null, 'import:cones');
    expect(state.error).toBe('Iniciá sesión.');
  });

  it('reports a locked source as the query worded it', async () => {
    triggerImportJob.mockRejectedValue(new Error('Ya hay una corrida en curso.'));
    expect((await triggerImportAction({}, form({ job: 'import:cones' }))).error).toBe(
      'Ya hay una corrida en curso.',
    );
  });

  it('does not invent a message when something throws a non-Error', async () => {
    triggerImportJob.mockRejectedValue('boom');
    expect((await triggerImportAction({}, form({ job: 'curate' }))).error).toBe(
      'No se pudo ejecutar.',
    );
  });
});

describe('releaseImportRunAction', () => {
  it.each(['', 'siete', '0', '-3', '1.5'])(
    'refuses the run id %o before the query runs',
    async (id) => {
      const state = await releaseImportRunAction({}, form({ id }));
      expect(state.error).toBe('Corrida desconocida.');
      expect(releaseImportRun).not.toHaveBeenCalled();
    },
  );

  it('releases a real run and names it back', async () => {
    const state = await releaseImportRunAction({}, form({ id: '42' }));
    expect(releaseImportRun).toHaveBeenCalledWith(sessionUser, 42);
    expect(state.message).toContain('#42');
  });
});

describe('runCronJobAction', () => {
  it('refuses before reading the secret when the role check throws', async () => {
    requireRole.mockImplementation(() => {
      throw new Error('No tenés permiso para esto.');
    });
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(state.error).toBe('No tenés permiso para esto.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a job that is not in the registry', async () => {
    const state = await runCronJobAction({}, form({ job: 'drop-tables' }));
    expect(state.error).toBe('Ese trabajo no existe.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a registered job that has nothing to run, with its own detail', async () => {
    const state = await runCronJobAction({}, form({ job: 'sitemap' }));
    expect(state.error).toBe('No hay nada que regenerar.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says which variable is missing rather than failing at the route', async () => {
    delete process.env.CRON_SECRET;
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(state.error).toContain('CRON_SECRET');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses when the request carries no Host to call back into', async () => {
    requestHeaders = new Headers();
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(state.error).toContain('dirección del sitio');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the secret in the header and never puts it in the answer', async () => {
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init!.headers as Record<string, string>)['x-cron-secret']).toBe('un-secreto');
    expect((init!.headers as Record<string, string>)['x-cron-actor']).toBe('7');
    expect(JSON.stringify(state)).not.toContain('un-secreto');
  });

  // PR-52's defect: `x-forwarded-proto` is a list behind a proxy chain, and
  // using it verbatim builds `https,http://host/...`, which fails to parse.
  it('takes the first entry when x-forwarded-proto is a list', async () => {
    requestHeaders = new Headers({
      host: 'educacion.com.py',
      'x-forwarded-proto': 'https,http',
    });
    await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(
      'https://educacion.com.py/api/cron/rebuild-search',
    );
  });

  it('trims whitespace around the entry a proxy left behind', async () => {
    requestHeaders = new Headers({
      host: 'educacion.com.py',
      'x-forwarded-proto': ' https , http ',
    });
    await runCronJobAction({}, form({ job: 'admissions' }));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://educacion.com.py/api/cron/admissions');
  });

  it('falls back to http on localhost and https anywhere else', async () => {
    requestHeaders = new Headers({ host: 'localhost:3000' });
    await runCronJobAction({}, form({ job: 'admissions' }));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('http://localhost:3000/api/cron/admissions');

    vi.mocked(fetch).mockClear();
    requestHeaders = new Headers({ host: 'educacion.com.py' });
    await runCronJobAction({}, form({ job: 'admissions' }));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://educacion.com.py/api/cron/admissions');
  });

  it('bounds the wait, so a slow job cannot outlive the proxy silently', async () => {
    await runCronJobAction({}, form({ job: 'rebuild-search' }));
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(init!.cache).toBe('no-store');
  });

  // The timeout message exists to stop a second click: cron jobs have no lock,
  // so a re-run is a second concurrent pass over the one path that deletes.
  it('tells the operator a timed-out job is still running and not to re-run it', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('The operation was aborted', 'TimeoutError'),
    );
    const state = await runCronJobAction({}, form({ job: 'purge-leads' }));
    expect(state.error).toContain('sigue corriendo');
    expect(state.error).toContain('No lo ejecutes de nuevo');
  });

  it('reports a failing route with the route’s own error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'failed', error: 'sin DATABASE_URL' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(state.error).toContain('sin DATABASE_URL');
  });

  it('reports a non-2xx with its status when the body says nothing', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(state.error).toContain('503');
  });

  it('reports success with the job’s label', async () => {
    const state = await runCronJobAction({}, form({ job: 'rebuild-search' }));
    expect(state.message).toContain('Reconstrucción del índice de búsqueda');
  });
});

/* -------------------------------------------------------------------------- */
/* PR-61 — the arancel CSV actions                                            */
/* -------------------------------------------------------------------------- */

describe('the arancel CSV actions', () => {
  it('hands the session and the file text to the dry run, which owns the gate', async () => {
    const state = await dryRunPriceCsvAction({}, upload('institution_slug\nuna'));
    expect(dryRunPriceCsv).toHaveBeenCalledWith(sessionUser, 'institution_slug\nuna');
    expect(state.report).toEqual(EMPTY_REPORT);
  });

  it('refuses a submission with no file', async () => {
    const state = await dryRunPriceCsvAction({}, new FormData());
    expect(state.error).toContain('Elegí un archivo');
    expect(dryRunPriceCsv).not.toHaveBeenCalled();
  });

  /**
   * A Server Action is a POST endpoint with a generated URL. Reading half a
   * megabyte per request for a caller we are about to refuse is work anybody
   * who finds that URL can ask for.
   */
  it('checks the role before it reads a byte of the upload', async () => {
    requireRole.mockImplementation(() => {
      throw new Error('No tenés permiso para esto.');
    });
    const state = await applyPriceCsvAction({}, upload('lo que sea'));
    expect(state.error).toBe('No tenés permiso para esto.');
    expect(applyPriceCsv).not.toHaveBeenCalled();
  });

  it('refuses a file over the size cap without reading it', async () => {
    const state = await dryRunPriceCsvAction({}, upload('x'.repeat(512 * 1024 + 1)));
    expect(state.error).toContain('512 KB');
    expect(dryRunPriceCsv).not.toHaveBeenCalled();
  });

  it('reports an unreadable file as the query worded it, and shows no table', async () => {
    dryRunPriceCsv.mockResolvedValue({ ...EMPTY_REPORT, error: 'El encabezado no coincide.' });
    const state = await dryRunPriceCsvAction({}, upload('mal,encabezado'));
    expect(state.error).toBe('El encabezado no coincide.');
    expect(state.report).toBeUndefined();
  });

  it('re-reads the uploaded file on apply rather than trusting the previous report', async () => {
    const previous = { report: { rows: [{ line: 2 }], counts: EMPTY_REPORT.counts } } as never;
    await applyPriceCsvAction(previous, upload('contenido nuevo'));
    expect(applyPriceCsv).toHaveBeenCalledWith(sessionUser, 'contenido nuevo');
  });

  it('summarises what was actually written, partial failures included', async () => {
    applyPriceCsv.mockResolvedValue({
      rows: [],
      counts: { create: 1, supersede: 0, error: 2 },
      applied: 1,
    });
    const state = await applyPriceCsvAction({}, upload('filas'));
    expect(state.message).toContain('Importamos 1 arancel');
    expect(state.message).toContain('dejamos 2 sin importar');
  });
});
