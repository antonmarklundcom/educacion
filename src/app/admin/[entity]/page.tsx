import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminNav } from '@/components/admin/AdminNav';
import { EntityTable } from '@/components/admin/EntityTable';
import { listEntities, loadReferenceOptions, referenceKindsFor } from '@/db/queries/admin';
import { ENTITY_DEFS, isAdminEntity } from '@/lib/admin/entities';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function AdminEntityListPage({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The layout gates the whole segment; this repeats the check because a page
  // is a read of institution-independent staff data and the guard should be
  // visible where the data is fetched (CLAUDE.md rule 4).
  requireRole(await currentUser(), ['editor']);

  const { entity } = await params;
  if (!isAdminEntity(entity)) notFound();
  const def = ENTITY_DEFS[entity];

  const query = await searchParams;
  const one = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const [list, references] = await Promise.all([
    listEntities(entity, {
      q: one('q'),
      filterValue: positiveInt(one('filtro')) ?? null,
      page: positiveInt(one('pagina')) ?? 1,
    }),
    loadReferenceOptions(referenceKindsFor(def)),
  ]);

  return (
    <>
      <AdminNav current={entity} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-ink text-2xl font-semibold">{def.plural}</h1>
          <Link
            href={`/admin/${entity}/nuevo`}
            className="border-border-strong bg-surface text-ink hover:bg-card-alt inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium"
          >
            Crear {def.singular.toLowerCase()}
          </Link>
        </div>

        <EntityTable
          def={def}
          rows={list.rows}
          total={list.total}
          page={list.page}
          perPage={list.perPage}
          q={one('q')}
          filterValue={positiveInt(one('filtro')) ?? null}
          references={references}
          basePath={`/admin/${entity}`}
        />
      </main>
    </>
  );
}
