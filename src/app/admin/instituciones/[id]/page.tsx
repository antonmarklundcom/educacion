import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getInstitutionForEdit } from '@/db/queries/admin/institutions';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { archiveInstitutionAction, updateInstitutionAction } from '../actions';
import { institutionFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EditInstitutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const institution = await getInstitutionForEdit(user, id);
  if (!institution) notFound();

  const query = await searchParams;
  const logoError = typeof query.logoError === 'string' ? query.logoError : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Editá {institution.nameShort}</h1>
        {institution.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external host, decided per R-08
          <img
            src={institution.logoUrl}
            alt={`Logo de ${institution.nameShort}`}
            width={64}
            height={64}
            className="mt-3 size-16 rounded-md border border-border object-contain"
          />
        )}
      </div>

      {logoError && (
        <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          La institución se guardó, pero el logo no se pudo subir: {logoError}
        </p>
      )}

      <AdminForm
        fields={institutionFields()}
        defaultValues={{ ...institution, foundedYear: institution.foundedYear ?? undefined }}
        action={updateInstitutionAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/instituciones"
      />

      <form action={archiveInstitutionAction.bind(null, id)} className="border-t border-border pt-6">
        <button
          type="submit"
          className="text-sm text-danger underline underline-offset-4"
        >
          Eliminá esta institución (la archiva; no borra su historial)
        </button>
      </form>
    </main>
  );
}
