/**
 * `/carreras/[carreraSlug]/[ciudad]` — the gated city variant of a career hub
 * (seo.md §4, "medicina en encarnación").
 *
 * The anti-doorway gate is enforced here, at request time, against the exact
 * numbers the career hub advertised the city with — `getCareerCitySupply()`
 * is the one query both pages read, so a city can never appear as a link on
 * the hub and then 404 here, or pass here on a looser count than what is
 * shown. `architecture.md` §3 has the detail routes as `force-dynamic` until
 * a build-time database exists, so the gate is a runtime `notFound()` rather
 * than an empty `generateStaticParams` — the CI `npm run build` step still
 * has no `DATABASE_URL` to enumerate cities from.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { areaHref, careerHref, ResultCard } from '@/components/browse';
import { buildCareerCityIntro, getCareerBySlug, getCareerCitySupply, passesCityGate } from '@/lib/careers';
import { formatMonthYear } from '@/lib/format';
import { getWhatsappNumbers } from '@/lib/institutions';
import { searchPrograms } from '@/lib/search';

export const dynamic = 'force-dynamic';

type Params = Promise<{ carreraSlug: string; ciudad: string }>;

const loadPage = cache(async (carreraSlug: string, ciudad: string) => {
  const career = await getCareerBySlug(carreraSlug);
  if (!career) return null;

  const supply = await getCareerCitySupply(career.id);
  const city = supply.find((entry) => entry.citySlug === ciudad);
  if (!city || !passesCityGate(city)) return null;

  const { results, total } = await searchPrograms({
    careerSlugs: [career.slug],
    citySlugs: [ciudad],
    sort: 'nombre_asc',
    pageSize: 100,
  });

  return { career, city, offerings: results, total };
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { carreraSlug, ciudad } = await params;
  const loaded = await loadPage(carreraSlug, ciudad);
  if (!loaded) return { title: 'Página no encontrada' };

  const { career, city } = loaded;

  return {
    title: `${career.nameEs} en ${city.cityName} – ${city.institutionCount} universidades`,
    description: `Compará ${city.institutionCount} opciones para estudiar ${career.nameEs} en ${city.cityName}: aranceles, duración, modalidad y acreditación ANEAES.`,
    alternates: { canonical: `${careerHref(career.slug)}/${city.citySlug}` },
  };
}

export default async function CareraCiudadPage({ params }: { params: Params }) {
  const { carreraSlug, ciudad } = await params;
  const loaded = await loadPage(carreraSlug, ciudad);
  if (!loaded) notFound();
  const { career, city, offerings, total } = loaded;

  const intro = buildCareerCityIntro(career, city.cityName, offerings);
  const latestVerifiedAt = offerings
    .map((offering) => offering.price.verifiedAt)
    .filter((date): date is Date => date != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const whatsappNumbers = await getWhatsappNumbers(offerings.map((offering) => offering.institutionId));

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-3">
        <div className="text-muted flex flex-wrap items-center gap-1.5 text-xs">
          {career.areaName && career.areaSlug && (
            <>
              <a href={areaHref(career.areaSlug)} className="hover:text-ink underline underline-offset-2">
                {career.areaName}
              </a>
              <span aria-hidden>·</span>
            </>
          )}
          <a href={careerHref(career.slug)} className="hover:text-ink underline underline-offset-2">
            {career.nameEs} en Paraguay
          </a>
        </div>

        <h1 className="text-ink text-xl font-bold lg:text-2xl">
          {career.nameEs} en {city.cityName}
        </h1>

        <div className="flex flex-col gap-2">
          {intro.map((paragraph, index) => (
            <p key={index} className="text-body max-w-prose text-sm">
              {paragraph.text}
            </p>
          ))}
        </div>

        {latestVerifiedAt && (
          <p className="text-faint text-xs">Aranceles actualizados a {formatMonthYear(latestVerifiedAt)}.</p>
        )}
      </header>

      <div className="mt-8 flex flex-col gap-4">
        <h2 className="text-ink border-border border-b pb-2 text-base font-semibold">
          Universidades <span className="text-muted font-mono text-sm">({total})</span>
        </h2>
        {offerings.map((offering) => (
          <ResultCard
            key={offering.offeringId}
            offering={offering}
            whatsappE164={whatsappNumbers.get(offering.institutionId) ?? null}
          />
        ))}
      </div>
    </main>
  );
}
