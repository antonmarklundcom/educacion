import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listCareerOptions, listInstitutionOptions } from '@/db/queries/admin/options';
import { getProgramForEdit } from '@/db/queries/admin/programs';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveProgramAction, updateProgramAction } from '../actions';
import { programFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const program = await getProgramForEdit(user, id);
  if (!program) notFound();

  const [institutions, careers] = await Promise.all([
    listInstitutionOptions(),
    listCareerOptions(),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá {program.nameOfficial}</h1>
      <AdminForm
        fields={programFields(institutions, careers)}
        defaultValues={{ ...program }}
        action={updateProgramAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/programas"
      />
      <form action={archiveProgramAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Eliminá este programa (lo archiva; no borra su historial)
        </button>
      </form>
    </main>
  );
}
