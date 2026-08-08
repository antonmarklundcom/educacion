import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { Button, Select } from '@/components/ui';
import { listInstitutionOptions, listOfferingOptions } from '@/db/queries/admin/options';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createPriceAction } from '../actions';
import { priceFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Two steps, because one `<select>` of ~10 000 offerings is not a control.
 * Pick an institution, then pick among that institution's offerings — which is
 * also the order the person doing the relevamiento actually works in: they have
 * one university's price list in front of them.
 */
export default async function NewPricePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const params = await searchParams;
  const raw = params.institucion;
  const institutionId = Number(Array.isArray(raw) ? raw[0] : raw) || null;

  if (!institutionId) {
    const institutions = await listInstitutionOptions();
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="text-ink text-2xl font-bold">Cargá un arancel</h1>
        <form method="GET" className="flex flex-col gap-4">
          <Select id="institucion" name="institucion" label="¿De qué institución?" required>
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

  const offerings = await listOfferingOptions(institutionId);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-ink text-2xl font-bold">Cargá un arancel</h1>
      {offerings.length === 0 ? (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
          Esta institución todavía no tiene ofertas cargadas. Creá el programa y la oferta primero.
        </p>
      ) : (
        <AdminForm
          fields={priceFields(offerings)}
          defaultValues={{ currency: 'PYG', source: 'web_publica' }}
          action={createPriceAction}
          submitLabel="Guardá el arancel"
          cancelHref="/admin/aranceles"
        />
      )}
    </main>
  );
}
