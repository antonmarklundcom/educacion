import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminNav } from '@/components/admin/AdminNav';
import { EntityForm } from '@/components/admin/EntityForm';
import { loadReferenceOptions, referenceKindsFor } from '@/db/queries/admin';
import { ENTITY_DEFS, isAdminEntity } from '@/lib/admin/entities';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { saveEntityAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminEntityCreatePage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  requireRole(await currentUser(), ['editor']);

  const { entity } = await params;
  if (!isAdminEntity(entity)) notFound();
  const def = ENTITY_DEFS[entity];
  const references = await loadReferenceOptions(referenceKindsFor(def));

  return (
    <>
      <AdminNav current={entity} />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link href={`/admin/${entity}`} className="text-muted hover:text-ink text-sm">
            ← {def.plural}
          </Link>
          <h1 className="text-ink text-2xl font-semibold">Crear {def.singular.toLowerCase()}</h1>
        </div>

        <EntityForm
          def={def}
          id={null}
          defaults={{ status: 'draft' }}
          references={references}
          action={saveEntityAction}
          submitLabel={`Crear ${def.singular.toLowerCase()}`}
        />
      </main>
    </>
  );
}
