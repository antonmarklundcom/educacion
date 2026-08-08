import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getCareerForEdit } from '@/db/queries/admin/careers';
import { listAreaOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveCareerAction, updateCareerAction } from '../actions';
import { careerFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditCareerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const career = await getCareerForEdit(user, id);
  if (!career) notFound();

  const areas = await listAreaOptions();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá {career.nameEs}</h1>
      <AdminForm
        fields={careerFields(areas)}
        defaultValues={{ ...career, synonyms: (career.synonymsJson ?? []).join(', ') }}
        action={updateCareerAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/carreras"
      />
      <form action={archiveCareerAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Eliminá esta carrera (la archiva; no borra su historial)
        </button>
      </form>
    </main>
  );
}
