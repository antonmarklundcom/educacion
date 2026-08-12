/**
 * The per-post OG image for `/blog/[slug]`.
 *
 * A route handler rather than `opengraph-image.tsx`, matching `/og/comparar`:
 * reachable at `/og/blog?slug=…` and deliberately not under `/api`, which
 * `robots.ts` disallows.
 *
 * Draws exactly what the article page shows above the fold — title, author,
 * publication date, the site wordmark. Nothing else: no excerpt, no invented
 * read time or share counts.
 */

import { ImageResponse } from 'next/og';

import { getPostBySlug } from '@/db/queries/posts';
import { formatDate } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#0d6e86';

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get('slug');
  const post = slug ? await getPostBySlug(slug) : null;

  if (!post) return new Response('Not found', { status: 404 });

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        padding: 56,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 34, backgroundColor: ACCENT }} />
        <div style={{ fontSize: 28, color: INK, fontWeight: 700 }}>educacion.com.py</div>
      </div>

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', fontSize: 46, color: INK, fontWeight: 700, lineHeight: 1.15 }}>
        {truncate(post.title, 90)}
      </div>
      <div style={{ display: 'flex', fontSize: 24, color: MUTED, marginTop: 20 }}>
        {`Por ${post.authorName} · ${formatDate(post.publishedAt)}`}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
