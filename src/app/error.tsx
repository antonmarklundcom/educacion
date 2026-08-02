'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

/** Segment error boundary. Must be a client component — Next.js requirement. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold text-ink">Algo salió mal</h1>
      <p className="text-body">Ocurrió un error inesperado. Podés intentar de nuevo.</p>
      <Button variant="primary" onClick={reset}>
        Reintentar
      </Button>
    </main>
  );
}
