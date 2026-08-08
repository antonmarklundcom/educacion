'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` renders
 * the upload's rejection message ("no aceptamos SVG", "pesa 400 kB") next to
 * the field, and `useFormStatus` disables the button while the bytes are on
 * their way to R2. The validation itself is server-side
 * (`validateImageUpload`), because a file input's `accept` attribute is a
 * suggestion to the file picker, not a check.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';

export interface LogoUploadState {
  message?: string;
  error?: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Subiendo…' : 'Subir logo'}
    </Button>
  );
}

export function LogoUploadForm({
  institutionId,
  currentLogoUrl,
  action,
}: {
  institutionId: number;
  currentLogoUrl: string | null;
  action: (state: LogoUploadState, formData: FormData) => Promise<LogoUploadState>;
}) {
  const [state, formAction] = useActionState<LogoUploadState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="institutionId" value={institutionId} />

      {currentLogoUrl ? (
        /* The logo host is R2 or the local adapter, neither of which is in
           `images.remotePatterns` — the same exception `design-system.md` §14
           recorded for the homepage strip, on a 96px admin preview. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentLogoUrl}
          alt="Logo actual de la institución"
          width={96}
          height={96}
          className="border-border bg-surface size-24 rounded-md border object-contain p-2"
        />
      ) : (
        <p className="text-muted text-sm">Todavía no hay logo cargado.</p>
      )}

      <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
        Archivo
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          required
          className="text-body file:border-border-strong file:bg-surface file:text-ink text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-2 file:text-sm"
        />
      </label>
      <p className="text-muted text-xs">
        PNG, JPG o WebP, hasta 256 kB. No aceptamos SVG porque puede contener código.
      </p>

      {state.error ? (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="text-ok text-sm">{state.message}</p> : null}

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
