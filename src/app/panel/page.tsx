import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { getOwnInstitution } from '@/db/queries/panel/catalog';
import { panelDashboard } from '@/db/queries/panel/dashboard';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

function Stat({
  value,
  label,
  detail,
  href,
  tone = 'neutral',
}: {
  value: number;
  label: string;
  detail: string;
  href?: string;
  tone?: 'neutral' | 'warn' | 'danger';
}) {
  const border =
    tone === 'danger' ? 'border-danger/40' : tone === 'warn' ? 'border-warn/40' : 'border-border';
  const body = (
    <>
      <span className="text-ink font-mono text-2xl font-semibold">
        {value.toLocaleString('es-PY')}
      </span>
      <span className="text-ink text-sm font-medium">{label}</span>
      <span className="text-muted text-xs">{detail}</span>
    </>
  );
  const className = `bg-surface flex flex-col gap-1 rounded-md border p-4 ${border}`;
  return href ? (
    <Link href={href} className={`${className} hover:bg-card-alt`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * The panel's front door.
 *
 * Every number is a fact about this institution's own rows. The two that lead
 * are the two the institution — and nobody else — can fix in five minutes:
 * carreras with no arancel published, and aranceles that have gone past 12
 * months and are therefore *already hidden* on their own pages.
 */
export default async function PanelPage() {
  const user = await currentUser();

  let stats;
  let profile;
  try {
    [stats, profile] = await Promise.all([panelDashboard(user), getOwnInstitution(user)]);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  const needsAttention = stats.offeringsWithoutPrice + stats.pricesExpired;

  return (
    <>
      <PanelNav current="/panel" />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-ink text-2xl font-bold">{profile?.nameShort ?? 'Tu institución'}</h1>
          <p className="text-muted max-w-prose text-sm">
            Esto es lo que publicamos de tu institución hoy. Los datos que cargues acá se ven en el
            sitio y en el comparador.
          </p>
        </div>

        {needsAttention > 0 && (
          <section className="border-warn/40 bg-warn-bg flex flex-col gap-2 rounded-md border px-4 py-3">
            <h2 className="text-ink text-sm font-semibold">Lo más útil que podés hacer hoy</h2>
            <p className="text-body max-w-prose text-sm">
              {stats.offeringsWithoutPrice > 0 && (
                <>
                  Tenés <strong>{stats.offeringsWithoutPrice}</strong>{' '}
                  {stats.offeringsWithoutPrice === 1
                    ? 'oferta publicada sin arancel'
                    : 'ofertas publicadas sin arancel'}
                  .{' '}
                </>
              )}
              {stats.pricesExpired > 0 && (
                <>
                  Y <strong>{stats.pricesExpired}</strong>{' '}
                  {stats.pricesExpired === 1 ? 'arancel tiene' : 'aranceles tienen'} más de 12
                  meses, así que hoy no {stats.pricesExpired === 1 ? 'se muestra' : 'se muestran'}:
                  en su lugar el estudiante ve “Consultá el arancel”.{' '}
                </>
              )}
              El arancel es lo primero que compara una familia, y sos la única fuente confiable de
              ese número.
            </p>
            <Link
              href="/panel/ofertas"
              className="text-ink self-start text-sm font-medium underline underline-offset-4"
            >
              Cargá tus aranceles
            </Link>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            value={stats.programCount}
            label="Carreras"
            detail="Programas tuyos en el índice."
            href="/panel/carreras"
          />
          <Stat
            value={stats.publishedOfferings}
            label="Ofertas publicadas"
            detail={`${stats.offeringCount} en total, contando borradores.`}
            href="/panel/ofertas"
          />
          <Stat
            value={stats.offeringsWithoutPrice}
            label="Sin arancel"
            detail="Publicadas y sin ningún precio cargado."
            href="/panel/ofertas"
            tone={stats.offeringsWithoutPrice > 0 ? 'warn' : 'neutral'}
          />
          <Stat
            value={stats.pricesExpired}
            label="Aranceles vencidos"
            detail="Con más de 12 meses: hoy no se muestran."
            href="/panel/ofertas"
            tone={stats.pricesExpired > 0 ? 'danger' : 'neutral'}
          />
          <Stat
            value={stats.activeAdmissions}
            label="Convocatorias activas"
            detail="De acá sale el estado de inscripción."
            href="/panel/convocatorias"
          />
          <Stat
            value={stats.offeringViewsLast30}
            label="Vistas (30 días)"
            detail="Vistas de tus carreras, sin contar robots."
          />
          <Stat
            value={stats.whatsappClicksLast30}
            label="Clics a WhatsApp (30 días)"
            detail="Personas que abrieron un chat con ustedes."
          />
          <Stat
            value={stats.newLeads}
            label="Solicitudes sin responder"
            detail={`${stats.leadsLast30} llegaron en los últimos 30 días.`}
            href="/panel/leads"
          />
        </section>

        {stats.openReviewRequests > 0 && (
          <p className="text-muted text-sm">
            Tenés {stats.openReviewRequests}{' '}
            {stats.openReviewRequests === 1 ? 'cambio esperando' : 'cambios esperando'} nuestra
            revisión. Te avisamos cuando los revisemos.
          </p>
        )}

        <p className="text-faint max-w-prose text-xs">
          Las vistas y los clics se cuentan del lado del navegador, así que un robot o un chequeo
          automático no suma. Si el número te parece bajo, es porque no infla.
        </p>
      </main>
    </>
  );
}
