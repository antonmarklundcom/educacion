/**
 * `/legal/contacto` — the takedown and data-request path, in one place.
 *
 * `risks.md` §R-06 asks for "a working deletion request path" and
 * `data-sources.md` §2 for "a documented takedown path". Both are the same
 * inbox, so they are one page: a person who wants their data gone and an
 * institution that wants a logo gone should not have to work out which of two
 * pages is theirs.
 *
 * **There is no form here.** A contact form would need a new endpoint, new
 * validation and new abuse control — `POST /api/leads` is for leads and must
 * not become a general mailbox. `mailto:` costs nothing, works offline from our
 * side, and gives the sender their own copy of what they asked for, which for a
 * deletion request is worth more than a confirmation screen.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, LegalSection } from '@/components/legal';
import {
  CONTACT_EMAIL,
  DATA_REQUEST_RESPONSE_WORKING_DAYS,
  TAKEDOWN_RESPONSE_HOURS,
  contactMailto,
} from '@/lib/legal/contact';

export const metadata: Metadata = {
  title: 'Contacto',
  description:
    'Cómo pedir la baja de tus datos, una corrección o el retiro de un contenido en educacion.com.py, y en cuánto tiempo respondemos cada pedido.',
};

const UPDATED = '7 de agosto de 2026';

const REQUESTS = [
  {
    id: 'baja-datos',
    title: 'Quiero que borren mis datos',
    subject: 'Baja de datos',
    who: 'Cualquier persona que haya enviado una solicitud de información desde el sitio.',
    include:
      'El número de celular que cargaste en el formulario. Es el dato con el que encontramos tu solicitud. No hace falta que expliques por qué, y no te vamos a pedir ningún documento.',
    window: `Respondemos dentro de los ${DATA_REQUEST_RESPONSE_WORKING_DAYS} días hábiles confirmando la baja.`,
  },
  {
    id: 'copia-datos',
    title: 'Quiero saber qué tienen sobre mí, o corregir un dato',
    subject: 'Consulta de privacidad',
    who: 'Cualquier persona que haya enviado una solicitud de información.',
    include: 'El número de celular que usaste, y qué querés ver o corregir.',
    window: `Respondemos dentro de los ${DATA_REQUEST_RESPONSE_WORKING_DAYS} días hábiles.`,
  },
  {
    id: 'retiro-contenido',
    title: 'Soy de una institución y quiero que retiren un contenido',
    subject: 'Retiro de contenido',
    who: 'Instituciones, sobre su logotipo, sus fotos o cualquier contenido propio publicado acá.',
    include: 'Qué contenido es, en qué página está, y a qué institución representás.',
    window: `Lo retiramos dentro de las ${TAKEDOWN_RESPONSE_HOURS} horas, sin discutir. Primero lo bajamos, después conversamos si hace falta.`,
  },
  {
    id: 'correccion',
    title: 'Hay un dato equivocado sobre mi institución',
    subject: 'Corrección de datos',
    who: 'Instituciones: nombres, carreras que ya no se dictan, aranceles viejos, estado de acreditación.',
    include:
      'El dato como está publicado, el dato correcto y, si existe, el documento o la página oficial que lo respalda.',
    window: `Respondemos dentro de los ${DATA_REQUEST_RESPONSE_WORKING_DAYS} días hábiles. Un estado de acreditación en disputa pasa a mostrarse como «en revisión» mientras lo verificamos.`,
  },
] as const;

export default function ContactoPage() {
  return (
    <LegalPage
      title="Contacto"
      lead="Un solo correo para todo, y lo lee directamente quien opera el sitio. Acá está qué poner en cada caso y en cuánto tiempo respondemos."
      updated={UPDATED}
    >
      <LegalSection id="canal" number={1} title="El canal">
        <p>
          Escribinos a{' '}
          <a href={contactMailto('Consulta')} className="text-ink font-medium underline">
            {CONTACT_EMAIL}
          </a>
          , con el asunto que corresponda según el caso de abajo. Ese asunto no es un requisito: un
          correo sin él se atiende igual, solo llega más rápido a la fila correcta.
        </p>
        <p>
          Este sitio lo opera una sola persona. No hay un centro de atención, un formulario de
          tickets ni un botón de autogestión, y preferimos decírtelo antes que ofrecerte un canal
          que no atendemos. Los plazos de abajo son los que efectivamente podemos sostener.
        </p>
      </LegalSection>

      <LegalSection id="pedidos" number={2} title="Qué poner según lo que necesites">
        <div className="flex flex-col gap-4">
          {REQUESTS.map((request) => (
            <article
              key={request.id}
              id={request.id}
              className="border-border bg-surface scroll-mt-24 rounded-lg border p-5"
            >
              <h3 className="text-ink text-base font-semibold">{request.title}</h3>
              <dl className="text-body mt-3 flex flex-col gap-2 text-sm leading-relaxed">
                <div>
                  <dt className="text-ink inline font-medium">Asunto: </dt>
                  <dd className="inline font-mono text-sm">{request.subject}</dd>
                </div>
                <div>
                  <dt className="text-ink inline font-medium">Para quién es: </dt>
                  <dd className="inline">{request.who}</dd>
                </div>
                <div>
                  <dt className="text-ink inline font-medium">Qué incluir: </dt>
                  <dd className="inline">{request.include}</dd>
                </div>
                <div>
                  <dt className="text-ink inline font-medium">Plazo: </dt>
                  <dd className="inline">{request.window}</dd>
                </div>
              </dl>
              <p className="mt-4">
                <a
                  href={contactMailto(request.subject)}
                  className="text-ink text-sm font-medium underline"
                >
                  Escribir sobre esto
                </a>
              </p>
            </article>
          ))}
        </div>
      </LegalSection>

      <LegalSection id="limites" number={3} title="Lo que no podemos hacer">
        <p>
          Si pedís la baja de tus datos, borramos lo que está en nuestra base. Pero la institución
          que elegiste{' '}
          <strong className="text-ink font-medium">
            ya recibió una copia de tu solicitud por correo
          </strong>{' '}
          en el momento del envío, y esa copia está en su casilla, no en la nuestra. Podemos
          reenviarle tu pedido, y lo hacemos si nos lo pedís, pero no podemos borrar por ellos ni
          garantizar qué van a hacer. La{' '}
          <Link href="/legal/privacidad" className="text-ink font-medium underline">
            política de privacidad
          </Link>{' '}
          lo explica en detalle.
        </p>
        <p>
          Tampoco somos la vía para trámites oficiales: inscripciones, convalidaciones,
          reconocimiento de títulos o consultas sobre el registro de una carrera se hacen ante el
          organismo que corresponda. Los enlaces están en{' '}
          <Link href="/legal/fuentes" className="text-ink font-medium underline">
            fuentes de datos
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
