import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { Badge } from '@/components/ui';
import { listOwnOfferings } from '@/db/queries/panel/catalog';
import { priceFreshness } from '@/db/invariants';
import { formatGs } from '@/lib/format';
import { MODALITY_LABELS, SHIFT_LABELS } from '@/lib/search/labels';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Every offering the institution owns, sorted so the gaps are impossible to miss. */
export default async function PanelOfferingsPage() {
  const user = await currentUser();

  let offerings;
  try {
    offerings = await listOwnOfferings(user);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  // "Necesita atención" is now "no price at all, or a price the site is
  // showing with a staleness warning" — PR-33 reversed the hide rule, so the
  // consequence to fix changed from invisibility to a visible warning.
  const missing = offerings.filter(
    (o) => !o.priceId || priceFreshness(o.priceVerifiedAt) !== 'fresh',
  );
  const ok = offerings.filter((o) => o.priceId && priceFreshness(o.priceVerifiedAt) === 'fresh');

  return (
    <>
      <PanelNav current="/panel/ofertas" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-ink text-2xl font-bold">Sedes y aranceles</h1>
          <p className="text-muted max-w-prose text-sm">
            Un arancel se muestra desde que lo cargás. Pasados 12 meses lo seguimos mostrando, pero
            con un aviso de “dato desactualizado” y la fecha en que lo confirmaste, porque un precio
            viejo y fechado le sirve más al estudiante que ninguno.
          </p>
        </div>

        {missing.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-ink text-lg font-semibold">
              Necesitan un arancel ({missing.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {missing.map((offering) => (
                <li key={offering.id}>
                  <Link
                    href={`/panel/ofertas/${offering.id}`}
                    className="border-warn/40 bg-surface hover:bg-card-alt flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="text-ink block font-medium">{offering.programName}</span>
                      <span className="text-muted block text-sm">
                        {offering.campusName} · {offering.cityName} ·{' '}
                        {MODALITY_LABELS[offering.modality]} · {SHIFT_LABELS[offering.shift]}
                      </span>
                    </span>
                    <Badge tone="warn">{offering.priceId ? 'Vencido' : 'Sin arancel'}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-ink text-lg font-semibold">Con arancel vigente ({ok.length})</h2>
          {ok.length === 0 ? (
            <p className="text-muted text-sm">Todavía ninguna.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ok.map((offering) => (
                <li key={offering.id}>
                  <Link
                    href={`/panel/ofertas/${offering.id}`}
                    className="border-border bg-surface hover:bg-card-alt flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                  >
                    <span className="min-w-0">
                      <span className="text-ink block font-medium">{offering.programName}</span>
                      <span className="text-muted block text-sm">
                        {offering.campusName} · {MODALITY_LABELS[offering.modality]}
                      </span>
                    </span>
                    <span className="text-body font-mono text-sm">
                      {offering.isFree
                        ? 'Gratuita'
                        : offering.annualCost != null
                          ? `${formatGs(offering.annualCost)} / año`
                          : 'Sin costo anual'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
