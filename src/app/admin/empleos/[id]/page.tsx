import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getJobForEdit } from '@/db/queries/admin/jobs';
import { listCareerOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveJobAction, updateJobAction } from '../actions';
import { jobFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [job, careers] = await Promise.all([getJobForEdit(user, id), listCareerOptions()]);
  if (!job) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá el aviso</h1>
      <AdminForm
        fields={jobFields(careers)}
        defaultValues={{ ...job }}
        action={updateJobAction.bind(null, id)}
        submitLabel="Guardá los cambios"
        cancelHref="/admin/empleos"
      />
      <form action={archiveJobAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Archivá este aviso (deja de mostrarse)
        </button>
      </form>
    </main>
  );
}
