/**
 * `/` — the homepage.
 *
 * Six sections, in the order a student needs them: hero + search, entry points
 * by área, the careers with the most published options, the accreditation
 * explainer, the institution logo strip (only if real logos exist) and a
 * closing CTA.
 *
 * ### Every number here is a count of something we published
 *
 * There are no student numbers, no ratings, no testimonials and no "N
 * universidades confían en nosotros". The only figures on the page are row
 * counts from `program_search` and from `institutions`, and each one is
 * labelled as what it is. In particular the careers section is ranked by
 * **supply**, not by popularity: we do not measure per-career search volume
 * and will not imply that we do (see `@/lib/home/top-careers`).
 *
 * ### Reads
 *
 * One `searchPrograms({})` — which is where the área entry points, the total
 * and the facet counts come from — one `listInstitutions()` for the logo strip
 * and the ANEAES ratio, and a bounded walk over the largest áreas for the
 * careers ranking. `force-dynamic` for the same reason every other data route
 * is: CI builds without a `DATABASE_URL` (`architecture.md` §3).
 */

import type { Metadata } from 'next';

import { AccreditationTeaser } from '@/components/home/AccreditationTeaser';
import { AreaGrid } from '@/components/home/AreaGrid';
import { FinalCta } from '@/components/home/FinalCta';
import { HomeHero } from '@/components/home/HomeHero';
import { LogoStrip } from '@/components/home/LogoStrip';
import { TopCareers } from '@/components/home/TopCareers';
import { loadTopCareers } from '@/lib/home/top-careers';
import { listInstitutions } from '@/lib/institutions';
import { searchPrograms } from '@/lib/search';
import { organizationSchema, websiteSchema } from '@/lib/seo/catalog-schema';
import { JsonLd } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

/** How many careers the supply ranking shows. */
const TOP_CAREER_COUNT = 8;

export const metadata: Metadata = {
  title: { absolute: 'Carreras y universidades en Paraguay | educacion.com.py' },
  description:
    'Buscá y compará todas las carreras universitarias de Paraguay: aranceles, duración, modalidad y estado de acreditación, en un solo índice.',
  alternates: { canonical: '/' },
};

async function loadHomeData() {
  // `pageSize: 1` because this page renders no offerings — it needs the facet
  // counts and the total, not a result list.
  const [search, institutions] = await Promise.all([
    searchPrograms({ pageSize: 1 }),
    listInstitutions(),
  ]);

  const areaSupply = search.facets.areas.map((area) => ({
    slug: area.value,
    offeringCount: area.count,
  }));

  const careers = await loadTopCareers(areaSupply, TOP_CAREER_COUNT);

  const programCount = institutions.reduce((sum, institution) => sum + institution.programCount, 0);
  const aneaesAccreditedCount = institutions.reduce(
    (sum, institution) => sum + institution.aneaesAccreditedCount,
    0,
  );

  return { search, institutions, careers, programCount, aneaesAccreditedCount };
}

export default async function HomePage() {
  const { search, institutions, careers, programCount, aneaesAccreditedCount } =
    await loadHomeData();

  return (
    <main>
      {/* `WebSite` + `SearchAction` and `Organization` live on the homepage
          rather than in the layout: Google reads the sitelinks searchbox only
          from a site's homepage, and the layout also wraps `/comparar`, which
          is `noindex` and must therefore emit no schema at all (seo.md §5). */}
      <JsonLd data={websiteSchema()} />
      <JsonLd data={organizationSchema()} />
      <HomeHero />

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-12 px-4 py-10 sm:px-6 lg:gap-16 lg:py-14">
        {search.total === 0 ? (
          <EmptyIndexNotice />
        ) : (
          <>
            <AreaGrid areas={search.facets.areas} />
            <TopCareers careers={careers} />
            <AccreditationTeaser
              programCount={programCount}
              aneaesAccreditedCount={aneaesAccreditedCount}
            />
            <LogoStrip institutions={institutions} />
          </>
        )}
        <FinalCta />
      </div>
    </main>
  );
}

/**
 * An index with nothing in it says so. The one thing this page may never do is
 * fill the gap with sample áreas or example carreras (CLAUDE.md rule 1) — the
 * same distinction `/carreras` draws between "no results for these filters"
 * and "nothing published yet" (design-system.md §9).
 */
function EmptyIndexNotice() {
  return (
    <section className="border-border-strong bg-surface rounded-lg border border-dashed px-6 py-12 text-center">
      <h2 className="text-ink text-lg font-semibold">Todavía no publicamos carreras</h2>
      <p className="text-body mx-auto mt-2 max-w-prose text-sm">
        Estamos cargando el índice a partir de los registros del CONES y de la ANEAES. Preferimos
        decirlo antes que mostrar un listado de ejemplo.
      </p>
    </section>
  );
}
