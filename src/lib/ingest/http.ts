/**
 * Polite fetching.
 *
 * `docs/data-sources.md` §1 and §7 are the spec here, and they are as much
 * about goodwill as about technique: these are small government servers, we
 * need to stay welcome, and the institutions behind them are future customers.
 * One pass per month at walking pace is enough.
 *
 * Three things this enforces:
 *  - a real browser User-Agent with a contact URL, so an admin who sees us in
 *    a log can find out who we are instead of blocking an anonymous scraper;
 *  - a minimum delay between requests to the same host, serialized per host so
 *    concurrent callers cannot bypass it;
 *  - bounded retries on transient failures only. A 403 is not transient — the
 *    government sites 403 whole networks (§1), and hammering past that is both
 *    useless and exactly the behaviour that earns a permanent block.
 */

const CONTACT_URL = 'https://educacion.com.py/legal/fuentes';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  `Chrome/124.0.0.0 Safari/537.36 (+${CONTACT_URL})`;

export const DEFAULT_DELAY_MS = 2_000;

/**
 * `IMPORT_RATE_LIMIT_MS` is the operator's brake — `.env.example` has always
 * documented it, and until the crawl grew past a couple of URLs nothing read
 * it.
 *
 * When it is set it is a **floor**: a caller may slow a run down, never speed
 * it past what the operator chose. When it is not set there is nothing to
 * enforce, so an explicit caller value wins and `DEFAULT_DELAY_MS` is the
 * fallback — otherwise no caller could ever go faster than the default, which
 * would make every crawl test sleep in real time for no gain in politeness.
 */
export function configuredDelayMs(requested?: number): number {
  const configured = Number.parseInt(process.env.IMPORT_RATE_LIMIT_MS ?? '', 10);
  if (Number.isFinite(configured) && configured >= 0) {
    return Math.max(configured, requested ?? 0);
  }
  return requested ?? DEFAULT_DELAY_MS;
}
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_RETRIES = 3;

/** Transient enough to be worth a second look; everything else fails fast. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchOptions {
  /** Minimum gap between two requests to the same host. */
  delayMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  onProgress?: (message: string) => void;
  /** Injected in tests so retry backoff does not actually sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export class FetchError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Per-host tail of scheduled requests. Each new request chains onto the
 * previous one for that host, so N concurrent callers still go out one at a
 * time, `delayMs` apart.
 */
const hostQueues = new Map<string, Promise<unknown>>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Test seam: politeness state is module-level, so tests must be able to reset it. */
export function __resetRateLimiter(): void {
  hostQueues.clear();
}

function schedule<T>(url: string, delayMs: number, task: () => Promise<T>): Promise<T> {
  const host = hostOf(url);
  const previous = hostQueues.get(host) ?? Promise.resolve();
  // `.catch` so one failed request does not poison the queue for the next.
  const next = previous
    .catch(() => {})
    .then(async () => {
      const result = await task();
      await sleep(delayMs);
      return result;
    });
  hostQueues.set(host, next);
  return next;
}

/**
 * Fetch a document as text, politely. Returns the body and the final URL after
 * redirects — the latter is what gets stored as `source_records.source_url`,
 * because that is the URL a reader can actually open.
 */
export async function politeFetchText(
  url: string,
  options: FetchOptions = {},
): Promise<{ body: string; url: string; status: number }> {
  const {
    delayMs = DEFAULT_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    fetchImpl = fetch,
    onProgress,
    sleepImpl = sleep,
  } = options;

  return schedule(url, delayMs, async () => {
    let lastError: FetchError | null = null;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        onProgress?.(`GET ${url}${attempt > 1 ? ` (attempt ${attempt}/${retries})` : ''}`);
        const response = await fetchImpl(url, {
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8',
            'accept-language': 'es-PY,es;q=0.9',
          },
          redirect: 'follow',
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = new FetchError(
            `${response.status} ${response.statusText} for ${url}`,
            url,
            response.status,
          );
          if (!RETRYABLE_STATUS.has(response.status)) throw error;
          lastError = error;
        } else {
          return { body: await response.text(), url: response.url || url, status: response.status };
        }
      } catch (error) {
        if (error instanceof FetchError && !RETRYABLE_STATUS.has(error.status ?? 0)) throw error;
        lastError =
          error instanceof FetchError
            ? error
            : new FetchError(`${(error as Error).message} for ${url}`, url);
      } finally {
        clearTimeout(timer);
      }

      if (attempt < retries) {
        // 2s, 4s, 8s — the backoff docs/deployment.md uses for flaky networks.
        await sleepImpl(delayMs * 2 ** attempt);
      }
    }

    throw lastError ?? new FetchError(`Failed to fetch ${url}`, url);
  });
}
