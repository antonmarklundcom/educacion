import { loadSitemapChildren, SITE_URL } from '@/lib/seo/sitemap-data';
import { renderUrlSet } from '@/lib/seo/sitemap';

export const dynamic = 'force-dynamic';

type Params = Promise<{ child: string }>;

/**
 * `GET /sitemap/<child>.xml` — one family of URLs, listed by the index.
 *
 * The child name is never trusted as a filter: the full set is rebuilt and
 * the requested id looked up in it, so an id that no longer exists 404s
 * instead of returning an empty `urlset` that a crawler would read as "these
 * pages are gone".
 */
export async function GET(_request: Request, { params }: { params: Params }): Promise<Response> {
  const { child } = await params;
  if (!child.endsWith('.xml')) return new Response('Not found', { status: 404 });

  const id = child.slice(0, -'.xml'.length);
  const match = (await loadSitemapChildren()).find((candidate) => candidate.id === id);
  if (!match) return new Response('Not found', { status: 404 });

  return new Response(renderUrlSet(SITE_URL, match.urls), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
