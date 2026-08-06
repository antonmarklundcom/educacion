/**
 * `/areas/[areaSlug]` — the area hub ("carreras de salud en paraguay",
 * seo.md §2), one level above the career hub.
 *
 * This page lists **careers**, not offerings — `listCareersByArea()` reads
 * `careers` (published only) with one grouped aggregate over `program_search`
 * for their counts, the same "two queries, merged in JS, never one per row"
 * shape `institutions.ts` settled in PR-11. Prices and accreditation still
 * come from nowhere but `searchPrograms()`, and this page shows neither —
 * that is each career hub's job, one click away.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { CareerCard } from '@/components/career/CareerCard';
import { buildAreaIntro, getAreaBySlug, hasEditorialCopy, listCareersByArea } from '@/lib/careers';

export const dynamic = 'force-dynamic';

type Params = Promise<{ areaSlug: string }>;

const loadArea = cache(async (slug: string) => {
  const area = await getAreaBySlug(slug);
  if (!area) return null;
  const careers = await listCareersByArea(area.id);
  return { area, careers };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { areaSlug } = await params;
  const loaded = await loadArea(areaSlug);
  if (!loaded) return { title: 'Área no encontrada' };

  const { area, careers } = loaded;

  return {
    title: `Carreras de ${area.nameEs} en Paraguay – ${careers.length} opciones`,
    description: `Explorá las ${careers.length} carreras de ${area.nameEs} que publicamos en Paraguay, con universidades, aranceles y acreditación de cada una.`,
    alternates: { canonical: `/areas/${area.slug}` },
    robots: hasEditorialCopy(area.descriptionMd) ? undefined : { index: false, follow: true },
  };
}

export default async function AreaPage({ params }: { params: Params }) {
  const { areaSlug } = await params;
  const loaded = await loadArea(areaSlug);
  if (!loaded) notFound();
  const { area, careers } = loaded;

  const intro = buildAreaIntro(area, careers.length);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-xl font-bold lg:text-2xl">
          Carreras de {area.nameEs} en Paraguay
        </h1>
        <div className="flex flex-col gap-2">
          {intro.map((paragraph, index) => (
            <p key={index} className="text-body max-w-prose text-sm">
              {paragraph.text}
            </p>
          ))}
        </div>
      </header>

      {careers.length === 0 ? (
        <div className="border-border-strong bg-surface mt-8 rounded-lg border border-dashed px-6 py-12 text-center">
          <h2 className="text-ink text-lg font-semibold">Todavía no hay carreras cargadas</h2>
          <p className="text-body mx-auto mt-2 max-w-prose text-sm">
            No publicamos todavía ninguna carrera del área de {area.nameEs}.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {careers.map((career) => (
            <CareerCard key={career.id} career={career} />
          ))}
        </div>
      )}
    </main>
  );
}
