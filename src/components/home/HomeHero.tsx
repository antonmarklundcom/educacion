/**
 * The hero: what this is, who it is for, what to do next — all three above the
 * fold at 390px (design-system.md §8.5, which asked for exactly this).
 *
 * The search field is the shipped `SearchBar`: a plain GET form whose input is
 * named from `FILTER_PARAMS`, so submitting it lands on a real `/carreras` URL
 * in the same vocabulary `parseSearchFilters` reads back. No second
 * serialization, no hand-built query string, and no client component.
 *
 * There is no hero image. The LCP element is this heading, server-rendered in
 * the first response — nothing here can be lazy-loaded.
 */

import Link from 'next/link';

import { CARRERAS_PATH, SearchBar } from '@/components/browse';

export function HomeHero() {
  return (
    <section className="border-border bg-surface border-b">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:py-14">
        <h1 className="text-ink max-w-3xl text-xl leading-tight font-bold text-balance lg:text-3xl">
          Todas las carreras universitarias de Paraguay, comparables en un solo lugar
        </h1>
        <p className="text-body mt-3 max-w-2xl text-sm lg:text-base">
          Si estás eligiendo qué estudiar, buscá entre los grados, tecnicaturas y posgrados del país
          y compará aranceles, duración, modalidad y acreditación antes de decidir.
        </p>

        <div className="mt-6 max-w-3xl">
          <SearchBar filters={{}} basePath={CARRERAS_PATH} label="Buscá tu carrera" />
        </div>

        <p className="text-muted mt-4 text-xs">
          Armamos el índice con los registros públicos del CONES y de la ANEAES.{' '}
          <Link
            href="/legal/fuentes"
            className="focus-visible:ring-ink rounded-sm underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Mirá de dónde sale cada dato
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
