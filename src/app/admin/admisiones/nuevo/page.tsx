import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { Button, Select } from '@/components/ui';
import {
  listAllProgramOptions,
  listInstitutionOptions,
  listOfferingOptions,
} from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createAdmissionAction } from '../actions';
import { admissionFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewAdmissionPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const raw = params.institucion;
  const institutionId = Number(Array.isArray(raw) ? raw[0] : raw) || null;
  const institutions = await listInstitutionOptions();

  if (!institutionId) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="text-ink text-2xl font-bold">Cargá una convocatoria</h1>
        <form method="GET" className="flex flex-col gap-4">
          <Select id="institucion" name="institucion" label="Institución" required>
            <option value="">Seleccioná…</option>
            {institutions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <div>
            <Button type="submit">Seguí</Button>
          </div>
        </form>
      </main>
    );
  }

  const [programs, offerings] = await Promise.all([
    listAllProgramOptions(),
    listOfferingOptions(institutionId),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Cargá una convocatoria</h1>
      <AdminForm
        fields={admissionFields(institutions, programs, offerings)}
        defaultValues={{ institutionId, scope: 'institution', isActive: true }}
        action={createAdmissionAction}
        submitLabel="Guardá la convocatoria"
        cancelHref="/admin/admisiones"
      />
    </main>
  );
}
