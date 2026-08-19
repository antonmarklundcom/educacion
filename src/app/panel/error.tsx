'use client';

import { ShellError } from '@/components/layout/ShellError';

/**
 * The institution panel's boundary — renders inside `panel/layout.tsx`, so the
 * panel navigation and the footer disclaimer stay put while one screen fails.
 */
export default function PanelError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ShellError
      {...props}
      title="Algo salió mal"
      description="No pudimos cargar esta pantalla. Probá de nuevo; si sigue fallando, escribinos."
    />
  );
}
