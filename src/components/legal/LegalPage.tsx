/**
 * The shell every `/legal/*` page renders inside. Server component.
 *
 * These pages are long prose in a product that has no prose component — the
 * rest of the site is cards, tables and badges. Rather than reach for a
 * typography plugin (a dependency, for four pages), the shell fixes the measure
 * and the rhythm and `LegalSection` fixes the heading, so the pages themselves
 * contain text and nothing else.
 *
 * `updated` is a plain date string shown to the reader: a policy without a date
 * cannot be reasoned about later, which is the same argument
 * `CONSENT_TEXT_VERSION` makes for the lead form.
 */

import type { ReactNode } from 'react';

export function LegalPage({
  title,
  lead,
  updated,
  children,
}: {
  title: string;
  lead?: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">{title}</h1>
        {lead && <p className="text-body text-base leading-relaxed">{lead}</p>}
        <p className="text-muted text-xs">Última actualización: {updated}</p>
      </header>
      <div className="flex flex-col gap-10">{children}</div>
    </main>
  );
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="text-ink text-lg font-semibold">
        {number !== undefined && <span className="text-muted font-mono">{number}. </span>}
        {title}
      </h2>
      <div className="text-body flex flex-col gap-3 text-base leading-relaxed">{children}</div>
    </section>
  );
}

/** The bulleted list these pages use. Kept here so the spacing is decided once. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="marker:text-faint flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}
