import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold text-ink">Página no encontrada</h1>
      <p className="text-body">No pudimos encontrar la página que buscás.</p>
      <Button variant="primary" href="/">
        Volver al inicio
      </Button>
    </main>
  );
}
