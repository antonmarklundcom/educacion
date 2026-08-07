/**
 * The closing CTA — the second and last accent on the page (design-system.md
 * §2). Its secondary sits beside it as an outline, never as a peer (§8.2), and
 * it points at `/universidades`, which is shipped: the other candidate,
 * `/para-instituciones`, is still a placeholder.
 */

import { Button } from '@/components/ui';

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="border-border bg-surface rounded-lg border p-6 text-center lg:p-10"
    >
      <h2 id="final-cta-heading" className="text-ink text-lg font-semibold lg:text-xl">
        ¿Todavía no sabés por dónde empezar?
      </h2>
      <p className="text-body mx-auto mt-2 max-w-prose text-sm">
        Abrí el buscador con el índice completo y filtrá por nivel, ciudad, modalidad, arancel y
        acreditación hasta que queden las opciones que te sirven.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button href="/carreras">Ver todas las carreras</Button>
        <Button href="/universidades" variant="secondary">
          Ver universidades e institutos
        </Button>
      </div>
    </section>
  );
}
