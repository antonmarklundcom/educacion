/**
 * `/comparar?ids=1,2,3` — the decision page.
 *
 * Server-rendered, always: in Paraguay this link gets pasted into a WhatsApp
 * group, and a client-rendered comparison previews as an empty page. The
 * selection is entirely in the URL, so the link a friend receives shows exactly
 * what the sender was looking at (architecture.md §5).
 *
 * `noindex` — it is shareable, not searchable (seo.md §2), and `robots.ts`
 * disallows the path as well.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';

import { CompareTable } from '@/components/compare/CompareTable';
import { ShareButtons } from '@/components/compare/ShareButtons';
import { COMPARE_IDS_PARAM, parseCompareIds } from '@/lib/compare/state';
import { COMPARE_PARAM, getOfferingsByIds, MAX_COMPARE } from '@/lib/search';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * `ids` is the documented parameter (pr-plan.md, PR-09); `comparar` is
 * accepted too so that a URL copied straight off `/carreras` still works.
 */
function readIds(params: Record<string, string | string[] | undefined>): number[] {
  const primary = parseCompareIds(params[COMPARE_IDS_PARAM]);
  return primary.length ? primary : parseCompareIds(params[COMPARE_PARAM]);
}

/** One query per request, shared by the metadata and the page body. */
const loadOfferings = cache(async (ids: number[]) => getOfferingsByIds(ids));

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const ids = readIds(await searchParams);
  const offerings = ids.length ? await loadOfferings(ids) : [];
  const robots = { index: false, follow: true };

  if (offerings.length === 0) {
    return { title: 'Comparar carreras', robots };
  }

  const names = offerings.map((offering) => offering.programName).join(' vs. ');
  const institutions = offerings.map((offering) => offering.institutionShort).join(', ');
  const query = new URLSearchParams({ [COMPARE_IDS_PARAM]: ids.join(',') }).toString();

  return {
    title: `Comparar: ${names}`,
    description: `Comparación de ${offerings.length} carreras en ${institutions}: duración, modalidad, arancel y estado de acreditación.`,
    robots,
    openGraph: {
      title: `Comparar: ${names}`,
      description: `Duración, modalidad, arancel y acreditación — ${institutions}.`,
      url: `${siteUrl}/comparar?${query}`,
      images: [{ url: `/og/comparar?${query}`, width: 1200, height: 630 }],
    },
  };
}

export default async function CompararPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ids = readIds(params);
  const offerings = ids.length ? await loadOfferings(ids) : [];
  const missing = ids.length - offerings.length;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:py-12">
      <nav className="text-muted text-sm">
        <Link href="/carreras" className="hover:text-ink underline underline-offset-2">
          ← Volver a carreras
        </Link>
      </nav>

      <h1 className="text-ink mt-4 text-xl font-bold lg:text-2xl">Comparar carreras</h1>

      {offerings.length === 0 ? (
        <div className="border-border-strong bg-surface mt-8 rounded-lg border border-dashed px-6 py-12 text-center">
          <h2 className="text-ink text-lg font-semibold">Todavía no elegiste carreras</h2>
          <p className="text-body mx-auto mt-2 max-w-prose text-sm">
            Marcá hasta {MAX_COMPARE} carreras en el listado y volvé acá para verlas una al lado de
            la otra.
          </p>
          <Link
            href="/carreras?vista=tabla"
            className="bg-accent hover:bg-accent-hover focus-visible:ring-ink mt-6 inline-flex min-h-12 items-center justify-center rounded-md px-5 text-sm font-medium text-white transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Elegir carreras
          </Link>
        </div>
      ) : (
        <>
          {missing > 0 && (
            <p role="status" className="bg-warn-bg text-warn mt-4 rounded-md px-4 py-2 text-sm">
              {missing === 1
                ? 'Una de las carreras del enlace ya no está publicada y no se muestra.'
                : `${missing} carreras del enlace ya no están publicadas y no se muestran.`}
            </p>
          )}

          <div className="mt-6">
            <CompareTable offerings={offerings} />
          </div>

          <div className="mt-8">
            <ShareButtons
              url={`${siteUrl}/comparar?${new URLSearchParams({
                [COMPARE_IDS_PARAM]: offerings.map((offering) => offering.offeringId).join(','),
              }).toString()}`}
              programNames={offerings.map((offering) => offering.programName)}
            />
          </div>
        </>
      )}
    </main>
  );
}
