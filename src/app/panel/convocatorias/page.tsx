import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PanelNav } from '@/components/panel/PanelNav';
import { Badge } from '@/components/ui';
import { deriveEnrollmentStatus, todayIso } from '@/db/queries/admin/admissions';
import { listOwnAdmissions } from '@/db/queries/panel/catalog';
import { ENROLLMENT_STATUS_LABELS } from '@/lib/search/labels';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const TONE = {
  abiertas: 'ok',
  proximamente: 'warn',
  cerradas: 'danger',
  sin_datos: 'neutral',
} as const;

export default async function PanelAdmissionsPage() {
  const user = await currentUser();

  let admissions;
  try {
    admissions = await listOwnAdmissions(user);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  const today = todayIso();

  return (
    <>
      <PanelNav current="/panel/convocatorias" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-ink text-2xl font-bold">Convocatorias</h1>
          <p className="text-muted max-w-prose text-sm">
            De estas fechas sale el cartel de “Inscripciones abiertas” en tus carreras. Sin fechas
            cargadas decimos “Sin datos”, nunca “cerradas”: no afirmamos algo que no verificamos.
          </p>
        </div>

        {admissions.length === 0 ? (
          <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
            Todavía no cargamos ninguna convocatoria tuya. Escribinos con las fechas de tu próximo
            llamado y las publicamos.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {admissions.map((admission) => {
              const status = deriveEnrollmentStatus(admission, today);
              return (
                <li
                  key={admission.id}
                  className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="text-ink block font-medium">{admission.periodLabel}</span>
                    <span className="text-muted block text-sm">
                      {admission.programName ?? 'Toda la institución'} ·{' '}
                      {admission.registrationOpens ?? '—'} → {admission.registrationCloses ?? '—'}
                    </span>
                  </span>
                  <Badge tone={TONE[status]}>{ENROLLMENT_STATUS_LABELS[status]}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
