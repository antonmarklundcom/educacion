import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getAccreditationForEdit } from '@/db/queries/admin/accreditations';
import {
  listAllProgramOptions,
  listInstitutionOptions,
  listOfferingOptions,
} from '@/db/queries/admin/options';
import { offeringInstitutionId } from '@/db/queries/admin/offerings-lookup';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { retractAccreditationAction, updateAccreditationAction } from '../actions';
import { accreditationFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditAccreditationPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const accreditation = await getAccreditationForEdit(user, id);
  if (!accreditation) notFound();

  const scopedInstitutionId =
    accreditation.institutionId ??
    (accreditation.offeringId ? await offeringInstitutionId(accreditation.offeringId) : null);

  const [institutions, programs, offerings] = await Promise.all([
    listInstitutionOptions(),
    listAllProgramOptions(),
    scopedInstitutionId ? listOfferingOptions(scopedInstitutionId) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá esta acreditación</h1>
      <AdminForm
        fields={accreditationFields(institutions, programs, offerings)}
        defaultValues={{ ...accreditation }}
        action={updateAccreditationAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/acreditaciones"
      />
      <form
        action={retractAccreditationAction.bind(null, id)}
        className="border-border flex flex-col gap-2 border-t pt-6"
      >
        <p className="text-muted max-w-prose text-sm">
          Retirar la afirmación deja el estado en “Sin datos”. La fila, su resolución y su fuente
          quedan: es la procedencia de algo que llegamos a publicar, y una institución que reclama
          tiene derecho a verla.
        </p>
        <button
          type="submit"
          className="text-danger self-start text-sm underline underline-offset-4"
        >
          Retirá esta afirmación
        </button>
      </form>
    </main>
  );
}
