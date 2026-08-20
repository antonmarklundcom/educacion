'use client';

/**
 * Client component justification (CLAUDE.md rule 6): this is a two-step flow
 * whose intermediate state — a real person's phone number and the leads it
 * matched — must not reach a URL, a cookie or the server log (see
 * `actions.ts`). `useActionState` is what holds a result across the two steps
 * without a navigation. Nothing else on the screen is interactive.
 */

import { useActionState } from 'react';

import { Badge, Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { LEAD_STATUS_LABELS } from '@/lib/leads/labels';

import {
  deletePersonalDataAction,
  findPersonalDataAction,
  type PersonalDataState,
} from './actions';

export function DeletionTool({ contactEmail }: { contactEmail: string }) {
  const [found, findAction] = useActionState<PersonalDataState, FormData>(
    findPersonalDataAction,
    {},
  );
  const [removed, deleteAction] = useActionState<PersonalDataState, FormData>(
    deletePersonalDataAction,
    {},
  );

  // Once a deletion has run, the matches on screen describe rows that no longer
  // exist — and they are the contact details of somebody who has just asked us
  // to hold less of them. The table goes away with the deletion, and the
  // operator searches again to confirm nothing is left.
  const done = removed.deleted != null;
  const matches = done ? [] : (found.matches ?? []);
  const searched = !done && found.matches != null;

  return (
    <div className="flex flex-col gap-6">
      <form
        action={findAction}
        className="border-border bg-card-alt flex flex-col gap-4 rounded-md border p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink font-medium">Teléfono</span>
            <input
              type="tel"
              name="phone"
              defaultValue={found.phone ?? ''}
              autoComplete="off"
              placeholder="0981 123 456"
              className="border-border-strong bg-surface text-ink min-h-11 rounded-md border px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink font-medium">Correo</span>
            <input
              type="email"
              name="email"
              defaultValue={found.email ?? ''}
              autoComplete="off"
              className="border-border-strong bg-surface text-ink min-h-11 rounded-md border px-3"
            />
          </label>
        </div>
        <p className="text-muted text-sm">
          Se busca por coincidencia exacta, no por parte del número. Podés poner los dos: se listan
          las solicitudes que coincidan con cualquiera de ellos.
        </p>
        <div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </div>
      </form>

      {found.error && (
        <p role="alert" className="text-danger text-sm">
          {found.error}
        </p>
      )}

      {searched && matches.length === 0 && (
        <div className="border-border bg-surface rounded-md border px-4 py-3">
          <p className="text-ink text-sm font-medium">No hay solicitudes con esos datos.</p>
          <p className="text-muted mt-1 text-sm">
            {found.totalLeads?.toLocaleString('es-PY') ?? '—'} solicitudes en total, ninguna de esta
            persona. Respondele que no tenemos nada suyo — y acordate de que la purga automática de
            24 meses puede haberlas borrado ya.
          </p>
        </div>
      )}

      {matches.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="text-ink text-lg font-semibold">
            {matches.length} {matches.length === 1 ? 'solicitud' : 'solicitudes'}
          </h3>
          <div className="border-border overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-border bg-card-alt border-b text-left">
                  <th className="text-muted px-4 py-3 font-medium">Nombre</th>
                  <th className="text-muted px-4 py-3 font-medium">Contacto</th>
                  <th className="text-muted px-4 py-3 font-medium">Institución</th>
                  <th className="text-muted px-4 py-3 font-medium">Estado</th>
                  <th className="text-muted px-4 py-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id} className="border-border border-b last:border-b-0">
                    <td className="text-ink px-4 py-3">{match.name}</td>
                    <td className="text-body px-4 py-3 font-mono text-xs">
                      {match.phoneE164}
                      {match.email && (
                        <>
                          <br />
                          {match.email}
                        </>
                      )}
                    </td>
                    <td className="text-body px-4 py-3">{match.institutionName}</td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{LEAD_STATUS_LABELS[match.status]}</Badge>
                    </td>
                    <td className="text-body px-4 py-3 font-mono text-xs">
                      {formatDate(match.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            action={deleteAction}
            className="border-danger/40 bg-surface flex flex-col gap-3 rounded-md border p-4"
          >
            <input type="hidden" name="phone" value={found.phone ?? ''} />
            <input type="hidden" name="email" value={found.email ?? ''} />
            <p className="text-ink text-sm font-medium">Borrar estas solicitudes</p>
            <p className="text-muted text-sm">
              Se borran las filas de nuestra base y queda registrado en la actividad quién lo hizo y
              cuántas eran — nunca los datos borrados. No se puede deshacer.{' '}
              <strong className="text-ink">
                La institución ya recibió una copia por correo cuando se envió la solicitud: eso no
                lo podemos borrar
              </strong>{' '}
              — decíselo así al que la pidió, y reenviale el pedido a la institución desde{' '}
              {contactEmail}.
            </p>
            <label className="text-body flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" className="mt-1 size-4" />
              <span>Confirmo que esta persona pidió el borrado de sus datos.</span>
            </label>
            <div>
              <Button
                type="submit"
                variant="secondary"
                className="border-danger/50 text-danger hover:bg-danger/5"
              >
                Borrar {matches.length} {matches.length === 1 ? 'solicitud' : 'solicitudes'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {removed.error && (
        <p role="alert" className="text-danger text-sm">
          {removed.error}
        </p>
      )}

      {removed.deleted != null && (
        <div className="border-ok/40 bg-surface rounded-md border px-4 py-3">
          <p className="text-ink text-sm font-medium">
            {removed.deleted === 0
              ? 'No quedaba nada para borrar.'
              : `Se borraron ${removed.deleted} ${removed.deleted === 1 ? 'solicitud' : 'solicitudes'}.`}
          </p>
          <p className="text-muted mt-1 text-sm">
            Quedó asentado en <span className="font-mono">/admin/actividad</span>. Volvé a buscar
            para confirmar que no queda nada.
          </p>
        </div>
      )}
    </div>
  );
}
