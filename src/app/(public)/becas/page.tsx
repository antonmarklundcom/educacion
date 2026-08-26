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
import { BECA_TYPE } from '@/db/schema';
import { BECA_TYPE_LABELS } from '@/lib/becas/labels';
import { coverageLabel, deadlineLabel } from '@/lib/becas/display';
import { JsonLd, breadcrumbSchema, siteUrl } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The three filters this page accepts, read once so the page body and
 * `generateMetadata` cannot disagree about whether the view is filtered
 * (PR-56).
 *
 * `tipo` is **checked against the enum** rather than cast to it. It used to be
 * `one(params, 'tipo') as BecaType`, which put arbitrary query-string text into
 * a `WHERE becas.type = ?`: Drizzle parameterises, so nothing was injectable,
 * but every one of the infinitely many `?tipo=<anything>` URLs rendered as a
 * *filtered* page — the "no hay becas con ese filtro" empty state, no chip
 * marked `aria-current`, and its own `ItemList` — for a filter that does not
 * exist. An unrecognised value is now simply not a filter.
 *
 * `area` stays free text: it is matched against `areas.slug`, an unknown slug
 * correctly returns nothing, and validating it would cost a query to tell a
 * crawler what an empty list already says.
 */
function readFilters(params: Record<string, string | string[] | undefined>) {
  const rawType = one(params, 'tipo');
  const type = BECA_TYPE.includes(rawType as BecaType) ? (rawType as BecaType) : undefined;
  const areaSlug = one(params, 'area');
  const fullOnly = one(params, 'cobertura') === 'total';
  return { type, areaSlug, fullOnly, filtered: Boolean(type || areaSlug || fullOnly) };
}

/**
 * A filtered view is `noindex, follow` with the canonical on the bare page —
 * the same treatment `/carreras?…filters` gets (`seo.md` §1). PR-31 shipped one
 * static `metadata` here, so `?tipo=estatal` was an indexable near-duplicate of
 * `/becas` that also claimed to *be* `/becas`.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { filtered } = readFilters(await searchParams);
  return {
    title: 'Becas para estudiar en Paraguay',
    description:
      'Becas universitarias vigentes en Paraguay: quién las da, cuánto cubren, hasta cuándo se puede postular y el enlace a la fuente de cada una.',
    alternates: { canonical: '/becas' },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
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
  const { type, areaSlug, fullOnly, filtered } = readFilters(params);

  const [becas, counts] = await Promise.all([
    listBecas({ type, areaSlug, fullOnly }),
    becaTypeCounts(),
  ]);

  // `seo.md` §5: an `ItemList` describes *the* list at this URL, and a filtered
  // view is a slice — positions restarting at 1, `numberOfItems` counting a
  // subset — while the canonical above points at the whole list. PR-41's second
  // review pass closed exactly this gate on the career hubs; `/becas` shipped
  // in PR-31 and never got it. And a page that renders `noindex` emits no
  // JSON-LD at all.
  const listsWholeIndex = !filtered && becas.length > 0;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      {/* seo.md §5: a page that renders `noindex` emits no JSON-LD. The
          breadcrumb goes with the `ItemList` on a filtered view. */}
      {!filtered && <JsonLd data={breadcrumbSchema([{ name: 'Becas', path: '/becas' }])} />}
      {listsWholeIndex && (
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
