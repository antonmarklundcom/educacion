import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BulkVerifyForm } from '@/components/admin/BulkVerifyForm';
import { countOfferingsWithoutAdmissions } from '@/db/queries/admin/admissions';
import { countOpenConflicts } from '@/db/queries/admin/conflicts';
import { PRICE_WARNING_DAYS, listStalePrices, stalenessCounts } from '@/db/queries/admin/staleness';
import { PRICE_MAX_AGE_MONTHS } from '@/db/invariants';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { bulkVerifyAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

function Stat({
  value,
  label,
  detail,
  tone = 'neutral',
}: {
  value: number;
  label: string;
  detail: string;
  tone?: 'neutral' | 'warn' | 'danger';
}) {
  const border =
    tone === 'danger' ? 'border-danger/40' : tone === 'warn' ? 'border-warn/40' : 'border-border';
  return (
    <div className={`bg-surface flex flex-col gap-1 rounded-md border p-4 ${border}`}>
      <span className="text-ink font-mono text-2xl font-semibold">
        {value.toLocaleString('es-PY')}
      </span>
      <span className="text-ink text-sm font-medium">{label}</span>
      <span className="text-muted text-xs">{detail}</span>
    </div>
  );
}

/**
 * What has gone stale, and the one action that fixes it.
 *
 * The numbers here are the honest state of the dataset — the thing `plan.md` §6
 * calls the actual bottleneck. Two of them are not opinions but consequences:
 * an arancel past 12 months **is already hidden** from the comparador, the
 * JSON-LD and the OG images, so `pricesExpired` is a count of carreras
 * currently showing "Consultá el arancel" where we used to have a number.
 *
 * PR-33 owns the automated half of this (the weekly digest, the cron, the
 * public "última actualización" surfaces). This is the manual half, which has
 * to exist first: there is no point scheduling a reminder about a queue nobody
 * can work.
 */
export default async function StalenessPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }

  const [counts, stalePrices, openConflicts, offeringsWithoutAdmissions] = await Promise.all([
    stalenessCounts(user),
    listStalePrices(user, { limit: 50 }),
    countOpenConflicts(user),
    countOfferingsWithoutAdmissions(user),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Frescura de los datos</h1>
        <p className="text-muted max-w-prose text-sm">
          Un arancel con más de {PRICE_MAX_AGE_MONTHS} meses no se muestra en ninguna parte — ni en
          el comparador, ni en el JSON-LD, ni en las imágenes que se comparten por WhatsApp. Estos
          números son lo que hoy dejamos de mostrar.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          value={counts.pricesExpired}
          label="Aranceles vencidos"
          detail="Ya ocultos en el sitio. Se ve “Consultá el arancel”."
          tone="danger"
        />
        <Stat
          value={counts.pricesExpiringSoon}
          label="Vencen pronto"
          detail={`Se ocultan dentro de ${PRICE_WARNING_DAYS} días.`}
          tone="warn"
        />
        <Stat
          value={counts.pricesNeverVerified}
          label="Nunca verificados"
          detail="Cargados sin fecha de verificación: tampoco se muestran."
          tone="danger"
        />
        <Stat
          value={counts.offeringsWithoutPrice}
          label="Ofertas sin arancel"
          detail="Publicadas y sin ningún precio cargado."
        />
        <Stat
          value={counts.accreditationsStale}
          label="Acreditaciones sin revisar"
          detail="Afirman algo y no se revisan hace más de 12 meses."
          tone="warn"
        />
        <Stat
          value={counts.admissionsClosed}
          label="Convocatorias vencidas"
          detail="Siguen activas con la fecha de cierre pasada."
          tone="warn"
        />
        <Stat
          value={offeringsWithoutAdmissions}
          label="Ofertas sin convocatoria"
          detail="Sin ventana cargada el estado de inscripción queda “Sin datos”."
        />
        <Stat
          value={openConflicts}
          label="Conflictos de importación"
          detail="Esperando una decisión en /admin/moderacion."
          tone={openConflicts > 0 ? 'warn' : 'neutral'}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-ink text-lg font-semibold">Reverificación de aranceles</h2>
          <p className="text-muted max-w-prose text-sm">
            Los más viejos primero. Los que nunca se verificaron encabezan la lista.
          </p>
        </div>
        <BulkVerifyForm rows={stalePrices} action={bulkVerifyAction} />
      </section>
    </main>
  );
}
