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
  experimental: { isrFlushToDisk: false },

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

export default nextConfig;
