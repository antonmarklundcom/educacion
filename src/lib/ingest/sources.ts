/**
 * Where each source lives and how a document becomes raw records.
 *
 * Split from the parsers so that URLs — the thing that rots fastest — sit in
 * one place a human can edit without reading any parsing code.
 *
 * **Both sources support a local-file input, and that is not a test
 * convenience.** `docs/data-sources.md` §1 records that these servers 403
 * whole networks; the same is true of the environment this was written in. The
 * documented operating procedure is therefore: save the register page or the
 * export by hand, then run the importer against the file. The network path is
 * the optimization, the file path is the guarantee.
 */

import { configuredDelayMs, politeFetchText, type FetchOptions } from './http';
import {
  conesPaginationLinks,
  dedupeByChecksum,
  parseConesInstitutions,
  parseConesPrograms,
  parseConesRegister,
  type ConesPayload,
} from './parsers/cones';
import { parseAneaesCsv, parseAneaesHtml, type AneaesPayload } from './parsers/aneaes';
import type { RawRecord } from './contract';

/**
 * Entry points for the CONES register. Verify these against the live site
 * before a run — government sites reorganize without redirects, and this one
 * already did: `/universidades-habilitadas/` and `/carreras-habilitadas/` are
 * both 404 as of Aug 2026.
 *
 *  - `/universidades/` is the institution directory: a card grid, 12 per page,
 *    5 pages, 59 institutions. The site root is timeout-prone; this path is
 *    not, so start here rather than at `/`.
 *  - `/category/ofertas-academicas/` is the carreras archive. Each
 *    institution's carreras also live on its own page, which the crawl reaches
 *    by following the directory cards — that route is preferred because it
 *    attributes every table to a known institution.
 */
export const CONES_URLS = [
  'https://cones.gov.py/universidades/',
  'https://cones.gov.py/category/ofertas-academicas/',
] as const;

/**
 * Crawl bounds. These are politeness limits, not correctness limits: hitting
 * one means the site grew, and the number gets raised deliberately by a human
 * who then watches the run.
 */
export const CONES_MAX_LISTING_PAGES = 30;
export const CONES_MAX_INSTITUTION_PAGES = 120;

/**
 * ANEAES.
 *
 * The old CSV URL is gone: the datos.gov.py dataset was last modified in
 * 2019-10 and its resource now points at `apiV1` rather than a file, and the
 * URL that used to serve the export returns zero rows. What ANEAES publishes
 * today is a PDF, which **this pipeline deliberately does not parse** — see
 * `docs/data-sources.md` §1.1 for why, and what it would take to change that.
 *
 * `apiV1` is unverified: every request to `aneaes.gov.py` from the environments
 * available here is refused before it reaches the host, so nobody has yet seen
 * what it returns. It is recorded so the next person with a reachable network
 * checks it rather than rediscovering the question.
 */
export const ANEAES_URLS = {
  /** Unverified — probe before building anything on it. */
  apiV1: 'https://www.aneaes.gov.py/acreditation/api/v1/',
  /** Verified reachable, 12 pages, "Año 2024". Not machine-read; not parsed. */
  accreditationsPdf:
    'https://www.aneaes.gov.py/wp-content/uploads/2024/12/Listado_de_acreditaciones_2024.pdf',
  /** Stale (published 2019-08, modified 2019-10). Kept for provenance only. */
  datosGovPyDataset:
    'https://www.datos.gov.py/dataset/carreras-de-grado-acreditadas-modelo-nacional',
} as const;

export interface SourceInput {
  /** Local file contents, when the operator saved the document by hand. */
  files?: Array<{ path: string; body: string }>;
  /** URLs to fetch. Defaults to the constants above. */
  urls?: readonly string[];
  fetchOptions?: FetchOptions;
  onProgress?: (message: string) => void;
}

export interface ConesInput extends SourceInput {
  /** Follow `page/N/` links to the end of a listing. Default true. */
  followPagination?: boolean;
  /**
   * Follow each institution card to its own page, which is where its carreras
   * table lives. Default true — without it a network run captures institutions
   * and almost no programs.
   */
  followInstitutions?: boolean;
  maxListingPages?: number;
  maxInstitutionPages?: number;
}

function looksLikeCsv(body: string, path: string): boolean {
  if (/\.csv$/i.test(path)) return true;
  const head = body.slice(0, 2_000).trimStart();
  return !head.startsWith('<') && /[,;\t].*[\r\n]/.test(head);
}

/**
 * CONES habilitación register → raw records.
 *
 * The crawl is three shallow passes, all rate-limited by `politeFetchText`'s
 * per-host queue at `IMPORT_RATE_LIMIT_MS`:
 *
 *   1. the start URLs;
 *   2. every further page of a listing they paginate into (`page/N/`);
 *   3. every institution page the directory cards link to — each carrying that
 *      institution's carreras table.
 *
 * ~60 institutions at one request every 2 s is a couple of minutes. That is the
 * intended pace (§7): one polite pass a month is the whole budget.
 */
export async function collectCones(input: ConesInput = {}): Promise<RawRecord<ConesPayload>[]> {
  const {
    files = [],
    urls = CONES_URLS,
    fetchOptions,
    onProgress,
    followPagination = true,
    followInstitutions = true,
    maxListingPages = CONES_MAX_LISTING_PAGES,
    maxInstitutionPages = CONES_MAX_INSTITUTION_PAGES,
  } = input;

  const records: RawRecord<ConesPayload>[] = [];

  for (const file of files) {
    onProgress?.(`Parsing ${file.path}`);
    records.push(...parseConesRegister(file.body, { sourceUrl: file.path }));
  }

  if (files.length > 0) return dedupeByChecksum(records);

  const options: FetchOptions = {
    ...fetchOptions,
    delayMs: configuredDelayMs(fetchOptions?.delayMs),
    onProgress,
  };

  const visited = new Set<string>();
  const queue = [...urls];
  /** institution page URL → the name the card gave it, for row attribution. */
  const institutionPages = new Map<string, string>();
  let listingPages = 0;

  while (queue.length > 0 && listingPages < maxListingPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    listingPages += 1;

    const { body, url: finalUrl } = await politeFetchText(url, options);
    records.push(...parseConesRegister(body, { sourceUrl: finalUrl }));

    for (const record of parseConesInstitutions(body, { sourceUrl: finalUrl })) {
      const detailUrl = record.payload.detailUrl;
      if (detailUrl) institutionPages.set(detailUrl, record.payload.institutionName);
    }

    if (followPagination) {
      for (const next of conesPaginationLinks(body, finalUrl)) {
        if (!visited.has(next)) queue.push(next);
      }
    }
  }

  if (queue.length > 0) {
    onProgress?.(
      `Stopped after ${listingPages} listing pages with ${queue.length} still queued — ` +
        'raise maxListingPages if the register really has grown this much.',
    );
  }

  if (followInstitutions) {
    const pages = [...institutionPages].filter(([url]) => !visited.has(url));
    if (pages.length > maxInstitutionPages) {
      onProgress?.(
        `${pages.length} institution pages found, fetching the first ${maxInstitutionPages}.`,
      );
    }

    for (const [url, institutionName] of pages.slice(0, maxInstitutionPages)) {
      visited.add(url);
      const { body, url: finalUrl } = await politeFetchText(url, options);
      records.push(
        ...parseConesPrograms(body, {
          sourceUrl: finalUrl,
          pageInstitutionName: institutionName,
        }),
      );
    }
  }

  return dedupeByChecksum(records);
}

/**
 * ANEAES accredited programs → raw records.
 *
 * There is no working network default. The CSV that `ANEAES_URLS` used to
 * point at is gone (§1.1), and the PDF that replaced it is not parsed here on
 * purpose. So a run without `--file` or `--url` says so plainly instead of
 * fetching a dead URL and reporting a truthful-looking zero.
 */
export async function collectAneaes(input: SourceInput = {}): Promise<RawRecord<AneaesPayload>[]> {
  const { files = [], urls, fetchOptions, onProgress } = input;
  const records: RawRecord<AneaesPayload>[] = [];

  for (const file of files) {
    onProgress?.(`Parsing ${file.path}`);
    records.push(...parseAneaesDocument(file.body, file.path));
  }

  if (files.length > 0) return records;

  if (!urls || urls.length === 0) {
    throw new Error(
      'ANEAES has no machine-readable source right now (docs/data-sources.md §1.1): the ' +
        'datos.gov.py CSV is dead and the 2024 listing is a PDF this pipeline does not parse. ' +
        'Pass --file with a CSV/HTML export, or --url once a structured endpoint is verified.',
    );
  }

  const options: FetchOptions = {
    ...fetchOptions,
    delayMs: configuredDelayMs(fetchOptions?.delayMs),
    onProgress,
  };

  for (const url of urls) {
    const { body, url: finalUrl } = await politeFetchText(url, options);
    records.push(...parseAneaesDocument(body, finalUrl));
  }

  return records;
}

/**
 * A PDF is refused rather than fed to the HTML reader, which would strip it to
 * noise and emit zero rows — the failure mode that made the last broken run
 * look like an empty register instead of a broken source.
 */
function parseAneaesDocument(body: string, sourceUrl: string): RawRecord<AneaesPayload>[] {
  if (body.startsWith('%PDF') || /\.pdf$/i.test(sourceUrl)) {
    throw new Error(
      `${sourceUrl} is a PDF. This pipeline does not parse PDFs — see docs/data-sources.md §1.1.`,
    );
  }
  return looksLikeCsv(body, sourceUrl)
    ? parseAneaesCsv(body, { sourceUrl })
    : parseAneaesHtml(body, { sourceUrl });
}
