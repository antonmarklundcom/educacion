import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getBecaForEdit } from '@/db/queries/admin/becas';
import { listAreaOptions, listInstitutionOptions } from '@/db/queries/admin/options';
import { formatDate } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveBecaAction, updateBecaAction } from '../actions';
import { becaFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditBecaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [beca, institutions, areas] = await Promise.all([
    getBecaForEdit(user, id),
    listInstitutionOptions(),
    listAreaOptions(),
  ]);
  if (!beca) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Editá la beca</h1>
        <p className="text-muted text-sm">
          Guardar vuelve a sellar la verificación con tu usuario y la fecha de hoy.{' '}
          {beca.verifiedAt && <>Última verificación: {formatDate(beca.verifiedAt)}.</>}
        </p>
      </div>

      <AdminForm
        fields={becaFields(institutions, areas)}
        defaultValues={{ ...beca }}
        action={updateBecaAction.bind(null, id)}
        submitLabel="Guardá los cambios"
        cancelHref="/admin/becas"
      />

      <form action={archiveBecaAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Archivá esta beca (deja de verse; no se borra)
        </button>
      </form>
    </main>
  );
}
