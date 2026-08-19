'use client';

import { ShellError } from '@/components/layout/ShellError';

/**
 * The admin shell's boundary — renders inside `admin/layout.tsx`, so the
 * sidebar survives and an editor can navigate away from a broken screen
 * instead of losing the whole panel.
 */
export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ShellError
      {...props}
      title="Algo salió mal"
      description="No pudimos cargar esta pantalla. Probá de nuevo; si sigue fallando, anotá la referencia."
    />
  );
}
