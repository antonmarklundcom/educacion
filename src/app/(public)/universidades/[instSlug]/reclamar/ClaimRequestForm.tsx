'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` renders
 * the action's outcome — emailed, queued for review, refused — in place,
 * because the three answers are different enough that a redirect to a generic
 * "gracias" page would be a worse answer than any of them. `useFormStatus`
 * disables the button while the request is in flight; the action sends a mail,
 * so it is not instant and a form that looks inert gets double-submitted.
 *
 * No decision lives here. The action decides, this renders what it returns.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input, Textarea } from '@/components/ui';
import { requestClaimAction, type ClaimRequestState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enviando…' : 'Solicitá el acceso'}
    </Button>
  );
}

export function ClaimRequestForm({
  institutionSlug,
  expectedDomain,
}: {
  institutionSlug: string;
  /** The institution's own domain, when we have one. Never invented. */
  expectedDomain: string | null;
}) {
  const [state, formAction] = useActionState<ClaimRequestState, FormData>(
    requestClaimAction.bind(null, institutionSlug),
    {},
  );

  if (state.message) {
    return (
      <div
        role="status"
        className="border-border bg-card-alt text-body flex flex-col gap-2 rounded-lg border p-5 text-sm"
      >
        <p className="text-ink font-semibold">
          {state.queued ? 'Tu solicitud está en revisión' : 'Revisá tu correo'}
        </p>
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="contactName"
        name="contactName"
        label="Tu nombre y apellido"
        autoComplete="name"
        maxLength={160}
      />
      <Input
        id="email"
        name="email"
        type="email"
        label="Tu correo institucional"
        autoComplete="email"
        required
        maxLength={255}
      />
      {expectedDomain && (
        <p className="text-faint -mt-2 text-xs">
          Verificamos automáticamente las direcciones en <strong>@{expectedDomain}</strong>. Con
          otra dirección la solicitud pasa por revisión manual.
        </p>
      )}
      <Textarea
        id="note"
        name="note"
        label="¿Qué cargo tenés en la institución?"
        rows={3}
        maxLength={500}
        placeholder="Ej.: Encargada de comunicación de la Facultad de Ingeniería."
      />

      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
