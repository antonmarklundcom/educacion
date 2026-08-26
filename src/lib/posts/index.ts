/**
 * The editorial-post public surface — the same shape as `@/lib/becas`,
 * `@/lib/institutions` and `@/lib/careers` (CLAUDE.md rule 5).
 *
 * Left live by `architecture.md` §38.5 for the same reason as becas:
 * `db/queries/admin/posts.ts` writes `posts`, which is not in
 * `program_search`, so there was never a `rebuildProgramSearch()` to hang a
 * cache expiry on. PR-57 gives it one directly, the same way PR-55 did for
 * `admin/areas.ts` — see that file and `cache/tags.ts`.
 *
 * `db/queries/posts.ts`'s `livePredicate` is `status = 'published' AND
 * published_at <= now` — a post scheduled for later becomes visible when the
 * clock reaches it, with no write in between (its own docblock: "what makes
 * scheduling possible without a second column or a cron"). Both reads here
 * carry today's date in the cache key for the same reason `search-key.ts`
 * carries it for `admission_closes_on`: without it, a post already past its
 * scheduled time could keep 404ing — the exact regression this PR must not
 * introduce — until the hour-long TTL backstop caught up.
 */

import {
  getPostBySlug as getPostBySlugQuery,
  listPublishedPosts as listPublishedPostsQuery,
  type PostDetail,
  type PostSummary,
} from '@/db/queries/posts';
import { cachedRead } from '@/lib/cache';
import { toDateOnly } from '@/lib/search/accreditation';

export type { PostDetail, PostSummary } from '@/db/queries/posts';

type PostSummaryWire = Omit<PostSummary, 'publishedAt'> & { publishedAt: string };
type PostDetailWire = Omit<PostDetail, 'publishedAt' | 'updatedAt'> & {
  publishedAt: string;
  updatedAt: string;
};

/** Published posts, newest first. Cached — the key rolls over at midnight. */
export function listPublishedPosts(
  options: { limit?: number; now?: Date } = {},
): Promise<PostSummary[]> {
  const now = options.now ?? new Date();
  return cachedRead<PostSummaryWire[], PostSummary[]>({
    name: 'posts-list',
    key: `${toDateOnly(now)}|${options.limit ?? ''}`,
    load: async () =>
      (await listPublishedPostsQuery({ limit: options.limit, now })).map((post) => ({
        ...post,
        publishedAt: post.publishedAt.toISOString(),
      })),
    decode: (wire) => wire.map((post) => ({ ...post, publishedAt: new Date(post.publishedAt) })),
  });
}

/** One published post by slug, or `null` — a 404 on the route. Cached. */
export function getPostBySlug(slug: string, now: Date = new Date()): Promise<PostDetail | null> {
  return cachedRead<PostDetailWire | null, PostDetail | null>({
    name: 'post-by-slug',
    key: `${toDateOnly(now)}|${slug}`,
    load: async () => {
      const post = await getPostBySlugQuery(slug, now);
      if (!post) return null;
      return {
        ...post,
        publishedAt: post.publishedAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      };
    },
    decode: (wire) =>
      wire && {
        ...wire,
        publishedAt: new Date(wire.publishedAt),
        updatedAt: new Date(wire.updatedAt),
      },
  });
}
