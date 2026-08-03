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
 * CKAN export by hand, then run the importer against the file. The network
 * path is the optimization, the file path is the guarantee.
 */

import { politeFetchText, type FetchOptions } from './http';
import { parseConesRegister, type ConesPayload } from './parsers/cones';
import { parseAneaesCsv, parseAneaesHtml, type AneaesPayload } from './parsers/aneaes';
import type { RawRecord } from './contract';

/**
 * Entry points for the CONES register. Verify these against the live site
 * before a run — government sites reorganize without redirects.
 */
export const CONES_URLS = [
  'https://www.cones.gov.py/universidades-habilitadas/',
  'https://www.cones.gov.py/carreras-habilitadas/',
] as const;

/**
 * datos.gov.py is the structured path and is preferred. The ANEAES HTML
 * listing is the fallback for when the dataset lags (§1).
 */
export const ANEAES_URLS = {
  datosGovPyCsv:
    'https://www.datos.gov.py/dataset/carreras-de-grado-acreditadas/resource/carreras-acreditadas.csv',
  aneaesHtml: 'https://www.aneaes.gov.py/carreras-acreditadas/',
} as const;

export interface SourceInput {
  /** Local file contents, when the operator saved the document by hand. */
  files?: Array<{ path: string; body: string }>;
  /** URLs to fetch. Defaults to the constants above. */
  urls?: readonly string[];
  fetchOptions?: FetchOptions;
  onProgress?: (message: string) => void;
}

function looksLikeCsv(body: string, path: string): boolean {
  if (/\.csv$/i.test(path)) return true;
  const head = body.slice(0, 2_000).trimStart();
  return !head.startsWith('<') && /[,;\t].*[\r\n]/.test(head);
}

/** CONES habilitación register → raw records. */
export async function collectCones(input: SourceInput = {}): Promise<RawRecord<ConesPayload>[]> {
  const { files = [], urls = CONES_URLS, fetchOptions, onProgress } = input;
  const records: RawRecord<ConesPayload>[] = [];

  for (const file of files) {
    onProgress?.(`Parsing ${file.path}`);
    records.push(...parseConesRegister(file.body, { sourceUrl: file.path }));
  }

  if (files.length === 0) {
    for (const url of urls) {
      const { body, url: finalUrl } = await politeFetchText(url, { ...fetchOptions, onProgress });
      records.push(...parseConesRegister(body, { sourceUrl: finalUrl }));
    }
  }

  return records;
}

/** ANEAES / datos.gov.py accredited programs → raw records. */
export async function collectAneaes(input: SourceInput = {}): Promise<RawRecord<AneaesPayload>[]> {
  const { files = [], urls, fetchOptions, onProgress } = input;
  const records: RawRecord<AneaesPayload>[] = [];

  for (const file of files) {
    onProgress?.(`Parsing ${file.path}`);
    records.push(
      ...(looksLikeCsv(file.body, file.path)
        ? parseAneaesCsv(file.body, { sourceUrl: file.path })
        : parseAneaesHtml(file.body, { sourceUrl: file.path })),
    );
  }

  if (files.length === 0) {
    const targets = urls ?? [ANEAES_URLS.datosGovPyCsv, ANEAES_URLS.aneaesHtml];
    for (const url of targets) {
      const { body, url: finalUrl } = await politeFetchText(url, { ...fetchOptions, onProgress });
      records.push(
        ...(looksLikeCsv(body, finalUrl)
          ? parseAneaesCsv(body, { sourceUrl: finalUrl })
          : parseAneaesHtml(body, { sourceUrl: finalUrl })),
      );
    }
  }

  return records;
}
