import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getAdmissionForEdit } from '@/db/queries/admin/admissions';
import {
  listAllProgramOptions,
  listInstitutionOptions,
  listOfferingOptions,
} from '@/db/queries/admin/options';
import { offeringInstitutionId } from '@/db/queries/admin/offerings-lookup';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { deactivateAdmissionAction, updateAdmissionAction } from '../actions';
import { admissionFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditAdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const admission = await getAdmissionForEdit(user, id);
  if (!admission) notFound();

  const scopedInstitutionId =
    admission.institutionId ??
    (admission.offeringId ? await offeringInstitutionId(admission.offeringId) : null);

  const [institutions, programs, offerings] = await Promise.all([
    listInstitutionOptions(),
    listAllProgramOptions(),
    scopedInstitutionId ? listOfferingOptions(scopedInstitutionId) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Editá {admission.periodLabel}</h1>
      <AdminForm
        fields={admissionFields(institutions, programs, offerings)}
        defaultValues={{ ...admission }}
        action={updateAdmissionAction.bind(null, id)}
        submitLabel="Guardá"
        cancelHref="/admin/admisiones"
      />
      {admission.isActive && (
        <form
          action={deactivateAdmissionAction.bind(null, id)}
          className="border-border flex flex-col gap-2 border-t pt-6"
        >
          <p className="text-muted max-w-prose text-sm">
            Cerrarla la desactiva. Las ofertas que cubría vuelven a “Sin datos”, no a “Inscripciones
            cerradas”: dejamos de seguir esta ventana, no afirmamos que la inscripción esté cerrada.
          </p>
          <button
            type="submit"
            className="text-danger self-start text-sm underline underline-offset-4"
          >
            Cerrá esta convocatoria
          </button>
        </form>
      )}
    </main>
  );
}
