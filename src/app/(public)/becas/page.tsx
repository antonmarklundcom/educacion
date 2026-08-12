/**
 * `/becas` — the listing (PR-31).
 *
 * Filters are links, exactly like `/carreras`' rail (`design-system.md` §9):
 * the state is the URL, it works without JavaScript, and the back button is
 * correct for free.
 *
 * Every row shows **what it actually covers**. "Beca" with no coverage stated
 * is the field where a reader fills the gap optimistically, so `sin_datos`
 * renders as "no sabemos cuánto cubre" rather than as nothing.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import { becaTypeCounts, listBecas, type BecaSummary, type BecaType } from '@/db/queries/becas';
import { BECA_TYPE_LABELS } from '@/lib/becas/labels';
import { coverageLabel, deadlineLabel } from '@/lib/becas/display';
import { JsonLd, breadcrumbSchema, siteUrl } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Becas para estudiar en Paraguay',
  description:
    'Becas universitarias vigentes en Paraguay: quién las da, cuánto cubren, hasta cuándo se puede postular y el enlace a la fuente de cada una.',
  alternates: { canonical: '/becas' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function BecaCard({ beca }: { beca: BecaSummary }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-ink text-base font-semibold">
          <Link href={`/becas/${beca.slug}`} className="hover:underline">
            {beca.title}
          </Link>
        </h2>
        <Badge tone={beca.deadline ? 'warn' : 'neutral'}>{deadlineLabel(beca.deadline)}</Badge>
      </div>
      {beca.providerLabel && <p className="text-muted text-sm">{beca.providerLabel}</p>}
      <p className="text-body max-w-prose text-sm leading-relaxed">{beca.summary}</p>
      <p className="text-body text-sm">
        <span className="text-faint text-xs">Cobertura: </span>
        {coverageLabel(beca)}
      </p>
    </Card>
  );
}

export default async function BecasPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const type = one(params, 'tipo') as BecaType | undefined;
  const areaSlug = one(params, 'area');
  const fullOnly = one(params, 'cobertura') === 'total';

  const [becas, counts] = await Promise.all([
    listBecas({ type, areaSlug, fullOnly }),
    becaTypeCounts(),
  ]);

  const filtered = Boolean(type || areaSlug || fullOnly);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd data={breadcrumbSchema([{ name: 'Becas', path: '/becas' }])} />
      {becas.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: becas.map((beca, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: siteUrl(`/becas/${beca.slug}`),
              name: beca.title,
            })),
          }}
        />
      )}

      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">Becas para estudiar en Paraguay</h1>
        <p className="text-body max-w-prose text-base leading-relaxed">
          Solo becas reales, con el enlace a la fuente en cada una. Cuando una convocatoria cierra,
          deja de aparecer acá el mismo día — preferimos una lista corta y cierta a una larga y
          vencida.
        </p>
      </header>

      <nav aria-label="Filtros" className="flex flex-wrap gap-2">
        <Link
          href="/becas"
          aria-current={!filtered ? 'page' : undefined}
          className={
            !filtered
              ? 'border-border-strong bg-card-alt text-ink rounded-full border px-3 py-1.5 text-sm font-medium'
              : 'border-border text-body hover:text-ink rounded-full border px-3 py-1.5 text-sm'
          }
        >
          Todas
        </Link>
        {counts.map((entry) => (
          <Link
            key={entry.type}
            href={`/becas?tipo=${entry.type}`}
            aria-current={type === entry.type ? 'page' : undefined}
            className={
              type === entry.type
                ? 'border-border-strong bg-card-alt text-ink rounded-full border px-3 py-1.5 text-sm font-medium'
                : 'border-border text-body hover:text-ink rounded-full border px-3 py-1.5 text-sm'
            }
          >
            {BECA_TYPE_LABELS[entry.type]} ({entry.count})
          </Link>
        ))}
        <Link
          href="/becas?cobertura=total"
          aria-current={fullOnly ? 'page' : undefined}
          className={
            fullOnly
              ? 'border-border-strong bg-card-alt text-ink rounded-full border px-3 py-1.5 text-sm font-medium'
              : 'border-border text-body hover:text-ink rounded-full border px-3 py-1.5 text-sm'
          }
        >
          Cubren el 100%
        </Link>
      </nav>

      {becas.length === 0 ? (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
          {filtered
            ? 'No hay becas abiertas con ese filtro ahora mismo.'
            : 'No tenemos becas abiertas publicadas en este momento. Cargamos solo las que podemos verificar con su fuente, así que la lista está vacía cuando no hay nada vigente — no porque no hayamos mirado.'}{' '}
          Mientras tanto, mirá{' '}
          <Link href="/carreras" className="text-ink font-medium underline">
            las carreras y sus aranceles
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {becas.map((beca) => (
            <BecaCard key={beca.id} beca={beca} />
          ))}
        </div>
      )}
    </main>
  );
}
