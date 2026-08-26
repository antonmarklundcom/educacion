/**
 * `/becas/[slug]` — one beca (PR-31).
 *
 * A closed beca is **not** a 404. The link may be in somebody's WhatsApp
 * thread, so the page renders with a plain "esta convocatoria ya cerró" at the
 * top: a 404 teaches nothing and loses the context of what closed.
 *
 * The source link is rendered on the page, not just stored. It is the reason
 * we are allowed to publish this at all (CLAUDE.md rule 1), and a student
 * deciding what to do with a deadline deserves to check it themselves.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Button } from '@/components/ui';
import { getBecaBySlug } from '@/lib/becas';
import { BECA_TYPE_LABELS } from '@/lib/becas/labels';
import { coverageLabel, deadlineLabel } from '@/lib/becas/display';
import { Markdown } from '@/lib/content/Markdown';
import { formatDate } from '@/lib/format';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const beca = await getBecaBySlug(slug);
  if (!beca) return { title: 'Beca no encontrada' };

  const title = `${beca.title}${beca.providerLabel ? ` — ${beca.providerLabel}` : ''}`;
  const ogImage = `/og/beca?slug=${encodeURIComponent(beca.slug)}`;

  return {
    title,
    description: beca.summary,
    alternates: { canonical: `/becas/${beca.slug}` },
    // A closed convocatoria stays readable for whoever has the link, and stays
    // out of the index: it is not an answer to anybody's search any more.
    robots: beca.isClosed ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description: beca.summary,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: beca.summary,
      images: [ogImage],
    },
  };
}

export default async function BecaDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const beca = await getBecaBySlug(slug);
  if (!beca) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Becas', path: '/becas' },
          { name: beca.title, path: `/becas/${beca.slug}` },
        ])}
      />

      <nav aria-label="Migas de pan" className="text-muted text-sm">
        <Link href="/becas" className="hover:text-ink underline underline-offset-2">
          Becas
        </Link>
      </nav>

      {beca.isClosed && (
        <p className="border-warn/40 bg-warn-bg text-body rounded-md border px-4 py-3 text-sm">
          Esta convocatoria ya cerró{beca.deadline ? ` (${beca.deadline})` : ''}. La dejamos
          publicada para que puedas ver de qué se trataba y quién la daba;{' '}
          <Link href="/becas" className="text-ink font-medium underline">
            mirá las que están abiertas
          </Link>
          .
        </p>
      )}

      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">{beca.title}</h1>
        {beca.providerLabel && (
          <p className="text-body text-base">
            {beca.institutionSlug ? (
              <Link
                href={`/universidades/${beca.institutionSlug}`}
                className="text-ink font-medium underline underline-offset-2"
              >
                {beca.providerLabel}
              </Link>
            ) : (
              beca.providerLabel
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{BECA_TYPE_LABELS[beca.type]}</Badge>
          <Badge tone={beca.isClosed ? 'neutral' : 'warn'}>{deadlineLabel(beca.deadline)}</Badge>
          {beca.areaName && beca.areaSlug && (
            <Link href={`/areas/${beca.areaSlug}`}>
              <Badge tone="neutral">{beca.areaName}</Badge>
            </Link>
          )}
        </div>
        <p className="text-body max-w-prose text-base leading-relaxed">{beca.summary}</p>
      </header>

      <dl className="border-border grid gap-4 border-y py-5 sm:grid-cols-2">
        <div>
          <dt className="text-faint text-xs">Cobertura</dt>
          <dd className="text-body text-sm">{coverageLabel(beca)}</dd>
        </div>
        <div>
          <dt className="text-faint text-xs">Cierre</dt>
          <dd className="text-body text-sm">{beca.deadline ?? 'Sin fecha límite publicada'}</dd>
        </div>
      </dl>

      {beca.detailsMd && <Markdown source={beca.detailsMd} />}

      {beca.requirementsMd && (
        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-xl font-semibold">Requisitos</h2>
          <Markdown source={beca.requirementsMd} />
        </section>
      )}

      {!beca.isClosed && beca.applyUrl && (
        <div>
          <Button href={beca.applyUrl}>Postulate</Button>
        </div>
      )}

      <footer className="border-border text-muted flex flex-col gap-1 border-t pt-6 text-xs">
        <p>
          Fuente:{' '}
          <a
            href={beca.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
            className="text-ink underline underline-offset-2"
          >
            {beca.sourceUrl}
          </a>
        </p>
        {beca.verifiedAt && <p>Verificado por nosotros el {formatDate(beca.verifiedAt)}.</p>}
        <p>
          Las condiciones las fija quien otorga la beca, no nosotros. Confirmá siempre en la fuente
          antes de postularte.
        </p>
      </footer>
    </main>
  );
}
