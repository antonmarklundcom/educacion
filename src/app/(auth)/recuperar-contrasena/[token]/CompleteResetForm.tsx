'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` renders a
 * weak-password or mismatched-confirmation refusal without clearing the fields,
 * and `useFormStatus` disables the button while scrypt runs — which takes a
 * deliberate moment and would otherwise invite a double submit against a
 * single-use token.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import { Button, Input } from '@/components/ui';

import { completeResetAction, type CompleteResetState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Guardando…' : 'Guardá la contraseña'}
    </Button>
  );
}

/**
 * `minLength` arrives as a prop rather than as an import of
 * `MIN_PASSWORD_LENGTH`: `@/lib/auth/password` reaches for `node:crypto`, and
 * importing it from a client component pulls the whole crypto polyfill into the
 * browser bundle — 132 kB of it, which `npm run perf:budget` caught. The
 * server page owns the constant, the same way `/reclamar` and
 * `/cambiar-contrasena` already do.
 */
export function CompleteResetForm({
  token,
  email,
  minLength,
}: {
  token: string;
  email: string;
  minLength: number;
}) {
  const action = completeResetAction.bind(null, token);
  const [state, formAction] = useActionState<CompleteResetState, FormData>(action, {});

  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="border-ok/40 bg-ok-bg text-body rounded-md border px-4 py-3 text-sm">
          Listo, tu contraseña quedó cambiada. Entrá con ella.
        </p>
        <Button href="/ingresar" className="w-full">
          Ingresar
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="bg-danger/10 text-danger rounded-md px-4 py-3 text-sm">
          {state.error}
        </p>
      )}

      <p className="text-muted text-sm">
        Estás cambiando la contraseña de <span className="text-ink font-medium">{email}</span>.
      </p>

      <Input
        id="password"
        name="password"
        type="password"
        label={`Nueva contraseña (mínimo ${minLength} caracteres)`}
        autoComplete="new-password"
        minLength={minLength}
        required
      />
      <Input
        id="confirmation"
        name="confirmation"
        type="password"
        label="Repetila"
        autoComplete="new-password"
        minLength={minLength}
        required
      />
      <SubmitButton />

      <p className="text-muted text-sm">
        <Link href="/recuperar-contrasena" className="text-ink underline underline-offset-4">
          Pedir un enlace nuevo
        </Link>
      </p>
    </form>
  );
}
