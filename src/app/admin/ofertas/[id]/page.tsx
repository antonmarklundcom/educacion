import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { listAllCampusOptions, listAllProgramOptions } from '@/db/queries/admin/options';
import { getOfferingForEdit } from '@/db/queries/admin/offerings';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveOfferingAction, updateOfferingAction } from '../actions';
import { offeringFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditOfferingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const offering = await getOfferingForEdit(user, id);
  if (!offering) notFound();

  const [programs, campuses] = await Promise.all([listAllProgramOptions(), listAllCampusOptions()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá esta oferta</h1>
      <AdminForm
        fields={offeringFields(programs, campuses)}
        defaultValues={{ ...offering }}
        action={updateOfferingAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/ofertas"
      />
      <form action={archiveOfferingAction.bind(null, id)} className="border-border border-t pt-6">
        <button type="submit" className="text-danger text-sm underline underline-offset-4">
          Eliminá esta oferta (la archiva; no borra su historial)
        </button>
      </form>
    </main>
  );
}
