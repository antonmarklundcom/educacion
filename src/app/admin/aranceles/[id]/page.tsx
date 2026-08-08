import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { getPriceForEdit, listPriceHistory } from '@/db/queries/admin/prices';
import { listOfferingOptions } from '@/db/queries/admin/options';
import { offeringInstitutionId } from '@/db/queries/admin/offerings-lookup';
import { formatDate, formatGs } from '@/lib/format';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { retirePriceAction, updatePriceAction } from '../actions';
import { priceFields } from '../fields';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Editing here is a **correction** — fixing a row that should never have said
 * what it says. Recording a *new* arancel is "Cargá un arancel", which
 * supersedes this row and keeps it as history. The page says so, because the
 * difference is invisible from the form and expensive to get wrong: an edit
 * destroys the record of what we published last year, which is exactly what an
 * institution disputing a price asks about.
 */
export default async function EditPricePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const price = await getPriceForEdit(user, id);
  if (!price) notFound();

  const institutionId = await offeringInstitutionId(price.offeringId);
  const [offerings, history] = await Promise.all([
    institutionId ? listOfferingOptions(institutionId) : Promise.resolve([]),
    listPriceHistory(user, price.offeringId),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Corregí este arancel</h1>
        <p className="text-muted max-w-prose text-sm">
          Esto corrige la fila, no registra un arancel nuevo. Si el precio cambió, cargá uno nuevo:
          el actual pasa a ser historial y queda el registro de lo que publicábamos antes.
        </p>
      </div>

      <AdminForm
        fields={priceFields(offerings)}
        defaultValues={{ ...price }}
        action={updatePriceAction.bind(null, id)}
        submitLabel="Guardá la corrección"
        cancelHref="/admin/aranceles"
      />

      {price.isCurrent && (
        <form action={retirePriceAction.bind(null, id)} className="border-border border-t pt-6">
          <button type="submit" className="text-danger text-sm underline underline-offset-4">
            Dejá de publicar este arancel (queda como historial; la carrera pasa a “Consultá el
            arancel”)
          </button>
        </form>
      )}

      <section className="border-border flex flex-col gap-2 border-t pt-6">
        <h2 className="text-ink text-lg font-semibold">Historial de esta oferta</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {history.map((row) => (
            <li key={row.id} className="text-body flex flex-wrap gap-x-3">
              <span className="font-mono">
                {row.isFree
                  ? 'Gratuita'
                  : row.annualCost != null
                    ? formatGs(row.annualCost)
                    : 'Sin datos'}
              </span>
              <span className="text-muted">
                {row.verifiedAt ? `verificado ${formatDate(row.verifiedAt)}` : 'sin verificar'}
              </span>
              {row.isCurrent && <span className="text-ok">actual</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
