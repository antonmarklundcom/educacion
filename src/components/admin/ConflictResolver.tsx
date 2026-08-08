'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` is what
 * shows the reason a resolution was refused — an uncited `vigente`, an empty
 * merge selection, a conflict somebody else already resolved — **without
 * losing the field selection the moderator just made**. Those refusals are the
 * point of this screen: a rule a human can click past is not a rule, so the
 * message has to land where the choice was made.
 *
 * It contains no decision. `resolveConflictAction` authorizes, and
 * `resolveConflict` writes through the importer's own path.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';

export interface ResolveState {
  error?: string;
}

export interface ConflictField {
  name: string;
  current: unknown;
  proposed: unknown;
  /** In `PROTECTED_FIELDS` — the reason this landed in the queue at all. */
  isProtected: boolean;
}

function render(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" name="decision" value="approve" disabled={pending}>
        {pending ? 'Aplicando…' : 'Aprobá los campos marcados'}
      </Button>
      <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
        Rechazá
      </Button>
    </div>
  );
}

export function ConflictResolver({
  entityType,
  isCreate,
  fields,
  action,
}: {
  entityType: string;
  isCreate: boolean;
  fields: ConflictField[];
  action: (state: ResolveState, formData: FormData) => Promise<ResolveState>;
}) {
  const [state, formAction] = useActionState<ResolveState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="entityType" value={entityType} />
      {/* Tells the action whether an empty `campo` list means "nothing ticked"
          or "this form never offered a choice". */}
      <input type="hidden" name="__hasFieldChoices" value={isCreate ? '0' : '1'} />

      {isCreate ? (
        <p className="border-border bg-card-alt text-body rounded-md border px-4 py-3 text-sm">
          Esto crea un registro nuevo. No hay campos que combinar: se aplica la propuesta entera o
          nada — una fila creada a medias no pasaría los NOT NULL.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink mb-1 text-sm font-semibold">
            ¿Qué campos tomamos de la fuente?
          </legend>
          {fields.length === 0 ? (
            <p className="text-muted text-sm">
              La fuente ya no difiere de lo que tenemos. Rechazá este conflicto: quedó viejo.
            </p>
          ) : (
            fields.map((field) => (
              <label
                key={field.name}
                className="border-border hover:bg-card-alt flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="campo"
                  value={field.name}
                  defaultChecked
                  className="border-border-strong accent-ink mt-0.5 size-5 rounded"
                />
                <span className="min-w-0 flex-1">
                  <span className="text-ink font-medium">{field.name}</span>
                  {field.isProtected && (
                    <span className="text-warn ml-2 text-xs">campo protegido</span>
                  )}
                  <span className="mt-1 grid gap-1 sm:grid-cols-2">
                    <span className="text-muted block break-words">
                      <span className="text-faint block text-xs">Ahora</span>
                      {render(field.current)}
                    </span>
                    <span className="text-body block font-medium break-words">
                      <span className="text-faint block text-xs">Propuesto</span>
                      {render(field.proposed)}
                    </span>
                  </span>
                </span>
              </label>
            ))
          )}
        </fieldset>
      )}

      <label className="text-body flex flex-col gap-1.5 text-sm">
        Nota (queda en el registro de la decisión)
        <textarea
          name="note"
          rows={2}
          className="border-border-strong bg-surface text-ink focus-visible:ring-ink min-h-16 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
      </label>

      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}

      <Buttons />
    </form>
  );
}
