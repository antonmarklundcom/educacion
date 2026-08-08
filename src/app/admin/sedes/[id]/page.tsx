import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getCampusForEdit } from '@/db/queries/admin/campuses';
import { listCityOptions, listInstitutionOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveCampusAction, updateCampusAction } from '../actions';
import { campusFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditCampusPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const campus = await getCampusForEdit(user, id);
  if (!campus) notFound();

  const [institutions, cities] = await Promise.all([listInstitutionOptions(), listCityOptions()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá {campus.name}</h1>
      <AdminForm
        fields={campusFields(institutions, cities)}
        defaultValues={{ ...campus }}
        action={updateCampusAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/sedes"
      />
      <form action={archiveCampusAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Eliminá esta sede (la archiva; no borra su historial)
        </button>
      </form>
    </main>
  );
}
