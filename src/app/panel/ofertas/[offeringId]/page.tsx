import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PanelForm } from '@/components/panel/PanelForm';
import { PanelNav } from '@/components/panel/PanelNav';
import { getOwnCurrentPrice, getOwnOffering } from '@/db/queries/panel/catalog';
import { priceFreshness } from '@/db/invariants';
import { MODALITY } from '@/db/schema';
import { panelCopy } from '@/lib/copy/panel';
import { formatMonthYear } from '@/lib/format';
import { MODALITY_LABELS } from '@/lib/search/labels';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { savePanelOfferingAction, savePanelPriceAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const input =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

export default async function PanelOfferingPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const user = await currentUser();
  const { offeringId: raw } = await params;
  const offeringId = Number(raw);
  if (!Number.isInteger(offeringId) || offeringId <= 0) notFound();

  let offering;
  let price;
  try {
    [offering, price] = await Promise.all([
      getOwnOffering(user, offeringId),
      getOwnCurrentPrice(user, offeringId),
    ]);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }
  if (!offering) notFound();

  // Two states, not one: an arancel past 12 months, and one we never had a date
  // for. `?? new Date()` printed *today* as the verification date for the
  // second — a fabricated fact told to the institution that gave us the number
  // (CLAUDE.md rule 1). Fixed in PR-48b.
  const isFresh = priceFreshness(price?.verifiedAt ?? null) === 'fresh';

  return (
    <>
      <PanelNav current="/panel/ofertas" />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link href="/panel/ofertas" className="text-muted hover:text-ink text-sm">
            ← Sedes y aranceles
          </Link>
          <h1 className="text-ink text-2xl font-bold">{offering.programName}</h1>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-ink text-lg font-semibold">Arancel</h2>
          {price && !isFresh && (
            <p className="border-warn/40 bg-warn-bg text-body rounded-md border px-4 py-3 text-sm">
              {price.verifiedAt ? (
                <>
                  El último arancel que cargaste es de {formatMonthYear(price.verifiedAt)}. Como
                  pasó de 12 meses, hoy se muestra con un aviso de que está desactualizado.
                </>
              ) : (
                <>
                  No tenemos fecha de verificación de este arancel, así que hoy se muestra con un
                  aviso de que está desactualizado.
                </>
              )}{' '}
              Cargalo de nuevo y el aviso desaparece al instante.
            </p>
          )}
          <PanelForm
            action={savePanelPriceAction.bind(null, offeringId)}
            submitLabel="Publicá el arancel"
            note="Esto se publica al instante: sos la fuente del dato. Guardamos el anterior como historial, así que nunca perdemos lo que publicábamos antes."
          >
            <label className="text-body flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isFree"
                defaultChecked={price?.isFree ?? false}
                className="border-border-strong accent-ink size-5 rounded"
              />
              Esta carrera es gratuita
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Matrícula (Gs.)
                <input name="matricula" defaultValue={price?.matricula ?? ''} className={input} />
              </label>
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Cuota mensual (Gs.)
                <input name="monthlyFee" defaultValue={price?.monthlyFee ?? ''} className={input} />
              </label>
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Cuotas por año
                <input
                  name="installmentsPerYear"
                  type="number"
                  min={1}
                  max={24}
                  defaultValue={price?.installmentsPerYear ?? ''}
                  className={input}
                />
              </label>
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Derecho de examen / CPI (Gs.)
                <input
                  name="admissionFee"
                  defaultValue={price?.admissionFee ?? ''}
                  className={input}
                />
              </label>
            </div>

            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Notas (“incluye materiales”, “arancel diferenciado”)
              <textarea
                name="notesMd"
                rows={3}
                defaultValue={price?.notesMd ?? ''}
                className={`${input} min-h-20 py-2`}
              />
            </label>
          </PanelForm>
        </section>

        <section className="border-border flex flex-col gap-3 border-t pt-6">
          <h2 className="text-ink text-lg font-semibold">Datos de la oferta</h2>
          <PanelForm
            action={savePanelOfferingAction.bind(null, offeringId)}
            submitLabel="Guardá"
            note={panelCopy.offering.note}
          >
            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Plan de estudio (URL)
              <input name="planUrl" defaultValue={offering.planUrl ?? ''} className={input} />
            </label>
            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Créditos
              <input
                name="credits"
                type="number"
                defaultValue={offering.credits ?? ''}
                className={input}
              />
            </label>
            {/*
              The correction path for PR-59's `sin_datos`. CONES no longer
              prints a modality, so most offerings arrive without one and the
              institution is the only party that actually knows. It is a
              REVIEW_FIELD, so this proposes rather than publishes — the same
              gate as the nombre oficial, for the same reason.
            */}
            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              {panelCopy.offering.modalityLabel}
              <select name="modality" defaultValue={offering.modality} className={input}>
                {MODALITY.map((value) => (
                  <option key={value} value={value}>
                    {MODALITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Duración (meses)
              <input
                name="durationMonths"
                type="number"
                defaultValue={offering.durationMonths ?? ''}
                className={input}
              />
            </label>
          </PanelForm>
        </section>
      </main>
    </>
  );
}
