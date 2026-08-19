import { loadSitemapChildren, SITE_URL } from '@/lib/seo/sitemap-data';
import { renderSitemapIndex } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

/**
 * `GET /sitemap.xml` — the sitemap **index** `seo.md` §6 asks for, replacing
 * the static+blog+becas file that shipped in PR-30 with the deferral written
 * in its own comment.
 *
 * A route handler rather than Next's `sitemap.ts` convention on purpose:
 * `generateSitemaps()` is enumerated at build time, and CI builds without a
 * `DATABASE_URL` (`architecture.md` §3), so the set of children would be
 * frozen to whatever the build could see — which is nothing. Generation stays
 * per-request, which is also what keeps the PR-33 `sitemap` cron `not_needed`.
 */
export async function GET(): Promise<Response> {
  const children = await loadSitemapChildren();

  return new Response(renderSitemapIndex(SITE_URL, children), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Crawlers refetch the index often; an hour is far shorter than the
      // interval at which any of these families actually changes.
      'cache-control': 'public, max-age=3600',
    },
  });
}
