import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

import { requestHost } from '@/middleware';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Belt and braces for `docs/domains.md` §1: the middleware 301s a
 * non-canonical host before this ever renders, but a crawler that arrives
 * while DNS is still settling — or before a `robots.txt` cache expires —
 * must not be told to index `*.hostingersite.com` or `universidad.com.py`.
 * Same host decision as the middleware (`requestHost`), so the two never
 * disagree about what "canonical" means.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const canonicalHost = (() => {
    try {
      return new URL(siteUrl).host.toLowerCase();
    } catch {
      return null;
    }
  })();
  const host = requestHost(await headers());

  if (canonicalHost && host && host !== canonicalHost) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/panel', '/admin', '/api', '/comparar'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
