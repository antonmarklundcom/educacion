'use client';

import { Footer } from '@/components/layout/Footer';
import { ShellError } from '@/components/layout/ShellError';

/**
 * The last-resort boundary: a crash in a layout, or on a route outside the
 * three shells. It renders its own `Footer` because there is no shell layout
 * left above it to supply one, and the R-07 disclaimer belongs on every page
 * (CLAUDE.md rule 9).
 *
 * PR-42 moved the body into `ShellError` so the "never render anything derived
 * from the error" rule lives in one file rather than four.
 */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ShellError
        {...props}
        title="Algo salió mal"
        description="Ocurrió un error inesperado. Podés intentar de nuevo."
      />
      <Footer />
    </div>
  );
}
