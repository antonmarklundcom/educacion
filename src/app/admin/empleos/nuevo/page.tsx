import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listCareerOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createJobAction } from '../actions';
import { jobFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewJobPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const careers = await listCareerOptions();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Cargá un aviso</h1>
      <AdminForm
        fields={jobFields(careers)}
        defaultValues={{ status: 'published', source: 'manual' }}
        action={createJobAction}
        submitLabel="Guardá el aviso"
        cancelHref="/admin/empleos"
      />
    </main>
  );
}
