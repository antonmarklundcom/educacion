/**
 * `/legal/terminos` — the terms of use.
 *
 * Kept deliberately short and specific. A page of boilerplate copied from a
 * template would name a company, an address and a registration number we do not
 * have, and CLAUDE.md rule 1 does not stop being true because the text is
 * legal. What is here is what the site actually promises and what it actually
 * refuses to promise.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalList, LegalPage, LegalSection } from '@/components/legal';
import { CONTACT_EMAIL, TAKEDOWN_RESPONSE_HOURS, contactMailto } from '@/lib/legal/contact';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description:
    'Qué es educacion.com.py, qué garantiza y qué no, cómo se usa la información publicada y cómo pedir una corrección.',
};

const UPDATED = '7 de agosto de 2026';

export default function TerminosPage() {
  return (
    <LegalPage
      title="Términos y condiciones"
      lead="Qué es este sitio, para qué sirve y hasta dónde llega lo que podemos garantizarte. Usar educacion.com.py significa que estás de acuerdo con esto."
      updated={UPDATED}
    >
      <LegalSection id="que-es" number={1} title="Qué es educacion.com.py">
        <p>
          Es un sitio privado e independiente que reúne, ordena y permite comparar la oferta de
          educación superior del Paraguay: instituciones, carreras, sedes, aranceles cuando los
          tenemos y estado de acreditación cuando podemos citarlo.
        </p>
        <p>
          <strong className="text-ink font-medium">
            No es un portal oficial del MEC, del CONES ni de la ANEAES
          </strong>{' '}
          y no tiene vínculo con ellos. Tampoco es un sistema de admisión: acá no te inscribís, no
          rendís, no postulás y no se te asigna ningún cupo. En el Paraguay cada facultad maneja su
          propia convocatoria y su propio examen de ingreso, y lo único que hacemos es mostrarte
          dónde está y ponerte en contacto con la institución.
        </p>
      </LegalSection>

      <LegalSection id="informacion" number={2} title="La información que vas a encontrar">
        <p>
          Todo lo publicado sale de registros públicos y del relevamiento de los sitios de cada
          institución. La lista completa de fuentes, con enlaces, está en{' '}
          <Link href="/legal/fuentes" className="text-ink font-medium underline">
            fuentes de datos
          </Link>
          .
        </p>
        <p>
          Ponemos mucho trabajo en que esté bien, y aun así{' '}
          <strong className="text-ink font-medium">
            la información puede tener errores o quedar desactualizada
          </strong>
          . Los aranceles cambian todos los años, las convocatorias se mueven y los registros
          oficiales se publican a su ritmo.
        </p>
        <p>
          Por eso:{' '}
          <strong className="text-ink font-medium">
            antes de tomar una decisión que te compromete —inscribirte, pagar una matrícula, mudarte
            de ciudad— confirmá el dato directamente con la institución
          </strong>
          . Lo que dice la institución vale más que lo que dice este sitio.
        </p>
        <p>
          Lo publicado es información, no asesoramiento. No garantizamos que una carrera vaya a
          seguir dictándose, que un arancel se mantenga, que una acreditación siga vigente ni que un
          título tenga determinada validez o reconocimiento.
        </p>
      </LegalSection>

      <LegalSection id="uso" number={3} title="Cómo podés usar el sitio">
        <p>
          Podés consultarlo, comparar carreras, compartir enlaces y citarnos. Lo que no podés hacer:
        </p>
        <LegalList>
          <li>
            Descargar la base de datos de forma masiva y automatizada, o republicarla como si fuera
            tuya.
          </li>
          <li>
            Usar los datos de contacto de las instituciones para enviarles publicidad no pedida.
          </li>
          <li>
            Enviar solicitudes de información falsas, a nombre de otra persona o con datos de
            terceros.
          </li>
          <li>
            Presentar el sitio como oficial, o dar a entender que actuás en nombre de
            educacion.com.py.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="solicitudes" number={4} title="Cuando pedís información a una institución">
        <p>
          El botón <strong className="text-ink font-medium">Solicitar info</strong> le envía tus
          datos a la institución que elegiste para que te contacte sobre esa carrera. Necesita tu
          autorización expresa, la casilla viene desmarcada y sin marcarla no se envía nada.
        </p>
        <p>
          Nosotros transmitimos el mensaje; no somos parte de lo que venga después.{' '}
          <strong className="text-ink font-medium">
            No garantizamos que la institución te responda
          </strong>
          , ni en cuánto tiempo, ni qué te va a ofrecer, ni las condiciones de una eventual
          inscripción. Qué datos guardamos y por cuánto tiempo está en la{' '}
          <Link href="/legal/privacidad" className="text-ink font-medium underline">
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="instituciones" number={5} title="Nombres, logotipos y contenido ajeno">
        <p>
          Los nombres y logotipos de cada institución le pertenecen a ella. Los usamos únicamente
          para identificarla dentro del directorio, que es un uso informativo, y eso no implica
          ninguna relación, patrocinio ni aval de su parte.
        </p>
        <p>
          Si representás a una institución y querés que retiremos su logotipo o algún contenido, lo
          hacemos dentro de las {TAKEDOWN_RESPONSE_HOURS} horas de recibido el pedido en{' '}
          <a href={contactMailto('Retiro de contenido')} className="text-ink font-medium underline">
            {CONTACT_EMAIL}
          </a>
          , sin condiciones.
        </p>
        <p>
          Los textos, el diseño y la organización del sitio son nuestros. Los datos de los registros
          públicos son públicos y seguirán siéndolo.
        </p>
      </LegalSection>

      <LegalSection id="enlaces" number={6} title="Enlaces a otros sitios">
        <p>
          El sitio enlaza a páginas de instituciones y de organismos oficiales, y ofrece un botón
          para escribir por WhatsApp a las instituciones que publicaron un número. No controlamos
          esos sitios ni esas conversaciones, y no respondemos por su contenido ni por lo que ahí se
          te diga.
        </p>
      </LegalSection>

      <LegalSection id="disponibilidad" number={7} title="Disponibilidad y cambios">
        <p>
          Es un sitio en construcción permanente: agregamos secciones, corregimos datos y a veces se
          cae. No prometemos disponibilidad continua ni que una sección vaya a seguir existiendo.
        </p>
        <p>
          Podemos cambiar estos términos. Cuando lo hagamos, cambia la fecha del encabezado. Si el
          cambio afecta al texto de autorización del formulario, ese texto tiene su propia versión y
          las solicitudes ya enviadas quedan asociadas a la versión que la persona aceptó.
        </p>
      </LegalSection>

      <LegalSection id="ley" number={8} title="Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República del Paraguay. Cualquier controversia
          se somete a los tribunales de la ciudad de Asunción.
        </p>
        <p>
          Antes de eso, escribinos: casi todo se resuelve con un correo a{' '}
          <a href={contactMailto('Consulta')} className="text-ink font-medium underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
