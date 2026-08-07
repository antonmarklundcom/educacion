/**
 * The institution logo strip — real logos only.
 *
 * `institutions.logo_url` is null for essentially every row today; uploads are
 * PR-19's, together with the storage decision R-08 forces. So this renders
 * only institutions that actually have a logo, and below `MIN_LOGOS` it
 * renders nothing at all. The alternatives — placeholder boxes, or monograms
 * standing in for logos — would both dress an empty dataset up as a roster of
 * partners, which is the fabricated trust signal this page must not have
 * (CLAUDE.md rule 1). An absent strip is honest.
 *
 * ### Why a plain `<img>` and not `next/image` (seo.md §6)
 *
 * `next/image` would have to run `unoptimized`: its loader validates the src
 * hostname against `images.remotePatterns`, and where logos will live is
 * precisely the R-08 decision PR-19 owns — pre-configuring a host we have not
 * chosen would either break the strip later or bake in a guess now. Unoptimized
 * it emits the same `<img>` with the same `src`, no srcset and no resizing,
 * while adding ~10 kB of client runtime to the homepage bundle for a section
 * that today renders nothing at all. Explicit dimensions and `loading="lazy"`
 * are the two things the component was buying us, and both are plain
 * attributes. Revisit when PR-19 fixes the storage host.
 */

import Link from 'next/link';

import { institutionHref } from '@/components/browse';
import type { InstitutionSummary } from '@/lib/institutions';

/** Fewer than this reads as "the six universities we could get" — omit instead. */
export const MIN_LOGOS = 6;

export interface InstitutionWithLogo extends InstitutionSummary {
  logoUrl: string;
}

export function withLogos(institutions: readonly InstitutionSummary[]): InstitutionWithLogo[] {
  return institutions.filter(
    (institution): institution is InstitutionWithLogo =>
      typeof institution.logoUrl === 'string' && institution.logoUrl.trim() !== '',
  );
}

export function LogoStrip({ institutions }: { institutions: readonly InstitutionSummary[] }) {
  const withLogo = withLogos(institutions);
  if (withLogo.length < MIN_LOGOS) return null;

  return (
    <section aria-labelledby="instituciones-heading">
      <h2 id="instituciones-heading" className="text-ink text-lg font-semibold lg:text-xl">
        Instituciones en el índice
      </h2>
      <p className="text-muted mt-1 text-sm">
        Publicamos la oferta de estas instituciones a partir de registros públicos. No es una lista
        de auspiciantes.
      </p>

      <ul className="mt-5 flex flex-wrap items-center gap-3">
        {withLogo.map((institution) => (
          <li key={institution.id}>
            <Link
              href={institutionHref(institution.slug)}
              className="border-border bg-surface hover:bg-card-alt focus-visible:ring-ink flex h-16 w-36 items-center justify-center rounded-lg border px-3 transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see the note above: next/image here would be `unoptimized`, i.e. this same tag plus ~10 kB of runtime. */}
              <img
                src={institution.logoUrl}
                alt={institution.nameShort}
                width={120}
                height={40}
                loading="lazy"
                decoding="async"
                className="max-h-10 w-auto max-w-[112px] object-contain"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
