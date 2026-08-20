/**
 * `/admin/privacidad` — executing an R-06 deletion request (PR-44).
 *
 * `risks.md` §R-06 promises every person who submits a form that they can ask
 * us to delete their data, and keeps the *request* channel a human one on
 * purpose: there is no student account, so nothing on the public site can prove
 * that the person asking is the person in the row. That decision stands and
 * this screen does not change it.
 *
 * What it changes is the *execution*. Until now, honouring a request meant
 * opening phpMyAdmin and writing a `DELETE` by hand — unlogged, unverified, one
 * typo away from deleting somebody else's data, and with no way to answer
 * "did we actually do it?" a month later. Now it is a lookup, a confirmation
 * and an audit entry.
 *
 * `admin`, not `editor`: this is the only screen in the app that destroys data
 * irreversibly, and a curator has no reason to reach it. A missing role gets a
 * 404 — the screen's existence is not information they need — and every query
 * behind it refuses them again server-side (CLAUDE.md rule 4).
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { CONTACT_EMAIL, DATA_REQUEST_RESPONSE_WORKING_DAYS } from '@/lib/legal/contact';
import { LEAD_RETENTION_MONTHS } from '@/lib/freshness/jobs';

import { DeletionTool } from './DeletionTool';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PrivacyToolsPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['admin']);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Datos personales</h1>
        <p className="text-muted max-w-prose text-sm">
          Alguien escribió a {CONTACT_EMAIL} pidiendo que borremos sus datos. Buscalo por el
          teléfono o el correo que puso en el formulario, mirá qué solicitudes son suyas y borralas.
          El plazo que prometemos en /legal/privacidad es de {DATA_REQUEST_RESPONSE_WORKING_DAYS}{' '}
          días hábiles.
        </p>
      </div>

      <section className="border-border bg-card-alt rounded-md border px-4 py-3">
        <h2 className="text-ink text-sm font-medium">Antes de borrar</h2>
        <ul className="text-muted mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>
            Confirmá que el pedido viene de la misma dirección o del mismo número que figura en la
            solicitud. No tenemos otra forma de probar quién es.
          </li>
          <li>
            Las solicitudes de más de {LEAD_RETENTION_MONTHS} meses ya se borran solas todas las
            noches. Si no aparece nada, puede ser eso.
          </li>
          <li>
            La institución recibió una copia por correo el día que se envió. Eso no está en nuestra
            base y no lo podemos borrar: reenviale el pedido y decíselo así a la persona.
          </li>
        </ul>
      </section>

      <DeletionTool contactEmail={CONTACT_EMAIL} />
    </main>
  );
}
