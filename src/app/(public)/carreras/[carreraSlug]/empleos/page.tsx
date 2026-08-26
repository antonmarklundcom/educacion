/**
 * `/carreras/[carrera]/empleos` — the "empleos relacionados" landing page
 * (PR-32).
 *
 * ### What this is, and what it deliberately is not
 *
 * It is an SEO landing page that answers "¿dónde se trabaja con este título?"
 * with two honest things: the qualitative `salida_laboral_md` an editor wrote,
 * and a handful of **real, dated, attributed** postings. Then it sends the
 * reader to trabajo.com.py with the career pre-filled.
 *
 * It is **not** a job board. There is no application form, no candidate
 * profile, no employer account and no saved search — `risks.md` §R-15 names
 * that drift specifically, and trabajo.com.py already exists and is better at
 * it than we would be.
 *
 * ### No numbers
 *
 * `risks.md` §R-11: Paraguay has no citable dataset for salaries or
 * employability by degree, so this page contains none — not in the copy, not
 * in the postings (a posting's own stated salary is the employer's claim and
 * lives at the employer's URL), and not in schema markup.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui';
// Through `@/lib/careers`, not `@/db/queries/careers`: the lib module is where
// the public-read cache lives (PR-55), and importing past it gave this page two
// uncached round-trips its siblings do not pay.
import { getCareerBySlug, getCareerStats } from '@/lib/careers';
import { listJobPostingsForCareer } from '@/db/queries/jobs';
import { Markdown } from '@/lib/content/Markdown';
import { hasSalidaLaboral } from '@/lib/careers/salida-laboral';
import { JOBS_PARTNER_NAME, partnerSearchUrl } from '@/lib/jobs/outbound';
import { formatDate } from '@/lib/format';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

type Params = Promise<{ carreraSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { carreraSlug } = await params;
  const career = await getCareerBySlug(carreraSlug);
  if (!career) return { title: 'Carrera no encontrada' };

  return {
    title: `Salida laboral de ${career.nameEs} en Paraguay — dónde se trabaja`,
    description: `Dónde trabajan quienes estudian ${career.nameEs} en Paraguay, qué sectores contratan y empleos publicados hoy, con su fuente y su fecha.`,
    alternates: { canonical: `/carreras/${career.slug}/empleos` },
  };
}

export default async function CareerJobsPage({ params }: { params: Params }) {
  const { carreraSlug } = await params;
  const career = await getCareerBySlug(carreraSlug);
  if (!career) notFound();

  const [stats, jobs] = await Promise.all([
    getCareerStats(career.id),
    listJobPostingsForCareer(career.id),
  ]);

  const hasCopy = hasSalidaLaboral(career.salidaLaboralMd);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Carreras', path: '/carreras' },
          { name: career.nameEs, path: `/carreras/${career.slug}` },
          { name: 'Salida laboral', path: `/carreras/${career.slug}/empleos` },
        ])}
      />

      <nav aria-label="Migas de pan" className="text-muted text-sm">
        <Link
          href={`/carreras/${career.slug}`}
          className="hover:text-ink underline underline-offset-2"
        >
          {career.nameEs}
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">
          Salida laboral de {career.nameEs} en Paraguay
        </h1>
        <p className="text-body max-w-prose text-base leading-relaxed">
          Dónde trabaja la gente que estudia esta carrera y qué se está buscando hoy. No publicamos
          sueldos promedio ni tasas de empleabilidad: no existe una fuente paraguaya que podamos
          citar para eso, y preferimos no tener el dato antes que inventarlo.
        </p>
      </header>

      {hasCopy ? (
        <section className="flex flex-col gap-4">
          <Markdown source={career.salidaLaboralMd!} />
        </section>
      ) : (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
          Todavía no escribimos la salida laboral de {career.nameEs}. Mientras tanto, lo que sí
          tenemos es dónde se estudia:{' '}
          <Link href={`/carreras/${career.slug}`} className="text-ink font-medium underline">
            {stats.offeringCount} {stats.offeringCount === 1 ? 'oferta' : 'ofertas'} en{' '}
            {stats.institutionCount}{' '}
            {stats.institutionCount === 1 ? 'institución' : 'instituciones'}
          </Link>
          .
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">Empleos publicados</h2>

        {jobs.length === 0 ? (
          <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
            No tenemos avisos vigentes cargados para esta carrera. Los que publicamos son reales,
            con su fecha y su fuente, así que esta lista está vacía cuando no hay ninguno que
            podamos mostrar así.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <Card className="flex flex-col gap-1 p-4">
                  <a
                    href={job.url}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="text-ink text-base font-semibold underline-offset-2 hover:underline"
                  >
                    {job.title}
                  </a>
                  <p className="text-body text-sm">
                    {job.employerName}
                    {job.locationLabel ? ` · ${job.locationLabel}` : ''}
                  </p>
                  {job.summary && <p className="text-muted text-sm">{job.summary}</p>}
                  <p className="text-faint text-xs">
                    Publicado el {formatDate(new Date(`${job.postedOn}T12:00:00.000Z`))} ·{' '}
                    {job.sourceLabel}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <p className="text-body text-sm">
          <a
            href={partnerSearchUrl(career.nameEs)}
            rel="noopener noreferrer nofollow"
            target="_blank"
            className="text-ink font-medium underline underline-offset-2"
          >
            Ver más empleos de {career.nameEs} en {JOBS_PARTNER_NAME}
          </a>
        </p>
        <p className="text-faint max-w-prose text-xs">
          No somos una bolsa de trabajo: mostramos algunos avisos reales con su fuente y te llevamos
          a donde está el resto. Postularte se hace siempre en el sitio de quien publica.
        </p>
      </section>

      <section className="border-border flex flex-col gap-3 border-t pt-8">
        <h2 className="text-ink text-lg font-semibold">Antes del trabajo, la carrera</h2>
        <p className="text-body max-w-prose text-sm leading-relaxed">
          <Link
            href={`/carreras/${career.slug}`}
            className="text-ink font-medium underline underline-offset-2"
          >
            Compará dónde estudiar {career.nameEs}
          </Link>{' '}
          — aranceles, duración, modalidad y estado de acreditación de cada opción publicada.
        </p>
      </section>
    </main>
  );
}
