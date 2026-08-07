/**
 * The accreditation explainer teaser — the wedge (plan.md §2) stated on the
 * homepage, in the three words the badge vocabulary already fixes
 * (design-system.md §4).
 *
 * The numbers are the same ones the institution profile shows: programs we
 * published, and of those, the programs whose winning accreditation row is a
 * current **ANEAES** one. They come from `listInstitutions()`, not from the
 * `accreditationStatuses` facet, and the difference matters — a `vigente`
 * facet count also contains CONES habilitaciones, so quoting it as an ANEAES
 * figure would be the exact conflation this section exists to correct.
 *
 * The link goes to the filter that works today. `/acreditacion` is still a
 * placeholder (PR-30 owns the hub), and pointing the homepage at a page that
 * says "en construcción" is a dead link (design-system.md §8.4).
 */

import Link from 'next/link';

import { CARRERAS_PATH } from '@/components/browse';
import { Badge } from '@/components/ui';
import { searchHref } from '@/lib/search';

export interface AccreditationTeaserProps {
  programCount: number;
  aneaesAccreditedCount: number;
}

export function AccreditationTeaser({
  programCount,
  aneaesAccreditedCount,
}: AccreditationTeaserProps) {
  if (programCount === 0) return null;

  const accreditedHref = searchHref(CARRERAS_PATH, { accreditationStatuses: ['vigente'] });

  return (
    <section
      aria-labelledby="acreditacion-heading"
      className="border-border bg-surface rounded-lg border p-6 lg:p-8"
    >
      <h2 id="acreditacion-heading" className="text-ink text-lg font-semibold lg:text-xl">
        ¿Tu título va a valer?
      </h2>

      <p className="text-body mt-3 max-w-prose text-sm">
        De los <span className="text-ink font-mono">{programCount}</span>{' '}
        {programCount === 1 ? 'programa que publicamos' : 'programas que publicamos'},{' '}
        <span className="text-ink font-mono">{aneaesAccreditedCount}</span>{' '}
        {aneaesAccreditedCount === 1 ? 'tiene' : 'tienen'} una acreditación de la ANEAES vigente
        según las fuentes que pudimos verificar.
      </p>

      <p className="text-body mt-3 max-w-prose text-sm">
        Una habilitación del CONES no es una acreditación de la ANEAES: la primera autoriza a dictar
        la carrera, la segunda evalúa su calidad. Y cuando no encontramos ningún registro lo
        escribimos así, sin convertirlo en una acusación.
      </p>

      <dl className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dt>
            <Badge tone="ok">Acreditada ANEAES</Badge>
          </dt>
          <dd className="text-muted text-xs">
            La ANEAES evaluó el programa y su resolución sigue vigente.
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dt>
            <Badge tone="info">Habilitada CONES</Badge>
          </dt>
          <dd className="text-muted text-xs">
            El CONES autorizó la carrera. No es lo mismo que estar acreditada.
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dt>
            <Badge tone="neutral">Sin datos de acreditación</Badge>
          </dt>
          <dd className="text-muted text-xs">
            No encontramos un registro. No significa que no esté acreditada.
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-sm">
        <Link
          href={accreditedHref}
          className="text-ink focus-visible:ring-ink rounded-sm font-medium underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Ver las carreras con una acreditación vigente en el índice
        </Link>
      </p>
    </section>
  );
}
