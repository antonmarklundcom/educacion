/**
 * Admin CRUD for editorial posts (PR-30). Rule 5, and the PR-19 shape:
 * `requireRole` inside every mutation, `activity_log` inside the same
 * transaction, "eliminá" archives rather than deletes.
 *
 * No `rebuildProgramSearch` here — a post is not in the index. This is the
 * first admin entity where that is true, and it is stated so the omission does
 * not read as one.
 *
 * PR-57 put the public post reads (`@/lib/posts`) behind the public-read
 * cache, so every mutation below now expires it directly — there was never a
 * `rebuildProgramSearch()` call in this file to piggy back on. Same reasoning,
 * and the same call, as `admin/areas.ts` and `admin/becas.ts`
 * (`cache/tags.ts` lists all three).
 */

import { and, desc, eq, like, ne, or, sql } from 'drizzle-orm';

import { db as defaultDb, type Db } from '@/db';
import { posts } from '@/db/schema';
import { expirePublicReads } from '@/lib/cache';
import { requireRole } from '@/lib/auth/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { PostInput } from '@/lib/admin/validation';
import { slugify } from '@/lib/curate';

import { logActivity } from './activity-log';
import type { AdminListPage } from './institutions';

export type PostRow = typeof posts.$inferSelect;

const PAGE_SIZE = 25;

export async function listPostsAdmin(
  actor: SessionUser | null | undefined,
  options: { q?: string; page?: number } = {},
  database: Db = defaultDb,
): Promise<AdminListPage<PostRow>> {
  requireRole(actor, ['editor']);

  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim();
  const where = q ? or(like(posts.title, `%${q}%`), like(posts.slug, `%${q}%`)) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    database
      .select()
      .from(posts)
      .where(where)
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    database
      .select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(where),
  ]);

  return { rows, total: Number(count), page, pageSize: PAGE_SIZE };
}

export async function getPostForEdit(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<PostRow | null> {
  requireRole(actor, ['editor']);
  const [row] = await database.select().from(posts).where(eq(posts.id, id)).limit(1);
  return row ?? null;
}

export async function isPostSlugTaken(
  slug: string,
  excludeId: number | null,
  database: Db = defaultDb,
): Promise<boolean> {
  const where = excludeId
    ? and(eq(posts.slug, slug), ne(posts.id, excludeId))
    : eq(posts.slug, slug);
  const [row] = await database.select({ id: posts.id }).from(posts).where(where).limit(1);
  return Boolean(row);
}

/**
 * Publishing stamps `published_at` **once**, the first time a post goes live,
 * and never again: a later edit is an update, not a republication, and moving
 * the date would reorder the blog every time a typo is fixed. An explicit date
 * from the form always wins, which is what makes scheduling and backdating
 * possible.
 */
function publishedAtFor(input: PostInput, existing: PostRow | null): Date | null {
  if (input.publishedAt) return new Date(`${input.publishedAt}T12:00:00.000Z`);
  if (input.status !== 'published') return existing?.publishedAt ?? null;
  return existing?.publishedAt ?? new Date();
}

export async function createPost(
  actor: SessionUser | null | undefined,
  input: PostInput,
  database: Db = defaultDb,
): Promise<number> {
  const user = requireRole(actor, ['editor']);

  const row: typeof posts.$inferInsert = {
    slug: input.slug ?? slugify(input.title),
    title: input.title,
    excerpt: input.excerpt,
    bodyMd: input.bodyMd,
    authorName: input.authorName,
    authorBio: input.authorBio,
    status: input.status,
    publishedAt: publishedAtFor(input, null),
  };

  const insertId = await database.transaction(async (tx) => {
    const [result] = await tx.insert(posts).values(row);
    const insertId = Number(result.insertId);
    await logActivity(tx, {
      userId: user.id,
      entityType: 'post',
      entityId: insertId,
      action: 'create',
      before: null,
      after: { ...row },
    });
    return insertId;
  });

  // Outside the transaction on purpose (`admin/areas.ts` makes the same
  // argument): expiring after a write that then rolls back costs one cold read
  // of unchanged data, while not expiring after a write that committed is a
  // stale page.
  expirePublicReads();

  return insertId;
}

export async function updatePost(
  actor: SessionUser | null | undefined,
  id: number,
  input: PostInput,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!before) throw new Error('Post no encontrado.');

    const row: Partial<typeof posts.$inferInsert> = {
      slug: input.slug ?? before.slug,
      title: input.title,
      excerpt: input.excerpt,
      bodyMd: input.bodyMd,
      authorName: input.authorName,
      authorBio: input.authorBio,
      status: input.status,
      publishedAt: publishedAtFor(input, before),
    };

    await tx.update(posts).set(row).where(eq(posts.id, id));
    await logActivity(tx, {
      userId: user.id,
      entityType: 'post',
      entityId: id,
      action: 'update',
      before: { ...before },
      after: { ...before, ...row },
    });
  });

  // Outside the transaction — see `createPost` above.
  expirePublicReads();
}

export async function archivePost(
  actor: SessionUser | null | undefined,
  id: number,
  database: Db = defaultDb,
): Promise<void> {
  const user = requireRole(actor, ['editor']);

  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!before) throw new Error('Post no encontrado.');

    await tx.update(posts).set({ status: 'archived' }).where(eq(posts.id, id));
    await logActivity(tx, {
      userId: user.id,
      entityType: 'post',
      entityId: id,
      action: 'archive',
      before: { status: before.status },
      after: { status: 'archived' },
    });
  });

  // Outside the transaction — see `createPost` above.
  expirePublicReads();
}
