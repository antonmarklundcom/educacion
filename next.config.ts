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
