/**
 * `lighthouserc.json` against a **serving** origin, without hand-editing it.
 *
 * The budgets in `lighthouserc.json` name production URLs, and Lighthouse needs
 * a running app: every public surface is `force-dynamic` against MySQL
 * (`architecture.md` §3), so an audit of a build with no database measures
 * error pages. This rewrites the four paths onto whatever origin you point it
 * at, writes the config to a scratch file and runs `lhci autorun` on it.
 *
 * The origin can be production, a Hostinger deploy of the branch, or a local
 * `next build && next start` — `docs/deployment.md` §7.2 has the local recipe.
 * `.github/workflows/lighthouse.yml` calls this too, so the URL rewriting lives
 * in one place rather than in a shell heredoc that nobody can run locally.
 *
 *   npm run perf:lighthouse                            # production
 *   npm run perf:lighthouse -- --url http://localhost:3000
 *
 * Nothing about the budgets or the emulation is overridable from here on
 * purpose: a run whose thresholds moved to fit the result is not a measurement.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRATCH_DIR = join(process.cwd(), '.lighthouseci');
const CONFIG_PATH = join(SCRATCH_DIR, 'lighthouserc.resolved.json');

export interface LighthouseConfig {
  ci: { collect: { url: string[] } };
}

/**
 * Every configured path, re-hosted on `base`. The path is what the budget is
 * about; the origin is an argument. Throws rather than silently auditing
 * production when `base` is not a URL — a typo that reports a green production
 * number for a branch is the failure mode worth being loud about.
 */
export function rehost(config: LighthouseConfig, base: string): LighthouseConfig {
  const parsed = new URL(base);
  // `new URL('localhost:3000')` parses — scheme `localhost:`, path `3000` —
  // and yields the origin `null`, which would audit four `null/...` URLs and
  // report them as failures of this site. The protocol check is what turns
  // that typo into an error message.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`--url must be an http(s) URL, got: ${base}`);
  }
  const origin = parsed.origin;
  return {
    ...config,
    ci: {
      ...config.ci,
      collect: {
        ...config.ci.collect,
        url: config.ci.collect.url.map((url) => `${origin}${new URL(url).pathname}`),
      },
    },
  };
}

/**
 * `--url` is ours; everything else is handed to `lhci autorun` untouched, so a
 * machine that needs `--collect.settings.chromeFlags=--no-sandbox` can say so
 * without that belonging in the committed budgets.
 */
export function parseArgs(argv: string[]): { base: string; passthrough: string[] } {
  const index = argv.indexOf('--url');
  if (index === -1) return { base: 'https://educacion.com.py', passthrough: argv };
  const value = argv[index + 1];
  if (!value) throw new Error('--url needs a value, e.g. --url http://localhost:3000');
  return { base: value, passthrough: [...argv.slice(0, index), ...argv.slice(index + 2)] };
}

function main(): void {
  const { base, passthrough } = parseArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync('lighthouserc.json', 'utf8')) as LighthouseConfig;

  mkdirSync(SCRATCH_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(rehost(config, base), null, 2));

  console.log(`lighthouse: auditing ${base}`);
  const result = spawnSync(
    'npx',
    ['--yes', '@lhci/cli@0.14.x', 'autorun', `--config=${CONFIG_PATH}`, ...passthrough],
    { stdio: 'inherit' },
  );
  process.exit(result.status ?? 1);
}

if (process.argv[1]?.includes('lighthouse.ts')) main();
