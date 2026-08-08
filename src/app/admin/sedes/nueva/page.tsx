import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listCityOptions, listInstitutionOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createCampusAction } from '../actions';
import { campusFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewCampusPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const [institutions, cities] = await Promise.all([listInstitutionOptions(), listCityOptions()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Agregá una sede</h1>
      <AdminForm
        fields={campusFields(institutions, cities)}
        action={createCampusAction}
        submitLabel="Guardá"
        cancelHref="/admin/sedes"
      />
    </main>
  );
}
