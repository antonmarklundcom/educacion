'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` renders
 * the server's validation message in place, and `useFormStatus` disables
 * submit while scrypt runs. The token rides in a hidden field rather than
 * being re-read from the URL here, so the value submitted is the value the
 * page was rendered with.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';
import { resetPasswordAction, type ResetState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Guardando…' : 'Guardar contraseña'}
    </Button>
  );
}

export function ResetForm({ token, minLength }: { token: string; minLength: number }) {
  const [state, formAction] = useActionState<ResetState, FormData>(resetPasswordAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Input
        id="password"
        name="password"
        type="password"
        label="Contraseña nueva"
        autoComplete="new-password"
        minLength={minLength}
        required
        autoFocus
      />
      <Input
        id="confirm"
        name="confirm"
        type="password"
        label="Repetí la contraseña nueva"
        autoComplete="new-password"
        minLength={minLength}
        required
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
