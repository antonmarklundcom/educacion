'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` swaps the
 * form for the confirmation without a navigation, and `useFormStatus` disables
 * submit while the request is in flight. The confirmation text is whatever the
 * server returned — this component never decides what happened, because the
 * whole point is that it does not know.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';
import { recoverAction, type RecoverState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Enviando…' : 'Enviar enlace'}
    </Button>
  );
}

export function RecoverForm() {
  const [state, formAction] = useActionState<RecoverState, FormData>(recoverAction, {});

  if (state.sent) {
    return (
      <p role="status" className="text-body text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        id="email"
        name="email"
        type="email"
        label="Correo electrónico"
        autoComplete="username"
        required
        autoFocus
      />
      <SubmitButton />
    </form>
  );
}
