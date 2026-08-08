import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { Badge } from '@/components/ui';
import { listOwnPrograms } from '@/db/queries/panel/catalog';
import { LEVEL_LABELS } from '@/lib/search/labels';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PanelProgramsPage() {
  const user = await currentUser();

  let programs;
  try {
    programs = await listOwnPrograms(user);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  return (
    <>
      <PanelNav current="/panel/carreras" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-ink text-2xl font-bold">Mis carreras</h1>
          <p className="text-muted max-w-prose text-sm">
            Estas son las carreras que publicamos de tu institución, tomadas del registro público.
            Podés escribir la descripción y el título que otorgan; el nombre oficial y el nivel
            vienen del registro, así que un cambio ahí lo revisamos antes de publicarlo.
          </p>
        </div>

        {programs.length === 0 ? (
          <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
            Todavía no tenemos carreras cargadas de tu institución. Escribinos y las cargamos.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {programs.map((program) => (
              <li key={program.id}>
                <Link
                  href={`/panel/carreras/${program.id}`}
                  className="border-border bg-surface hover:bg-card-alt flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="text-ink block font-medium">{program.nameOfficial}</span>
                    <span className="text-muted block text-sm">
                      {LEVEL_LABELS[program.level]}
                      {program.careerName ? ` · ${program.careerName}` : ''} ·{' '}
                      {program.offeringCount === 1
                        ? '1 oferta'
                        : `${program.offeringCount} ofertas`}
                    </span>
                  </span>
                  {program.offeringCount > 0 &&
                  program.offeringsWithPrice < program.offeringCount ? (
                    <Badge tone="warn">
                      {program.offeringCount - program.offeringsWithPrice} sin arancel
                    </Badge>
                  ) : program.offeringCount > 0 ? (
                    <Badge tone="ok">Aranceles cargados</Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
