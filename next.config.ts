import type { NextConfig } from 'next';

/**
 * Where institution logos live (`risks.md` §R-08: an S3-compatible bucket, not
 * the app directory). `next/image` refuses a remote host it was not told
 * about, so the pattern is derived from the same env var the uploader writes
 * to — one source of truth, and no hostname hardcoded in two places.
 *
 * With `S3_PUBLIC_BASE_URL` unset there are no remote images to allow, which
 * is the correct state for a deploy that has not configured storage yet.
 */
function remoteImagePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (!base) return [];
  try {
    const url = new URL(base);
    return [
      {
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        hostname: url.hostname,
        pathname: `${url.pathname.replace(/\/$/, '')}/**`,
      },
    ];
  } catch {
    console.warn(`[next.config] S3_PUBLIC_BASE_URL is not a URL: ${base}`);
    return [];
  }
}

const nextConfig: NextConfig = {
  /**
   * PR-43's cache lives in memory only.
   *
   * `unstable_cache` entries are `FETCH`-kind entries, and Next's default
   * incremental cache writes every one of them to `.next/cache/fetch-cache`
   * with **no eviction**. The catalog's cache key is derived from the URL —
   * free text, slug lists, page numbers — so its keyspace is unbounded and
   * anybody with a browser can mint entries. On Hostinger that is a fixed disk
   * quota being filled by strangers.
   *
   * With `isrFlushToDisk: false` the same entries live in the in-memory LRU
   * (`cacheMaxMemorySize`, 50 MB by default) and eviction becomes the bound.
   * Nothing is lost that this site was relying on: `architecture.md` §3 already
   * treats the cache as per-instance and wiped on redeploy, so persistence
   * across deploys was never part of the contract. Residual risk and why no
   * key-shape rule was added instead: §27.2.
   */
  experimental: {
    isrFlushToDisk: false,
    // Next defaults its build workers to os.cpus().length - 1, which on
    // Hostinger's shared box is the physical core count of the host, not
    // this account's share. Each worker is a Node process, counted against
    // the account-wide 200 "Max Processes" cap shared by 9 apps. One worker
    // keeps a deploy from tipping the account over the cap. Same fix as
    // vendercrm PR #84, propia.node PR #81, trabajo PR #82.
    cpus: 1,
  },

  images: {
    remotePatterns: remoteImagePatterns(),
    // Institution logos are small and square; there is no hero photography on
    // this site (design-system.md §14), so the wide breakpoints Next generates
    // by default would be bytes nobody requests.
    imageSizes: [32, 48, 64, 96, 128, 256],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    formats: ['image/webp'],
  },

  // The one header this app needs and cannot set from a route: Hostinger
  // serves the static chunks, and their filenames are content-hashed, so they
  // are safe to cache forever (PR-34).
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

/**
 * Sourcemaps for the server bundle (PR-45).
 *
 * `withSentryConfig` is applied **only when a DSN and an auth token are both
 * present**, which on this repo means production and nowhere else. CI builds
 * with neither, so its `next build` is byte-identical to the one before PR-45:
 * no plugin in the pipeline, no upload attempted, no warning printed about a
 * missing token. That is what "absent DSN = fully inert" has to mean for the
 * build as well as for the runtime.
 *
 * `SENTRY_ORG` / `SENTRY_PROJECT` come from the shared free-tier organization
 * (`docs/deployment.md` §8.1).
 *
 * **The upload failure is made fatal on purpose.** The plugin's default is
 * `handleRecoverableError(e, false)` — non-throwing — and it deletes the local
 * `.map` files afterwards regardless, with `silent: true` suppressing the error
 * line as well. So a wrong `SENTRY_AUTH_TOKEN` would produce a green deploy
 * with no maps uploaded *and* none on disk: every server stack unsymbolicated,
 * silently, which is the one thing this PR exists to prevent. An `errorHandler`
 * that throws turns that into a failed build, which is a bad afternoon instead
 * of a bad quarter.
 */
function withSentry(config: NextConfig): NextConfig {
  if (!process.env.SENTRY_DSN || !process.env.SENTRY_AUTH_TOKEN) return config;

  // Required lazily, and that is the point rather than a style slip: importing
  // `@sentry/nextjs` at the top of this file loads the Node SDK into the Next
  // CLI process itself, where its OpenTelemetry hooks would instrument the
  // *build*. CI, which has no DSN, must not pay for a package it will not use.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require('@sentry/nextjs') as typeof import('@sentry/nextjs');
  return withSentryConfig(config, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    // The map is uploaded and then deleted from the deploy: a public `.map`
    // next to the bundle hands the reader the server source.
    sourcemaps: { deleteSourcemapsAfterUpload: true },
    telemetry: false,
    disableLogger: true,
    errorHandler: (error) => {
      throw error;
    },
  });
}

export default withSentry(nextConfig);
