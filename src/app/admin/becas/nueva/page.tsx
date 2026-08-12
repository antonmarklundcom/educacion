import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listAreaOptions, listInstitutionOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createBecaAction } from '../actions';
import { becaFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewBecaPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const [institutions, areas] = await Promise.all([listInstitutionOptions(), listAreaOptions()]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Cargá una beca</h1>
      <AdminForm
        fields={becaFields(institutions, areas)}
        defaultValues={{ status: 'draft', coverage: 'sin_datos' }}
        action={createBecaAction}
        submitLabel="Guardá la beca"
        cancelHref="/admin/becas"
      />
    </main>
  );
}
