/**
 * `/acreditacion` — the hub and the checker (PR-30).
 *
 * `plan.md` §2 calls accreditation the wedge and `seo.md` §8 makes this the
 * first content priority: a live national story with almost no good online
 * coverage. Two things live here.
 *
 * **The explainer** is written in this file rather than pulled from a database
 * field, and that is a deliberate exception to "content the operator edits
 * without touching code": this text states what we assert about ANEAES and
 * CONES, and getting it wrong is `risks.md` §R-09 pointed at our own foot. It
 * is reviewed like code, in a diff, by whoever merges. Career and área copy —
 * where the risk is dullness, not defamation — stays editable in `/admin`.
 *
 * **The checker** is the honest version of "¿está acreditada tu carrera?": it
 * searches the live index and shows the badge we actually hold, with its
 * source, or says we could not verify one. It never answers "no acreditada"
 * from an absence of data (`risks.md` §R-09), and it is a plain GET form, so
 * it works without JavaScript and every answer has a shareable URL.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { AccreditationBadge } from '@/components/browse';
import { offeringHref } from '@/components/browse/hrefs';
import { Button, Card, Input } from '@/components/ui';
import { searchPrograms } from '@/lib/search';
import { JsonLd, breadcrumbSchema, faqSchema } from '@/lib/seo/jsonld';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acreditación ANEAES y habilitación CONES: qué significan y cómo verificarlas',
  description:
    'Qué es una carrera acreditada por la ANEAES, en qué se diferencia de la habilitación del CONES, qué pasa con tu título y cómo verificar tu carrera con la resolución a la vista.',
  alternates: { canonical: '/acreditacion' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const QUERY_PARAM = 'q';
const MAX_RESULTS = 12;

/** Visible on the page **and** in `FAQPage` markup — never one without the other. */
const FAQ = [
  {
    question: '¿Qué es la acreditación de la ANEAES?',
    answer:
      'Es una evaluación de calidad de una carrera concreta, hecha por la Agencia Nacional de Evaluación y Acreditación de la Educación Superior. Se otorga por un período y consta en una resolución con número y fecha. Es voluntaria en algunos casos y obligatoria en otros, y no todas las carreras habilitadas están acreditadas.',
  },
  {
    question: '¿Es lo mismo que la habilitación del CONES?',
    answer:
      'No. El CONES habilita: autoriza que una carrera exista y se dicte. La ANEAES acredita: evalúa su calidad. Una carrera habilitada por el CONES puede no estar acreditada por la ANEAES, y eso es lo más común en Paraguay. En este sitio nunca mezclamos las dos cosas: cada insignia dice qué organismo la emitió.',
  },
  {
    question: '¿Mi título vale si mi carrera no está acreditada?',
    answer:
      'Una carrera habilitada emite títulos válidos. Lo que cambia con la acreditación es el reconocimiento de calidad, y hay trámites —becas, concursos, ejercicio en algunas profesiones reguladas, reconocimiento en el exterior— donde se exige explícitamente. Si tu carrera no figura acreditada acá, preguntá directamente a tu institución y pedí la resolución: ellos tienen que poder mostrarla.',
  },
  {
    question: '¿Qué significa “Sin datos de acreditación” en este sitio?',
    answer:
      'Significa exactamente eso: no encontramos un registro que podamos citar. No significa que la carrera no esté acreditada. Solo afirmamos lo que podemos respaldar con una resolución o un enlace a la fuente, y cuando no tenemos ninguno lo decimos en lugar de suponer.',
  },
  {
    question: '¿Cada cuánto actualizan estos datos?',
    answer:
      'Importamos los registros públicos del CONES y de la ANEAES periódicamente y cada dato publicado guarda de dónde salió. Si ves algo que no coincide con tu resolución, escribinos: si sos la institución, además podés disputarlo desde tu panel y la insignia se suspende mientras lo revisamos.',
  },
] as const;

export default async function AcreditacionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params[QUERY_PARAM];
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';

  const results = query ? (await searchPrograms({ q: query, pageSize: MAX_RESULTS })).results : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd data={faqSchema(FAQ)} />
      <JsonLd data={breadcrumbSchema([{ name: 'Acreditación', path: '/acreditacion' }])} />

      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">
          Acreditación ANEAES y habilitación CONES
        </h1>
        <p className="text-body max-w-prose text-base leading-relaxed">
          Son dos cosas distintas y se confunden todo el tiempo. El CONES <strong>habilita</strong>{' '}
          una carrera: autoriza que exista. La ANEAES <strong>acredita</strong>: evalúa su calidad y
          lo deja escrito en una resolución. Acá te decimos qué tenemos publicado de tu carrera, con
          la fuente a la vista.
        </p>
      </header>

      <section id="checker" className="flex scroll-mt-24 flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">¿Está acreditada tu carrera?</h2>
        <p className="text-body max-w-prose text-sm leading-relaxed">
          Escribí tu carrera y tu universidad. Te mostramos la insignia que tenemos hoy para cada
          oferta, con el organismo y el enlace a la fuente cuando existe.
        </p>

        <form
          method="GET"
          action="/acreditacion#checker"
          className="flex flex-col gap-3 sm:flex-row"
        >
          <Input
            id={QUERY_PARAM}
            name={QUERY_PARAM}
            label="Carrera e institución"
            defaultValue={query}
            placeholder="medicina una"
            className="flex-1"
          />
          <div className="flex items-end">
            <Button type="submit">Verificá</Button>
          </div>
        </form>

        {query !== '' && (
          <div className="flex flex-col gap-3">
            {results.length === 0 ? (
              <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
                No encontramos ninguna carrera que coincida con “{query}”. Probá con menos palabras
                —solo el nombre de la carrera, o solo el de la universidad— o mirá{' '}
                <Link href="/carreras" className="text-ink font-medium underline">
                  todas las carreras publicadas
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="text-muted text-sm">
                  {results.length === MAX_RESULTS
                    ? `Primeras ${MAX_RESULTS} coincidencias:`
                    : `${results.length} ${results.length === 1 ? 'coincidencia' : 'coincidencias'}:`}
                </p>
                <ul className="flex flex-col gap-2">
                  {results.map((offering) => (
                    <li
                      key={offering.offeringId}
                      className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={offeringHref(offering)}
                          className="text-ink text-sm font-medium hover:underline"
                        >
                          {offering.programName}
                        </Link>
                        <p className="text-muted text-xs">
                          {offering.institutionShort} · {offering.cityName}
                        </p>
                      </div>
                      <AccreditationBadge accreditation={offering.accreditation} />
                    </li>
                  ))}
                </ul>
                <p className="text-faint max-w-prose text-xs">
                  “Sin datos de acreditación” significa que no encontramos un registro que podamos
                  citar, no que la carrera no esté acreditada. Si sos la institución y esto está
                  mal,{' '}
                  <Link href="/panel" className="underline underline-offset-4">
                    disputalo desde tu panel
                  </Link>
                  .
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">Habilitación y acreditación, en corto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-ink text-base font-semibold">CONES — habilitación</h3>
            <p className="text-body text-sm leading-relaxed">
              Autoriza que la carrera exista y se dicte. Es el permiso de funcionamiento. Sin
              habilitación, una carrera no debería estar ofreciéndose.
            </p>
          </Card>
          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-ink text-base font-semibold">ANEAES — acreditación</h3>
            <p className="text-body text-sm leading-relaxed">
              Evalúa la calidad de esa carrera y la acredita por un período, con una resolución
              numerada. Es lo que buscan las becas, los concursos y el reconocimiento en el
              exterior.
            </p>
          </Card>
        </div>
        <p className="text-body max-w-prose text-sm leading-relaxed">
          Podés filtrar el buscador por estado de acreditación:{' '}
          <Link
            href="/carreras?acreditacion=vigente"
            className="text-ink font-medium underline underline-offset-2"
          >
            ver las carreras con acreditación vigente
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-ink text-xl font-semibold">Preguntas frecuentes</h2>
        <dl className="flex flex-col gap-5">
          {FAQ.map((entry) => (
            <div key={entry.question} className="flex flex-col gap-1.5">
              <dt className="text-ink text-base font-medium">{entry.question}</dt>
              <dd className="text-body max-w-prose text-sm leading-relaxed">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-border flex flex-col gap-3 border-t pt-8">
        <h2 className="text-ink text-lg font-semibold">Seguí desde acá</h2>
        <ul className="text-body marker:text-faint flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>
            <Link href="/carreras" className="text-ink font-medium underline underline-offset-2">
              Buscar carreras por área, ciudad y arancel
            </Link>
          </li>
          <li>
            <Link
              href="/universidades"
              className="text-ink font-medium underline underline-offset-2"
            >
              Ver todas las universidades e institutos del país
            </Link>
          </li>
          <li>
            <Link
              href="/legal/fuentes"
              className="text-ink font-medium underline underline-offset-2"
            >
              De dónde sale cada dato que publicamos
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
