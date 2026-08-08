/**
 * The CONES crawl.
 *
 * What is worth testing here is not the parsing — `parsers.test.ts` owns that —
 * but the shape of the walk: that pagination is followed to the end of a
 * listing, that each institution's own page is fetched (that is where the
 * carreras live, and a single-URL fetch got one page of five), that the
 * politeness bounds actually bound, and that a page which parses to nothing
 * says so instead of being averaged into a plausible total.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetRateLimiter } from './http';
import { collectAneaes, collectCones } from './sources';

const PAGE_ONE = `
<div class="dc-grid">
  <div class="dc-card">
    <div class="dc-card-body">
      <h3><a href="/institucion-de-prueba-a/">INSTITUCION DE PRUEBA A</a></h3>
      <p>Ciudad: Ciudad de Prueba</p>
    </div>
  </div>
</div>
<div class="dc-pagination">
  <a class="page-numbers" href="https://cones.test/universidades/page/2/">2</a>
</div>
`;

const PAGE_TWO = `
<div class="dc-grid">
  <div class="dc-card">
    <div class="dc-card-body">
      <h3><a href="/institucion-de-prueba-b/">INSTITUCION DE PRUEBA B</a></h3>
      <p>Ciudad: Ciudad de Prueba</p>
    </div>
  </div>
</div>
`;

const carrerasFor = (institution: string, carrera: string) => `
<table>
  <tr><th>Carrera/Programa</th><th>Tipo</th><th>IES</th></tr>
  <tr><td>${carrera}</td><td>Grado</td><td>${institution}</td></tr>
</table>
`;

const PAGES: Record<string, string> = {
  'https://cones.test/universidades/': PAGE_ONE,
  'https://cones.test/universidades/page/2/': PAGE_TWO,
  'https://cones.test/institucion-de-prueba-a/': carrerasFor(
    'INSTITUCION DE PRUEBA A',
    'Carrera de Prueba Uno',
  ),
  'https://cones.test/institucion-de-prueba-b/': carrerasFor(
    'INSTITUCION DE PRUEBA B',
    'Carrera de Prueba Dos',
  ),
};

function fakeFetch(pages: Record<string, string> = PAGES) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      url,
      text: async () => pages[url] ?? '<html><body>Mantenimiento</body></html>',
    } as Response;
  });
}

const START = ['https://cones.test/universidades/'];

beforeEach(() => __resetRateLimiter());

const fetchOptions = (fetchImpl: ReturnType<typeof fakeFetch>) => ({
  delayMs: 0,
  sleepImpl: async () => {},
  fetchImpl,
});

describe('collectCones', () => {
  it('walks pagination and follows each card to the institution page', async () => {
    const fetchImpl = fakeFetch();
    const records = await collectCones({ urls: START, fetchOptions: fetchOptions(fetchImpl) });

    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://cones.test/universidades/',
      'https://cones.test/universidades/page/2/',
      'https://cones.test/institucion-de-prueba-a/',
      'https://cones.test/institucion-de-prueba-b/',
    ]);

    expect(records.filter((r) => r.payload.kind === 'institution')).toHaveLength(2);
    expect(records.filter((r) => r.payload.kind === 'program')).toHaveLength(2);
  });

  it('fetches no page twice', async () => {
    const fetchImpl = fakeFetch({
      ...PAGES,
      // Page 2 links back to page 1, as a real paginator does.
      'https://cones.test/universidades/page/2/':
        PAGE_TWO +
        '<a class="page-numbers" href="https://cones.test/universidades/">1</a>' +
        '<a class="page-numbers" href="https://cones.test/universidades/page/2/">2</a>',
    });

    await collectCones({ urls: START, fetchOptions: fetchOptions(fetchImpl) });
    const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('stops at the institution bound — the cheap probe run', async () => {
    const fetchImpl = fakeFetch();
    await collectCones({
      urls: START,
      maxInstitutionPages: 1,
      fetchOptions: fetchOptions(fetchImpl),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // two listings, one institution
  });

  it('can skip the institution pages entirely', async () => {
    const fetchImpl = fakeFetch();
    const records = await collectCones({
      urls: START,
      followInstitutions: false,
      fetchOptions: fetchOptions(fetchImpl),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(records.every((r) => r.payload.kind === 'institution')).toBe(true);
  });

  it('stops at the listing bound rather than crawling on', async () => {
    const fetchImpl = fakeFetch();
    const messages: string[] = [];
    await collectCones({
      urls: START,
      maxListingPages: 1,
      followInstitutions: false,
      fetchOptions: fetchOptions(fetchImpl),
      onProgress: (message) => messages.push(message),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(messages.join('\n')).toContain('still queued');
  });

  it('names a page that fetched fine and parsed to nothing', async () => {
    const fetchImpl = fakeFetch({ 'https://cones.test/universidades/': PAGE_ONE });
    const messages: string[] = [];
    await collectCones({
      urls: START,
      fetchOptions: fetchOptions(fetchImpl),
      onProgress: (message) => messages.push(message),
    });

    const log = messages.join('\n');
    expect(log).toContain('0 records from https://cones.test/institucion-de-prueba-a/');
    expect(log).toContain('parsed nothing');
    // Every institution page came back empty: that is a markup change, not luck.
    expect(log).toContain('WARNING');
  });

  it('parses only the file it is given, and paginates nowhere', async () => {
    const fetchImpl = fakeFetch();
    const records = await collectCones({
      files: [{ path: '/tmp/universidades.html', body: PAGE_ONE }],
      fetchOptions: fetchOptions(fetchImpl),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
  });
});

describe('collectAneaes', () => {
  it('refuses to report a plausible zero when it has no source to read', async () => {
    await expect(collectAneaes()).rejects.toThrow(/no machine-readable source/i);
  });

  it('refuses a PDF rather than feeding it to the HTML reader', async () => {
    await expect(
      collectAneaes({ files: [{ path: '/tmp/listado.pdf', body: '%PDF-1.7 …' }] }),
    ).rejects.toThrow(/does not parse PDFs/i);
  });
});
