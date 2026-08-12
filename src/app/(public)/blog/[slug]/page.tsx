/**
 * `/blog/[slug]` — one article (PR-30).
 *
 * `Article` + author `Person` JSON-LD per `seo.md` §5, both mirroring content
 * that is visible on the page: the byline is rendered, the dates are rendered,
 * and nothing is asserted in the markup that a reader cannot see.
 *
 * The body is rendered by `lib/content/markdown`, a small subset renderer that
 * builds React elements rather than HTML strings — so an editorial body cannot
 * inject markup no matter what is typed into the admin.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getPostBySlug } from '@/db/queries/posts';
import { Markdown } from '@/lib/content/Markdown';
import { formatDate } from '@/lib/format';
import { JsonLd, articleSchema, breadcrumbSchema } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Artículo no encontrado' };

  const ogImage = `/og/blog?slug=${encodeURIComponent(post.slug)}`;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.authorName],
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd data={articleSchema(post)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Blog', path: '/blog' },
          { name: post.title, path: `/blog/${post.slug}` },
        ])}
      />

      <nav aria-label="Migas de pan" className="text-muted text-sm">
        <Link href="/blog" className="hover:text-ink underline underline-offset-2">
          Blog
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">{post.title}</h1>
        <p className="text-muted text-sm">
          Por {post.authorName} · {formatDate(post.publishedAt)}
          {post.updatedAt.getTime() - post.publishedAt.getTime() > 86_400_000 && (
            <> · actualizado {formatDate(post.updatedAt)}</>
          )}
        </p>
        <p className="text-body max-w-prose text-base leading-relaxed">{post.excerpt}</p>
      </header>

      <article>
        <Markdown source={post.bodyMd} />
      </article>

      {post.authorBio && (
        <footer className="border-border text-muted border-t pt-6 text-sm">
          <p className="max-w-prose">
            <span className="text-ink font-medium">{post.authorName}</span> — {post.authorBio}
          </p>
        </footer>
      )}
    </main>
  );
}
