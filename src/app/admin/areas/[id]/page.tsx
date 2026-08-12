import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getAreaForEdit } from '@/db/queries/admin/areas';
import { MIN_EDITORIAL_WORDS } from '@/lib/careers/copy';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { updateAreaAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditAreaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const area = await getAreaForEdit(user, id);
  if (!area) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">{area.nameEs}</h1>
        <p className="text-muted max-w-prose text-sm">
          El slug <span className="font-mono">{area.slug}</span> no se edita: está en la URL de una
          página indexada y en cada enlace interno que apunta ahí.
        </p>
      </div>

      <AdminForm
        fields={[
          { type: 'text', name: 'nameEs', label: 'Nombre', required: true, maxLength: 160 },
          {
            type: 'textarea',
            name: 'descriptionMd',
            label: `Descripción del área (${MIN_EDITORIAL_WORDS}+ palabras propias para que la página se indexe)`,
            rows: 14,
          },
          { type: 'number', name: 'sortOrder', label: 'Orden' },
        ]}
        defaultValues={{ ...area }}
        action={updateAreaAction.bind(null, id)}
        submitLabel="Guardá el área"
        cancelHref="/admin/areas"
      />
    </main>
  );
}
