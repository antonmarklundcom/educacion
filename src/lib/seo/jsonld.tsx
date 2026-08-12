/**
 * JSON-LD, scoped to what PR-30 actually ships.
 *
 * `seo.md` §5 specifies structured data for most of the site, and **PR-16 (the
 * SEO pack) has not shipped** — so this file is not that pack. It holds the
 * three types the editorial pages need and nothing else, in the shape PR-16
 * can extend rather than replace.
 *
 * Two rules from §5 are load-bearing and are enforced by omission here:
 * **never** `aggregateRating` or `review` (we have none, inventing them
 * violates the rule the product rests on), and **schema mirrors what is
 * visible** — every field below comes from content rendered on the same page.
 */

export interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * `JSON.stringify` escaped for a `<script>` context. `<` is the only character
 * that can end the element early; escaping it is what makes this safe without
 * a sanitizer, and it survives editorial text containing "<3" or an HTML
 * example.
 */
export function JsonLd({ data }: JsonLdProps) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function siteUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://educacion.com.py';
  return `${base.replace(/\/$/, '')}${path}`;
}

export interface ArticleSchemaInput {
  slug: string;
  title: string;
  excerpt: string;
  authorName: string;
  authorBio: string | null;
  publishedAt: Date;
  updatedAt: Date;
}

/**
 * `Article` + author `Person` (`seo.md` §5).
 *
 * The author is a real name typed by an editor, and it is rendered as the
 * visible byline on the same page — a `Person` in the markup that does not
 * appear on the page would be exactly the "schema that does not mirror visible
 * content" §5 forbids.
 */
export function articleSchema(post: ArticleSchemaInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': siteUrl(`/blog/${post.slug}`) },
    author: {
      '@type': 'Person',
      name: post.authorName,
      ...(post.authorBio ? { description: post.authorBio } : {}),
    },
    publisher: {
      '@type': 'Organization',
      name: 'educacion.com.py',
      url: siteUrl(),
    },
    inLanguage: 'es-PY',
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbSchema(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: siteUrl(crumb.path),
    })),
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/** `FAQPage` — only ever emitted where the same Q&As are visible (§5). */
export function faqSchema(entries: readonly FaqEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}
