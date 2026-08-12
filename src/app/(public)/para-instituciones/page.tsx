/**
 * `/para-instituciones` — the B2B page (PR-26).
 *
 * Three constraints shaped it, and all three come from documents rather than
 * from taste:
 *
 * 1. **Prices render from the `plans` table** (`pr-plan.md` PR-26), so the page
 *    and `/admin/suscripciones` cannot quote different numbers.
 * 2. **No fabricated customer logos or testimonials** (CLAUDE.md rule 1). We
 *    have no customers yet. A "confían en nosotros" strip of invented names is
 *    the fastest way to lose the credibility the rest of the product is built
 *    on — the same call PR-13 made for the homepage logo strip.
 * 3. **The screenshots this PR was asked for are deferred, not faked.** They
 *    have to be captured from a real signed-in `/panel` with a real
 *    institution's own data; there is no such account yet, and a mocked panel
 *    filled with a plausible university and plausible aranceles is a fabricated
 *    screenshot of a product claim. `PANEL_SHOTS` below is the slot: fill it and
 *    the section appears, with no other change. Until then the page describes
 *    the panel in words and links to the real thing, which is honest and costs
 *    the page nothing it can prove.
 *
 * Server component, zero client JS. The CTA is a `mailto:` to the one address
 * the operator actually reads (`lib/legal/contact.ts`) — there is no
 * institution-facing WhatsApp number on file, and publishing a plausible one
 * would be the same fabrication the rest of the page refuses.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { PlanCards } from '@/components/sales/PlanCards';
import { Button, Card } from '@/components/ui';
import { listPlans } from '@/db/queries/plans';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal/contact';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Para instituciones',
  description:
    'Tu institución ya está publicada y listada gratis. Los planes agregan perfil verificado, los datos de contacto de cada solicitud, estadísticas y ubicación destacada, siempre etiquetada.',
  alternates: { canonical: '/para-instituciones' },
};

/**
 * Real captures of the real panel, or nothing. Each entry needs a file in
 * `public/`, an accurate caption and an institution that agreed to appear.
 * Empty until then — see the file docstring.
 */
const PANEL_SHOTS: { src: string; alt: string; caption: string }[] = [];

/** The sections of `/panel` as they exist today. Wording follows `PanelNav`. */
const PANEL_SECTIONS = [
  {
    title: 'Mis carreras',
    detail:
      'Todo lo que publicamos de cada carrera tuya, con lo que podés cambiar solo y lo que pasa por revisión nuestra porque sale del registro público.',
  },
  {
    title: 'Sedes y aranceles',
    detail:
      'Cargás el arancel y se ve en el comparador enseguida. Un arancel con más de 12 meses deja de mostrarse, así que acá también ves cuáles ya no están a la vista.',
  },
  {
    title: 'Convocatorias',
    detail:
      'Las fechas de inscripción y de examen. De acá sale el estado “Inscripciones abiertas” que ve el estudiante.',
  },
  {
    title: 'Solicitudes',
    detail:
      'Cada estudiante que pidió información sobre una carrera tuya, con su estado: contactado, calificado, descartado.',
  },
  {
    title: 'Equipo',
    detail: 'Quién de tu institución puede entrar y qué puede hacer.',
  },
] as const;

const FAQ = [
  {
    q: '¿Tenemos que pagar para aparecer?',
    a: 'No, y no va a cambiar. El índice sale de los registros públicos del CONES y la ANEAES: si tu institución está habilitada, está publicada. Un directorio donde solo aparece quien paga no le sirve a ningún estudiante y no lo vamos a construir.',
  },
  {
    q: '¿Corregir nuestros datos es parte del plan?',
    a: 'No, es gratis para todos. Aranceles, convocatorias, descripciones, plan de estudio: los cargás desde el panel y se ven enseguida, tengas plan o no. El arancel correcto es lo que más nos importa del sitio; cobrar por corregirlo sería empeorar el producto a propósito.',
  },
  {
    q: 'Sin plan, ¿perdemos las solicitudes?',
    a: 'No. El correo con los datos del estudiante te llega igual, porque al estudiante le dijimos que sus datos se envían a la institución que eligió y eso se cumple. Lo que agrega el plan es la bandeja: los datos de contacto dentro del panel, el seguimiento por estado y la exportación.',
  },
  {
    q: '¿Podemos pagar para cambiar nuestro estado de acreditación?',
    a: 'No. La acreditación sale de la ANEAES y la habilitación del CONES, siempre con la resolución o el enlace a la fuente, y ningún plan la toca. Si algo está mal, lo disputás desde el panel: la insignia se suspende en el momento y lo revisamos con la fuente en la mano.',
  },
  {
    q: '¿Qué significa exactamente “Destacado”?',
    a: 'Ubicación preferente en los resultados, y siempre con la etiqueta “Destacado” a la vista. No cambia el orden que pidió el estudiante ni mete tu carrera en resultados que su filtro dejó afuera: solo desempata entre carreras que ya empataban.',
  },
  {
    q: '¿Cómo se factura?',
    a: 'Transferencia bancaria y factura con IVA. Cotizamos en dólares porque es la referencia estable de un contrato anual, y facturamos en guaraníes al cambio del día. No hay tarjeta ni débito automático: son quince contratos por año, no hace falta.',
  },
  {
    q: '¿El contrato es anual?',
    a: 'Sí, y alineado al ciclo de admisión: se conversa entre agosto y octubre y corre de noviembre a octubre. Vender en marzo es venderle a un presupuesto que ya se gastó.',
  },
  {
    q: '¿Podemos pedir que nos saquen del sitio?',
    a: 'Lo que sale del registro público (que la institución existe, sus carreras habilitadas, su acreditación publicada) se queda, con tu derecho a réplica visible en el perfil. Lo que aportás vos —descripciones, fotos, aranceles— lo sacás cuando quieras, y el logo lo bajamos con un mensaje.',
  },
] as const;

export default async function ParaInstitucionesPage() {
  const plans = await listPlans();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-4">
        <h1 className="text-ink text-2xl font-bold sm:text-3xl">
          Tu institución ya está acá. Esto es lo que podés hacer con eso.
        </h1>
        <p className="text-body max-w-prose text-base leading-relaxed">
          educacion.com.py publica la oferta de educación superior del país entera y gratis, salida
          de los registros públicos. Cuando una familia compara carreras, tu institución aparece
          igual. Lo que vendemos es cómo aparece, qué podés ver de lo que pasa y a quién podés
          contactar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button href={contactMailto('Planes para instituciones')}>Pedí una demo</Button>
          <Button variant="secondary" href="/panel">
            Ya tenemos cuenta
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">Por qué te conviene que esto exista</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-ink text-base font-semibold">El arancel decide</h3>
            <p className="text-body text-sm leading-relaxed">
              Es lo primero que compara una familia y casi nadie lo publica claro. Si el tuyo está
              cargado y verificado, competís en el número que la gente mira primero. Si no, ve
              “Consultá el arancel” y sigue de largo.
            </p>
          </Card>
          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-ink text-base font-semibold">La acreditación se pregunta</h3>
            <p className="text-body text-sm leading-relaxed">
              Somos el único lugar donde se puede filtrar por estado de acreditación con la
              resolución a la vista. Si tenés carreras acreditadas, esa es tu ventaja y acá se ve.
            </p>
          </Card>
          <Card className="flex flex-col gap-2 p-5">
            <h3 className="text-ink text-base font-semibold">Los números son tuyos</h3>
            <p className="text-body text-sm leading-relaxed">
              Vistas, clics a WhatsApp y solicitudes de tus carreras, contados del lado del
              navegador para que un robot no infle nada. Es un dato que Analytics no te puede dar
              por institución.
            </p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-ink text-xl font-semibold">Planes</h2>
          <p className="text-muted max-w-prose text-sm">
            Un contrato por institución, con el precio por banda según cuántos programas publicás.
            Cotizado en dólares, facturado en guaraníes al cambio del día.
          </p>
        </div>
        <PlanCards plans={plans} />
        <p className="text-faint max-w-prose text-xs">
          Los precios de esta tabla salen de la misma tabla que usa nuestra administración para
          activar un plan. Si acá dice un número, ese es el número.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">El panel, en concreto</h2>
        <p className="text-body max-w-prose text-base leading-relaxed">
          Todo se maneja desde <span className="font-medium">/panel</span>, con tu propia cuenta.
          Cada institución ve solamente lo suyo.
        </p>

        {PANEL_SHOTS.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {PANEL_SHOTS.map((shot) => (
              <figure key={shot.src} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.src}
                  alt={shot.alt}
                  loading="lazy"
                  className="border-border w-full rounded-md border"
                />
                <figcaption className="text-muted text-xs">{shot.caption}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-3 text-sm">
            Todavía no publicamos capturas del panel: las que valen son de una institución real con
            sus datos reales, y eso se pide, no se arma. Pedinos una demo y te lo mostramos en vivo.
          </p>
        )}

        <dl className="flex flex-col gap-4">
          {PANEL_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-1">
              <dt className="text-ink text-base font-medium">{section.title}</dt>
              <dd className="text-body max-w-prose text-sm leading-relaxed">{section.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">Lo que no hacemos</h2>
        <ul className="text-body marker:text-faint flex max-w-prose list-disc flex-col gap-2 pl-5 text-base leading-relaxed">
          <li>
            No cambiamos un estado de acreditación por dinero, ni lo suavizamos. Sale de la fuente y
            se cita.
          </li>
          <li>
            No escondemos a las instituciones que no pagan. El índice completo es el producto: si se
            rompe eso, no queda nada que vender.
          </li>
          <li>
            No vendemos ubicación sin etiquetarla. Toda ubicación paga dice “Destacado” donde el
            estudiante la ve.
          </li>
          <li>
            No compartimos los datos de una solicitud con ninguna institución que no sea la que
            eligió el estudiante, ni los revendemos a nadie.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-xl font-semibold">Preguntas que nos hacen</h2>
        <dl className="flex flex-col gap-5">
          {FAQ.map((item) => (
            <div key={item.q} className="flex flex-col gap-1.5">
              <dt className="text-ink text-base font-medium">{item.q}</dt>
              <dd className="text-body max-w-prose text-sm leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-border flex flex-col gap-4 border-t pt-8">
        <h2 className="text-ink text-xl font-semibold">Hablemos</h2>
        <p className="text-body max-w-prose text-base leading-relaxed">
          Escribinos a{' '}
          <a
            href={contactMailto('Planes para instituciones')}
            className="text-ink font-medium underline"
          >
            {CONTACT_EMAIL}
          </a>{' '}
          y coordinamos una demo de veinte minutos: te mostramos el panel con tu propia institución
          cargada y los números que ya tenemos de tus carreras. Si después no te sirve, te quedás
          igual con el listado gratis y no pasa nada.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button href={contactMailto('Planes para instituciones')}>Pedí una demo</Button>
          <Button variant="secondary" href="/universidades">
            Mirá cómo se ve una institución
          </Button>
        </div>
        <p className="text-faint max-w-prose text-xs">
          ¿Todavía no reclamaste tu perfil? Se hace desde la página de tu institución, con un correo
          de tu dominio institucional —{' '}
          <Link href="/universidades" className="underline underline-offset-4">
            buscá tu institución acá
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
