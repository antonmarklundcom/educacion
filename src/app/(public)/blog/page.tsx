/**
 * `/blog` — the editorial index (PR-30).
 *
 * Posts are DB-backed and written from `/admin/blog`, so this page is a list of
 * whatever is published *and* whose `published_at` has arrived. An empty blog
 * says so plainly rather than showing sample posts: the same rule PR-13 applied
 * to the logo strip (CLAUDE.md rule 1).
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { listPublishedPosts } from '@/db/queries/posts';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog — orientación para elegir carrera en Paraguay',
  description:
    'Artículos sobre acreditación, aranceles, exámenes de ingreso y cómo elegir una carrera en Paraguay, escritos con los datos que publicamos.',
  alternates: { canonical: '/blog' },
};

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">Blog</h1>
        <p className="text-body max-w-prose text-base leading-relaxed">
          Lo que aprendimos ordenando la oferta de educación superior del país: qué significa una
          acreditación, cómo se compara un arancel de verdad, qué preguntar antes de inscribirte.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
          Todavía no publicamos ningún artículo. Mientras tanto, lo más útil que tenemos es el{' '}
          <Link href="/carreras" className="text-ink font-medium underline">
            buscador de carreras
          </Link>{' '}
          y la{' '}
          <Link href="/acreditacion" className="text-ink font-medium underline">
            guía de acreditación
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {posts.map((post) => (
            <li
              key={post.id}
              className="border-border flex flex-col gap-1 border-b pb-6 last:border-0"
            >
              <h2 className="text-ink text-lg font-semibold">
                <Link href={`/blog/${post.slug}`} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
              <p className="text-muted text-xs">
                {formatDate(post.publishedAt)} · {post.authorName}
              </p>
              <p className="text-body max-w-prose text-sm leading-relaxed">{post.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
