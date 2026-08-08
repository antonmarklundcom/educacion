'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` renders
 * the refusal — expired link, weak password, institution already claimed —
 * without losing what was typed, and `useFormStatus` disables the button while
 * scrypt runs, which takes a deliberate moment and would otherwise invite a
 * double submit against a single-use token.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Input } from '@/components/ui';
import { completeClaimAction, type ClaimCompleteState } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Confirmando…' : label}
    </Button>
  );
}

export function ClaimCompleteForm({
  token,
  email,
  needsPassword,
  minPasswordLength,
}: {
  token: string;
  email: string;
  needsPassword: boolean;
  /**
   * Passed in rather than imported: `@/lib/auth/password` is where scrypt
   * lives, and importing it from a client component drags `node:crypto` and its
   * polyfills into the browser bundle — 130 kB of hashing code shipped to a
   * page that must never hash anything client-side.
   */
  minPasswordLength: number;
}) {
  const [state, formAction] = useActionState<ClaimCompleteState, FormData>(
    completeClaimAction.bind(null, token),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input id="email" label="Correo verificado" value={email} readOnly disabled />

      {needsPassword ? (
        <>
          <Input id="name" name="name" label="Tu nombre y apellido" autoComplete="name" />
          <Input
            id="password"
            name="password"
            type="password"
            label="Elegí una contraseña"
            autoComplete="new-password"
            minLength={minPasswordLength}
            required
          />
          <Input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            label="Repetila"
            autoComplete="new-password"
            minLength={minPasswordLength}
            required
          />
          <p className="text-faint -mt-2 text-xs">
            Al menos {minPasswordLength} caracteres. Una frase larga es más segura que un
            jeroglífico corto.
          </p>
        </>
      ) : (
        <p className="text-body text-sm">
          Ya tenés una cuenta con esa dirección, así que no te pedimos contraseña nueva: vamos a
          vincular la institución a tu cuenta actual y entrás con la contraseña de siempre.
        </p>
      )}

      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={needsPassword ? 'Confirmá el reclamo' : 'Vinculá mi cuenta'} />
    </form>
  );
}
