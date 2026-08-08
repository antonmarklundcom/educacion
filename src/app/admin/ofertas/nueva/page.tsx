import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listAllCampusOptions, listAllProgramOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createOfferingAction } from '../actions';
import { offeringFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewOfferingPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const [programs, campuses] = await Promise.all([listAllProgramOptions(), listAllCampusOptions()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Agregá una oferta</h1>
      <AdminForm
        fields={offeringFields(programs, campuses)}
        action={createOfferingAction}
        submitLabel="Guardá"
        cancelHref="/admin/ofertas"
      />
    </main>
  );
}
