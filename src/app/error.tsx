'use client';

import { useEffect } from 'react';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui';

/** Segment error boundary. Must be a client component — Next.js requirement. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-bold text-ink">Algo salió mal</h1>
        <p className="text-body">Ocurrió un error inesperado. Podés intentar de nuevo.</p>
        <Button variant="primary" onClick={reset}>
          Reintentar
        </Button>
      </main>
      <Footer />
    </div>
  );
}
