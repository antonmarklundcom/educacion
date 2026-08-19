'use client';

import { ShellError } from '@/components/layout/ShellError';

/**
 * The public shell's boundary. It renders *inside* `(public)/layout.tsx`, so a
 * crash on a programme page keeps the header, the navigation and the R-07
 * independence disclaimer in the footer (CLAUDE.md rule 9) — where falling
 * through to the root boundary would have replaced the whole chrome with a
 * bare error page on the site's most-crawled routes.
 */
export default function PublicError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ShellError
      {...props}
      title="Algo salió mal"
      description="No pudimos cargar esta página. Podés intentar de nuevo o volver más tarde."
    />
  );
}
