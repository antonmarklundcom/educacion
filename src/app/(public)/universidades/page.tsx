/**
 * `/universidades` — every published institution in the country.
 *
 * One read (`listInstitutions()`), two SQL statements, no N+1: the
 * institutions, then one grouped aggregate over `program_search` for all of
 * their counts at once.
 *
 * Institutions with no published carreras are listed with a zero count rather
 * than hidden. They are in the CONES register; dropping them would make the
 * register look smaller than it is, and the card says plainly that we have not
 * loaded their programs yet.
 *
 * A server component with no client JavaScript. Grouping is by tipo de
 * institución, which is a property of the row — not an editorial ranking.
 */

import type { Metadata } from 'next';

import { InstitutionCard } from '@/components/institution/InstitutionCard';
import { listInstitutions, type InstitutionSummary } from '@/lib/institutions';
import { INSTITUTION_TYPE_LABELS, type InstitutionType } from '@/lib/search';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Universidades e institutos de Paraguay',
  description:
    'El listado completo de universidades, institutos superiores y técnicos del Paraguay, con la cantidad de carreras publicadas y su estado de acreditación.',
  alternates: { canonical: '/universidades' },
};

/**
 * Display order for the groups. Not a ranking — universities are simply what
 * most visitors came for.
 */
const TYPE_ORDER: readonly InstitutionType[] = [
  'universidad',
  'instituto_superior',
  'instituto_tecnico',
  'ifd',
  'otro',
];

export default async function UniversidadesPage() {
  const institutions = await listInstitutions();
  const grouped = groupByType(institutions);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-ink text-xl font-bold lg:text-2xl">
          Universidades e institutos de Paraguay
        </h1>
        <p className="text-body max-w-prose text-sm">
          El listado se arma con los registros públicos del CONES y de la ANEAES. Cada perfil
          muestra las carreras que pudimos verificar y la fuente de cada acreditación.
        </p>
      </header>

      {institutions.length === 0 ? (
        <div className="border-border-strong bg-surface mt-8 rounded-lg border border-dashed px-6 py-12 text-center">
          <h2 className="text-ink text-lg font-semibold">Todavía no hay instituciones cargadas</h2>
          <p className="text-body mx-auto mt-2 max-w-prose text-sm">
            El relevamiento del registro del CONES todavía no se cargó. Preferimos no mostrar nada
            antes que mostrar un listado incompleto como si fuera completo.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          <p className="text-muted text-sm">
            <strong className="text-ink font-semibold">{institutions.length}</strong>{' '}
            {institutions.length === 1 ? 'institución publicada' : 'instituciones publicadas'}
          </p>

          {TYPE_ORDER.map((type) => {
            const group = grouped.get(type);
            if (!group?.length) return null;

            return (
              <section key={type} className="flex flex-col gap-4">
                <h2 className="text-ink border-border border-b pb-2 text-base font-semibold">
                  {INSTITUTION_TYPE_LABELS[type]}{' '}
                  <span className="text-muted font-mono text-sm">({group.length})</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.map((institution) => (
                    <InstitutionCard key={institution.id} institution={institution} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function groupByType(
  institutions: readonly InstitutionSummary[],
): Map<InstitutionType, InstitutionSummary[]> {
  const grouped = new Map<InstitutionType, InstitutionSummary[]>();
  for (const institution of institutions) {
    const group = grouped.get(institution.type) ?? [];
    group.push(institution);
    grouped.set(institution.type, group);
  }
  return grouped;
}
