/**
 * Public reads for editorial posts (PR-30). Rule 5.
 *
 * `status = 'published'` **and** a `published_at` in the past are both
 * required: a post scheduled for next Tuesday is `published` in the admin and
 * still invisible on the site, which is what makes scheduling possible without
 * a second column or a cron.
 */

import { and, desc, eq, lte, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { posts } from '@/db/schema';

export interface PostSummary {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  authorName: string;
  publishedAt: Date;
}

export interface PostDetail extends PostSummary {
  bodyMd: string;
  authorBio: string | null;
  updatedAt: Date;
}

function livePredicate(now: Date) {
  return and(eq(posts.status, 'published'), lte(posts.publishedAt, now));
}

export async function listPublishedPosts(
  options: { limit?: number; now?: Date } = {},
  database: Db = defaultDb,
): Promise<PostSummary[]> {
  const now = options.now ?? new Date();
  const rows = await database
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      authorName: posts.authorName,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(livePredicate(now))
    .orderBy(desc(posts.publishedAt))
    .limit(options.limit ?? 50);

  return rows.map((row) => ({ ...row, publishedAt: row.publishedAt ?? new Date(0) }));
}

export async function getPostBySlug(
  slug: string,
  now: Date = new Date(),
  database: Db = defaultDb,
): Promise<PostDetail | null> {
  const [row] = await database
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), livePredicate(now)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.bodyMd,
    authorName: row.authorName,
    authorBio: row.authorBio ?? null,
    publishedAt: row.publishedAt ?? row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Slugs for the sitemap. */
export async function listPublishedPostSlugs(
  database: Db = defaultDb,
): Promise<{ slug: string; updatedAt: Date }[]> {
  return database
    .select({ slug: posts.slug, updatedAt: posts.updatedAt })
    .from(posts)
    .where(livePredicate(new Date()))
    .orderBy(desc(posts.publishedAt));
}

export async function countPublishedPosts(database: Db = defaultDb): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)` })
    .from(posts)
    .where(livePredicate(new Date()));
  return Number(row?.total ?? 0);
}
