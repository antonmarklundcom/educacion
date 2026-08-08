import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { AdminNav } from '@/components/admin/AdminNav';
import { EntityForm } from '@/components/admin/EntityForm';
import { LogoUploadForm } from '@/components/admin/LogoUploadForm';
import { listActivity } from '@/db/queries/activity-log';
import { loadReferenceOptions, readEntity, referenceKindsFor } from '@/db/queries/admin';
import { ENTITY_DEFS, isAdminEntity } from '@/lib/admin/entities';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { saveEntityAction, setStatusAction, uploadLogoAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminEntityEditPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  requireRole(await currentUser(), ['editor']);

  const { entity, id: rawId } = await params;
  if (!isAdminEntity(entity)) notFound();
  const def = ENTITY_DEFS[entity];

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const row = await readEntity(entity, id);
  if (!row) notFound();

  const [references, activity] = await Promise.all([
    loadReferenceOptions(referenceKindsFor(def)),
    listActivity({ entityType: def.table, entityId: id, limit: 20 }),
  ]);

  const status = String(row.status ?? 'draft');
  const nextStatus = status === 'archived' ? 'draft' : 'archived';

  return (
    <>
      <AdminNav current={entity} />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link href={`/admin/${entity}`} className="text-muted hover:text-ink text-sm">
            ← {def.plural}
          </Link>
          <h1 className="text-ink text-2xl font-semibold">
            {String(row[def.titleField] ?? `${def.singular} #${id}`)}
          </h1>
          <p className="text-muted text-sm">
            {def.singular} #{id} · {status}
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-8">
            <EntityForm
              def={def}
              id={id}
              defaults={row}
              references={references}
              action={saveEntityAction}
              submitLabel="Guardar cambios"
            />

            {entity === 'instituciones' ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-ink text-lg font-semibold">Logo</h2>
                <LogoUploadForm
                  institutionId={id}
                  currentLogoUrl={(row.logoUrl as string | null) ?? null}
                  action={uploadLogoAction}
                />
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="text-ink text-lg font-semibold">
                {status === 'archived' ? 'Restaurar' : 'Archivar'}
              </h2>
              <p className="text-body max-w-prose text-sm">
                {status === 'archived'
                  ? 'Restaurar lo devuelve a borrador. Después podés publicarlo desde el formulario.'
                  : 'Archivar lo saca del sitio público sin borrarlo. Nunca eliminamos un registro: los enlaces entrantes y el índice de Google duran más que nuestras decisiones.'}
              </p>
              <form action={setStatusAction}>
                <input type="hidden" name="__entity" value={entity} />
                <input type="hidden" name="__id" value={id} />
                <input type="hidden" name="status" value={nextStatus} />
                <button
                  type="submit"
                  className="border-border-strong bg-surface text-ink hover:bg-card-alt min-h-11 rounded-md border px-4 text-sm font-medium"
                >
                  {status === 'archived' ? 'Restaurar a borrador' : 'Archivar'}
                </button>
              </form>
            </section>
          </div>

          <aside className="flex flex-col gap-3">
            <h2 className="text-ink text-lg font-semibold">Historial</h2>
            <ActivityFeed entries={activity} />
          </aside>
        </div>
      </main>
    </>
  );
}
