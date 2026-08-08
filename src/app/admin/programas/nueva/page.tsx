import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listCareerOptions, listInstitutionOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createProgramAction } from '../actions';
import { programFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewProgramPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const [institutions, careers] = await Promise.all([
    listInstitutionOptions(),
    listCareerOptions(),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Agregá un programa</h1>
      <AdminForm
        fields={programFields(institutions, careers)}
        action={createProgramAction}
        submitLabel="Guardá"
        cancelHref="/admin/programas"
      />
    </main>
  );
}
