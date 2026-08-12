import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui';

/**
 * The root 404 renders inside the root layout, which has no `Footer` — so
 * without this it was the one reachable page in the site with no R-07
 * disclaimer on it (CLAUDE.md rule 9). The shipped `Footer` is mounted here
 * rather than the line being repeated.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-ink text-3xl font-bold">Página no encontrada</h1>
        <p className="text-body">No pudimos encontrar la página que buscás.</p>
        <Button variant="primary" href="/">
          Volver al inicio
        </Button>
      </main>
      <Footer />
    </div>
  );
}
