import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AccreditationDisputeForm } from '@/components/panel/AccreditationDisputeForm';
import { Badge } from '@/components/ui';
import { PanelForm } from '@/components/panel/PanelForm';
import { PanelNav } from '@/components/panel/PanelNav';
import { getOwnProgram, listOwnOfferings } from '@/db/queries/panel/catalog';
import { listDisputableAccreditations } from '@/db/queries/panel/disputes';
import { PROGRAM_LEVEL } from '@/db/schema';
import { REVIEW_FIELDS } from '@/lib/panel/review';
import {
  ACCREDITATION_STATUS_LABELS,
  LEVEL_LABELS,
  MODALITY_LABELS,
  SHIFT_LABELS,
} from '@/lib/search/labels';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { savePanelProgramAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const inputClasses =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

export default async function PanelProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const user = await currentUser();
  const { programId: raw } = await params;
  const programId = Number(raw);
  if (!Number.isInteger(programId) || programId <= 0) notFound();

  let program;
  let offerings;
  try {
    [program, offerings] = await Promise.all([
      getOwnProgram(user, programId),
      listOwnOfferings(user, { programId }),
    ]);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }
  // Scoped by institution in the query, so another institution's programme is
  // indistinguishable from one that does not exist — deliberately.
  if (!program) notFound();

  // Fetched only once ownership is confirmed above, so a cross-institution id
  // still 404s instead of surfacing `listDisputableAccreditations`'s
  // `AuthError` as a redirect — the same "looks like it doesn't exist"
  // behaviour the rest of this page already has.
  const accreditations = await listDisputableAccreditations(user, programId);

  return (
    <>
      <PanelNav current="/panel/carreras" />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link href="/panel/carreras" className="text-muted hover:text-ink text-sm">
            ← Mis carreras
          </Link>
          <h1 className="text-ink text-2xl font-bold">{program.nameOfficial}</h1>
        </div>

        <PanelForm
          action={savePanelProgramAction.bind(null, programId)}
          submitLabel="Guardá"
          note={`La descripción y el título se publican al instante. El nombre oficial, el nivel y la resolución vienen del registro del CONES: si los cambiás, los revisamos antes de publicarlos (${REVIEW_FIELDS.program.length} campos).`}
        >
          <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
            Descripción de la carrera
            <textarea
              name="descriptionMd"
              rows={8}
              defaultValue={program.descriptionMd ?? ''}
              placeholder="Contale a un estudiante de 17 años qué va a estudiar y para qué sirve."
              className={`${inputClasses} min-h-40 py-2`}
            />
          </label>

          <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
            Título que otorga
            <input
              name="titleAwarded"
              defaultValue={program.titleAwarded ?? ''}
              maxLength={320}
              className={inputClasses}
            />
          </label>

          <fieldset className="border-border flex flex-col gap-4 rounded-md border p-4">
            <legend className="text-muted px-1 text-xs">
              Estos vienen del registro público — los cambios pasan por revisión
            </legend>

            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Nombre oficial
              <input
                name="nameOfficial"
                defaultValue={program.nameOfficial}
                maxLength={320}
                className={inputClasses}
              />
            </label>

            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Nivel
              <select name="level" defaultValue={program.level} className={inputClasses}>
                {PROGRAM_LEVEL.map((value) => (
                  <option key={value} value={value}>
                    {LEVEL_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
              Resolución del CONES
              <input
                name="conesResolution"
                defaultValue={program.conesResolution ?? ''}
                maxLength={120}
                className={inputClasses}
              />
            </label>
          </fieldset>
        </PanelForm>

        <section className="border-border flex flex-col gap-3 border-t pt-6">
          <h2 className="text-ink text-lg font-semibold">Sedes y turnos</h2>
          {offerings.length === 0 ? (
            <p className="text-muted text-sm">Esta carrera no tiene ofertas cargadas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {offerings.map((offering) => (
                <li key={offering.id}>
                  <Link
                    href={`/panel/ofertas/${offering.id}`}
                    className="border-border bg-surface hover:bg-card-alt flex flex-wrap items-center justify-between gap-2 rounded-md border px-4 py-3 text-sm"
                  >
                    <span className="text-body">
                      {offering.campusName} · {MODALITY_LABELS[offering.modality]} ·{' '}
                      {SHIFT_LABELS[offering.shift]}
                    </span>
                    <span className={offering.priceId ? 'text-muted' : 'text-warn font-medium'}>
                      {offering.priceId ? 'Arancel cargado' : 'Sin arancel'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-border flex flex-col gap-3 border-t pt-6">
          <h2 className="text-ink text-lg font-semibold">Acreditación</h2>
          <p className="text-muted max-w-prose text-sm">
            Esto es lo que publicamos con fuente citada. Si algo está mal, disputalo: mientras lo
            revisamos, no lo mostramos en el sitio. No podés editarlo directamente — es lo que dice
            el registro público.
          </p>
          {accreditations.length === 0 ? (
            <p className="text-muted text-sm">
              No tenemos ningún dato de acreditación cargado para esta carrera o tu institución.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {accreditations.map((row) => (
                <li
                  key={row.id}
                  className="border-border bg-surface flex flex-col gap-2 rounded-md border px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body text-sm">
                      {row.agency} · {ACCREDITATION_STATUS_LABELS[row.status]}
                      {row.resolutionNumber ? ` · Res. ${row.resolutionNumber}` : ''}
                    </span>
                    {row.isDisputed && <Badge tone="warn">En revisión</Badge>}
                  </div>
                  {row.openDisputeId ? (
                    <p className="text-muted text-sm">
                      Ya enviaste una disputa para este registro. Te avisamos cuando la revisemos.
                    </p>
                  ) : (
                    <AccreditationDisputeForm accreditationId={row.id} programId={programId} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
