/**
 * The privacy policy.
 *
 * **This page describes what the code does, not what we intend it to do.** Every
 * field named below was read off `src/lib/leads/validate.ts`, `createLead()` in
 * `src/db/queries/leads.ts`, `recordEvent()` in `src/lib/events/`, the two
 * digests in `src/lib/privacy/hash.ts` and the mail body in
 * `src/lib/leads/notify.ts`. If one of those changes, this page changes in the
 * same PR — a policy that has drifted from the schema is not a policy.
 *
 * Two things it deliberately does not contain: a GDPR claim (Paraguay has no
 * equivalent statute in force — `risks.md` §R-06, and citing articles that do
 * not bind us would be a claim we cannot support), and a self-service deletion
 * flow (no such UI exists and none is planned before Phase 2, so the path we
 * publish is the one a solo operator can actually honour — `lib/legal/contact`).
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalList, LegalPage, LegalSection } from '@/components/legal';
import { CONSENT_TEXT_VERSION } from '@/lib/leads/contract';
import {
  CONTACT_EMAIL,
  DATA_REQUEST_RESPONSE_WORKING_DAYS,
  contactMailto,
} from '@/lib/legal/contact';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Qué datos guarda educacion.com.py, para qué, a quién se los enviamos, cuánto tiempo los conservamos y cómo pedir que los borremos.',
};

const UPDATED = '7 de agosto de 2026';

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      lead="Acá está, en castellano claro, qué datos tuyos guardamos, para qué, a quién se los enviamos y cómo pedir que los borremos. Si algo de esta página no coincide con lo que el sitio hace, escribinos: es un error nuestro y lo corregimos."
      updated={UPDATED}
    >
      <LegalSection id="quienes-somos" number={1} title="Quiénes somos">
        <p>
          educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, del
          CONES ni de la ANEAES, y no tiene ningún vínculo con esas instituciones.
        </p>
        <p>
          El sitio lo opera una sola persona. No tenemos un oficial de protección de datos ni un
          equipo de soporte: los pedidos que nos hagas los recibe y los responde directamente quien
          opera el sitio, en{' '}
          <a
            href={contactMailto('Consulta de privacidad')}
            className="text-ink font-medium underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="que-guardamos" number={2} title="Qué datos guardamos, y cuándo">
        <p>
          Navegar el sitio no requiere cuenta, no requiere registrarse y no deja ningún dato que te
          identifique. Solo guardamos datos personales cuando vos completás el formulario{' '}
          <strong className="text-ink font-medium">Solicitar info</strong> de una carrera.
        </p>

        <h3 className="text-ink pt-2 font-medium">Cuando enviás una solicitud de información</h3>
        <p>Guardamos exactamente estos campos, y ninguno más:</p>
        <LegalList>
          <li>
            <strong className="text-ink font-medium">Tu nombre</strong> y{' '}
            <strong className="text-ink font-medium">tu número de celular</strong> — obligatorios,
            porque son lo que la institución necesita para contactarte.
          </li>
          <li>
            <strong className="text-ink font-medium">Tu email</strong> y{' '}
            <strong className="text-ink font-medium">tu mensaje</strong> — opcionales. Si los dejás
            vacíos, no guardamos nada en su lugar.
          </li>
          <li>
            <strong className="text-ink font-medium">Tu franja de edad</strong>, tal como la
            elegiste: menos de 18, 18 o más, o «prefiero no decirlo». No guardamos tu fecha de
            nacimiento ni tu edad exacta.
          </li>
          <li>
            <strong className="text-ink font-medium">Tu autorización</strong>: que marcaste la
            casilla, la fecha y hora en que lo hiciste, y la versión exacta del texto que aceptaste
            (hoy, <span className="font-mono text-sm">{CONSENT_TEXT_VERSION}</span>). Guardamos la
            versión para poder responder, dos años después, qué decía exactamente lo que aceptaste.
          </li>
          <li>
            <strong className="text-ink font-medium">La carrera y la institución</strong> sobre las
            que consultaste, y la dirección de la página desde la que enviaste el formulario.
          </li>
          <li>
            <strong className="text-ink font-medium">
              Dos datos técnicos, solo para frenar abusos
            </strong>
            : una huella de tu dirección IP y el identificador de tu navegador. La huella se calcula
            con una clave secreta nuestra y no se puede volver atrás:{' '}
            <strong className="text-ink font-medium">no guardamos tu dirección IP</strong>. Sirve
            únicamente para contar cuántas solicitudes salieron de una misma conexión en un día. No
            se muestra en ninguna pantalla, no se exporta y no se le envía a nadie.
          </li>
        </LegalList>
        <p>
          <strong className="text-ink font-medium">
            Nunca te pedimos cédula, fecha de nacimiento, dirección, datos de salud, ingresos ni
            ningún dato sensible
          </strong>
          , y el formulario no tiene dónde cargarlos.
        </p>

        <h3 className="text-ink pt-2 font-medium">Cuando solo navegás</h3>
        <p>
          Contamos visitas para poder decirle a cada institución cuánta gente miró sus carreras. Ese
          conteo es nuestro, vive en nuestra base de datos y cada registro tiene solo cuatro cosas:
          qué pasó (se vio una carrera, se hizo clic en WhatsApp, se agregó al comparador), de qué
          carrera, de qué institución y cuándo.
        </p>
        <p>
          Junto a eso guardamos una{' '}
          <strong className="text-ink font-medium">huella de sesión</strong>, que sirve para no
          contar diez veces a la misma persona. Se calcula con una clave secreta e incluye la fecha
          del día, así que la huella de hoy no se puede unir con la de mañana: para nosotros una
          «sesión» es un dispositivo en un día y nada más largo que eso. No lleva tu nombre, no
          lleva tu IP y no se puede revertir.
        </p>
      </LegalSection>

      <LegalSection id="para-que" number={3} title="Para qué usamos cada dato">
        <LegalList>
          <li>
            <strong className="text-ink font-medium">Tu nombre, teléfono, email y mensaje</strong>:
            para enviárselos a la institución que elegiste, para que te contacte sobre esa carrera.
            Ese es el único uso.
          </li>
          <li>
            <strong className="text-ink font-medium">Tu franja de edad</strong>: para saber si
            corresponde mostrarte el aviso sobre madre, padre o tutor, y para tratar con más cuidado
            las solicitudes de menores de 18.
          </li>
          <li>
            <strong className="text-ink font-medium">La versión del texto de autorización</strong>:
            para poder demostrar qué autorizaste y cuándo.
          </li>
          <li>
            <strong className="text-ink font-medium">Las huellas de IP y de sesión</strong>: la
            primera para frenar envíos automáticos y abusos, la segunda para contar visitas sin
            saber de quién son.
          </li>
        </LegalList>
        <p>
          No armamos perfiles, no hacemos publicidad dirigida, no cruzamos tus datos con los de
          otros sitios y no tomamos ninguna decisión automatizada sobre vos.
        </p>
      </LegalSection>

      <LegalSection id="a-quien" number={4} title="A quién le enviamos tus datos">
        <p>
          <strong className="text-ink font-medium">
            A la institución que vos elegiste, y a nadie más.
          </strong>{' '}
          Le llega un correo con tu nombre, tu teléfono, tu email y tu mensaje si los dejaste, la
          carrera que consultaste y la página desde la que escribiste. En ese mismo correo le
          indicamos expresamente que no debe revender ni compartir tus datos.
        </p>
        <p>
          Las huellas técnicas del punto 2 no van en ese correo y no salen nunca de nuestra base de
          datos.
        </p>
        <p>
          <strong className="text-ink font-medium">No vendemos datos.</strong> No los compartimos
          con otras instituciones, ni con agencias, ni con redes de portales educativos. Si
          consultás por tres universidades, cada una recibe únicamente su propia consulta y no sabe
          de las otras.
        </p>
        <p>
          Para que el sitio funcione usamos tres proveedores. Cada uno ve solo lo que necesita para
          prestar su servicio, y los dos primeros son los únicos que tocan una solicitud tuya:
        </p>
        <LegalList>
          <li>
            <strong className="text-ink font-medium">Hostinger</strong> — los servidores y la base
            de datos donde vive el sitio.
          </li>
          <li>
            <strong className="text-ink font-medium">Resend</strong> — el servicio que entrega a la
            institución el correo con tu solicitud.
          </li>
          <li>
            <strong className="text-ink font-medium">Plausible</strong> — medición de visitas, y
            solo si aceptaste el cartel. Nunca recibe solicitudes de información ni ningún dato del
            formulario. Ver el punto 5.
          </li>
        </LegalList>
        <p>
          Además, podemos entregar datos si nos lo ordena una autoridad competente del Paraguay. No
          lo haríamos por un pedido informal.
        </p>
      </LegalSection>

      <LegalSection id="cookies" number={5} title="Cookies y las dos formas de medir">
        <p>
          Acá hay dos cosas distintas que se llaman «medición», y no son lo mismo. El cartel de
          cookies gobierna una sola de las dos, y conviene que sepas cuál.
        </p>
        <p>
          <strong className="text-ink font-medium">
            La herramienta externa (Plausible) sí depende de vos.
          </strong>{' '}
          Es una empresa distinta a la nuestra, y cargar su script significa que tu navegador le
          hace un pedido a sus servidores, con tu dirección IP y la página que estás mirando. Eso es
          lo que el cartel te pregunta. Si no aceptás, ese script no se carga en ningún momento — y
          si nunca respondiste, tampoco: sin respuesta, la respuesta es no.
        </p>
        <p>
          <strong className="text-ink font-medium">
            Nuestro conteo propio no depende del cartel
          </strong>
          , y te explicamos por qué. No pone ninguna cookie, no escribe nada en tu teléfono ni en tu
          computadora, y la huella de sesión se calcula en nuestro servidor y cambia todos los días.
          No hay nada en tu dispositivo que consentir, porque nunca tocamos tu dispositivo. Y es de
          donde salen los números que cada institución nos pide: ese es un uso que preferimos
          declararte de frente, en esta página, antes que esconderlo detrás de un botón. Ese conteo
          no guarda nada que te identifique.
        </p>
        <p>
          Guardamos una única cookie propia: <span className="font-mono text-sm">ec_consent</span>,
          que solo anota tu respuesta al cartel — «acepto» o «no acepto» — para no volver a
          preguntarte en cada página. Dura seis meses, tanto si aceptaste como si rechazaste, y
          después volvemos a preguntar una vez. Borrando las cookies de tu navegador la eliminás.
        </p>
      </LegalSection>

      <LegalSection id="cuanto-tiempo" number={6} title="Cuánto tiempo guardamos tus datos">
        <p>
          <strong className="text-ink font-medium">
            Las solicitudes de información se guardan como máximo 24 meses
          </strong>{' '}
          desde el día en que las enviaste, y después se borran. Ese plazo existe porque una
          consulta sobre una carrera deja de tener sentido bastante antes de los dos años, y porque
          un dato que ya no se usa es solo un riesgo guardado.
        </p>
        <p>
          Siendo transparentes: hoy esa depuración la hacemos a mano. No hay todavía un proceso
          automático que borre las solicitudes vencidas, y estamos construyéndolo. El plazo es un
          compromiso que asumimos y que podés reclamarnos; si querés que tus datos se borren antes,
          el punto 7 explica cómo pedirlo y no hace falta que des ningún motivo.
        </p>
        <p>
          Los registros de visitas del punto 2 no tienen fecha de borrado porque no identifican a
          ninguna persona: son un tipo de evento, dos números de carrera e institución, y una huella
          que ya al día siguiente no se puede vincular con nada.
        </p>
      </LegalSection>

      <LegalSection id="borrado" number={7} title="Cómo pedir que borremos tus datos">
        <p>
          Escribinos a{' '}
          <a href={contactMailto('Baja de datos')} className="text-ink font-medium underline">
            {CONTACT_EMAIL}
          </a>{' '}
          con el asunto <strong className="text-ink font-medium">Baja de datos</strong>. Lo recibe
          directamente quien opera el sitio.
        </p>
        <p>
          Para encontrar tu solicitud necesitamos{' '}
          <strong className="text-ink font-medium">el número de celular que cargaste</strong> en el
          formulario, porque es el dato con el que la buscamos. No hace falta que expliques por qué,
          y no te vamos a pedir una foto de tu cédula ni ningún otro documento.
        </p>
        <p>
          <strong className="text-ink font-medium">
            Te respondemos dentro de los {DATA_REQUEST_RESPONSE_WORKING_DAYS} días hábiles
          </strong>{' '}
          confirmándote que se borró. Con el mismo correo y el mismo plazo podés pedirnos una copia
          de lo que tenemos guardado sobre vos, o que corrijamos un dato equivocado.
        </p>
        <p>
          Una aclaración importante y honesta:{' '}
          <strong className="text-ink font-medium">
            la institución ya recibió una copia de tu solicitud por correo
          </strong>{' '}
          en el momento en que la enviaste. Nosotros borramos lo nuestro, pero no podemos borrar lo
          que está en la casilla de otra organización. Si querés que ellos también lo borren, tenés
          que pedírselo a la institución; si nos lo pedís, les reenviamos el pedido, aunque no
          podemos garantizar qué van a hacer.
        </p>
        <p className="text-muted text-sm">
          No tenemos una pantalla de autogestión para esto: el sitio todavía no tiene cuentas de
          estudiante, y preferimos publicar un canal que efectivamente atendemos antes que un botón
          que no existe.
        </p>
      </LegalSection>

      <LegalSection id="menores" number={8} title="Si tenés menos de 18 años">
        <p>
          Buena parte de quienes usan este sitio están terminando el colegio, así que esto importa.
          El formulario te pregunta tu franja de edad y, si indicás que tenés menos de 18, te
          muestra este aviso antes de enviar: pedile a tu madre, padre o tutor que sepa que estás
          enviando estos datos.
        </p>
        <p>
          Recogemos lo mínimo justamente por esto: nombre y teléfono, nada de documentos ni
          direcciones. Si sos madre, padre o tutor y querés que borremos la solicitud de tu hijo o
          hija, escribinos por el punto 7 con el número de celular que se cargó y la damos de baja
          con el mismo plazo, sin discutir.
        </p>
      </LegalSection>

      <LegalSection id="marco-legal" number={9} title="Bajo qué reglas trabajamos">
        <p>
          Te lo decimos tal cual es: el Paraguay no tiene todavía una ley general de protección de
          datos personales comparable a la europea. Rige la Ley 1682/01, modificada por la Ley
          1969/02, sobre información de carácter privado, y la Ley 6534/2020, que es específica para
          datos crediticios y no se aplica a este sitio.
        </p>
        <p>
          Aun así tomamos el estándar de esa última como referencia propia, porque nos parece el
          correcto: consentimiento expreso, casilla desmarcada por defecto, cuidado especial con los
          menores de edad y recolección mínima. No decimos que cumplimos el GDPR europeo, porque no
          nos alcanza y afirmarlo sería falso; decimos lo que hacemos, y podés medirnos contra esta
          página.
        </p>
      </LegalSection>

      <LegalSection id="cambios" number={10} title="Cambios en esta política">
        <p>
          Si cambiamos algo, cambiamos la fecha de arriba. Si el cambio afecta al texto que aceptás
          al enviar el formulario, ese texto lleva su propia versión y las solicitudes enviadas
          antes quedan asociadas a la versión anterior: nunca vamos a dar por aceptado un texto que
          la persona no llegó a leer.
        </p>
      </LegalSection>

      <LegalSection id="contacto" number={11} title="Contacto">
        <p>
          Cualquier consulta, pedido de baja, corrección o reclamo sobre tus datos:{' '}
          <a
            href={contactMailto('Consulta de privacidad')}
            className="text-ink font-medium underline"
          >
            {CONTACT_EMAIL}
          </a>
          . En la página de{' '}
          <Link href="/legal/contacto" className="text-ink font-medium underline">
            contacto
          </Link>{' '}
          están todos los canales y los plazos en los que respondemos cada tipo de pedido.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
