/**
 * `/legal/fuentes` — where every fact on this site comes from.
 *
 * This is the R-07 mitigation doing its work: a domain called
 * `educacion.com.py` that republishes official register data reads as a state
 * portal unless it says, in one place and in detail, that it is not one and
 * where it got everything (`risks.md` §R-07, `data-sources.md` §2). It is also
 * the cheapest possible defence for the republishing itself — attribution.
 *
 * The list is data (`@/lib/legal/sources`) so a new importer cannot add a source
 * without this page noticing.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalList, LegalPage, LegalSection } from '@/components/legal';
import { CONTACT_EMAIL, TAKEDOWN_RESPONSE_HOURS, contactMailto } from '@/lib/legal/contact';
import { DATA_SOURCES } from '@/lib/legal/sources';

export const metadata: Metadata = {
  title: 'Fuentes de datos',
  description:
    'De dónde sale cada dato publicado en educacion.com.py: CONES, ANEAES, datos.gov.py, MEC y los sitios de cada institución, con enlaces y con lo que cada fuente no sirve para decir.',
};

const UPDATED = '7 de agosto de 2026';

export default function FuentesPage() {
  return (
    <LegalPage
      title="Fuentes de datos"
      lead="Todo lo que publicamos sale de registros públicos o del relevamiento de los sitios de cada institución. Acá está la lista completa, con enlaces, y también qué no se puede concluir de cada fuente."
      updated={UPDATED}
    >
      <LegalSection id="independencia" number={1} title="Este sitio no es oficial">
        <p>
          educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, del
          CONES ni de la ANEAES, no está autorizado ni respaldado por ellos, y no tiene ningún
          vínculo institucional con esos organismos.
        </p>
        <p>
          Reproducimos información de registros públicos porque son actos administrativos públicos y
          porque un directorio de interés público existe justamente para eso. No usamos escudos,
          sellos ni logotipos oficiales, y no simulamos ser un trámite del Estado. Para hacer
          cualquier gestión oficial, andá directamente al organismo que corresponda con los enlaces
          de abajo.
        </p>
      </LegalSection>

      <LegalSection id="fuentes" number={2} title="De dónde sale cada dato">
        <p>
          Ordenadas de más a menos formal. La columna que más importa es la última: qué <em>no</em>{' '}
          dice cada fuente.
        </p>
        <div className="flex flex-col gap-4">
          {DATA_SOURCES.map((source) => (
            <article
              key={source.id}
              id={source.id}
              className="border-border bg-surface scroll-mt-24 rounded-lg border p-5"
            >
              <h3 className="text-ink text-base font-semibold">
                {source.url ? (
                  <a href={source.url} rel="noopener noreferrer nofollow" className="underline">
                    {source.name}
                  </a>
                ) : (
                  source.name
                )}
              </h3>
              <p className="text-muted mt-1 text-sm">{source.organisation}</p>
              <p className="text-body mt-3 text-sm leading-relaxed">{source.provides}</p>
              <p className="text-body mt-2 text-sm leading-relaxed">
                <span className="text-ink font-medium">Con qué frecuencia la revisamos:</span>{' '}
                {source.refresh}
              </p>
              <p className="text-body mt-2 text-sm leading-relaxed">
                <span className="text-ink font-medium">Qué no dice:</span> {source.caveat}
              </p>
              {source.url && (
                <p className="text-faint mt-3 font-mono text-xs break-all">{source.url}</p>
              )}
            </article>
          ))}
        </div>
      </LegalSection>

      <LegalSection id="reglas" number={3} title="Las reglas que nos pusimos">
        <p>
          Un directorio como este es útil solo si se puede confiar en él. Estas son las reglas que
          no negociamos:
        </p>
        <LegalList>
          <li>
            <strong className="text-ink font-medium">No inventamos datos.</strong> Si no tenemos el
            arancel de una carrera, decimos que no lo tenemos. No estimamos, no promediamos y no
            completamos huecos.
          </li>
          <li>
            <strong className="text-ink font-medium">
              La falta de un registro nunca es una acusación.
            </strong>{' '}
            Si una carrera no figura como acreditada, mostramos «Sin datos de acreditación», nunca
            «No acreditada». Que no esté en el registro que consultamos no prueba que no lo esté.
          </li>
          <li>
            <strong className="text-ink font-medium">
              Toda acreditación que mostramos lleva su fuente
            </strong>{' '}
            — agencia, número de resolución y fecha — y enlaza al documento original. Si no podemos
            citarla, no la mostramos.
          </li>
          <li>
            <strong className="text-ink font-medium">
              Una habilitación del CONES no es una acreditación de la ANEAES.
            </strong>{' '}
            Son dos cosas distintas y en el sitio se muestran distinto.
          </li>
          <li>
            <strong className="text-ink font-medium">
              Un arancel verificado hace más de 12 meses se sigue mostrando, con un aviso de dato
              desactualizado y la fecha en que lo confirmamos.
            </strong>{' '}
            Preferimos un dato viejo y fechado a ninguno: esconderlo no hacía desaparecer el precio
            de la web de la institución, solo nos quitaba la única forma de avisarte de cuándo es.
          </li>
          <li>
            <strong className="text-ink font-medium">No republicamos los PDF oficiales</strong>:
            enlazamos al documento en el sitio del organismo.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="correcciones" number={4} title="Si hay un dato equivocado">
        <p>
          Trabajar con registros públicos dispersos garantiza que en algún momento vamos a publicar
          algo mal. Cuando pase, queremos enterarnos.
        </p>
        <p>
          Si sos de una institución y algo de tu perfil está mal —el nombre, una carrera que ya no
          se dicta, un arancel viejo, un estado de acreditación— escribinos a{' '}
          <a href={contactMailto('Corrección de datos')} className="text-ink font-medium underline">
            {CONTACT_EMAIL}
          </a>
          . Un estado de acreditación en disputa pasa a mostrarse como «en revisión» mientras lo
          verificamos, no se queda como está.
        </p>
        <p>
          Si querés que retiremos un logotipo o cualquier contenido, lo bajamos dentro de las{' '}
          {TAKEDOWN_RESPONSE_HOURS} horas y sin discutir. Los detalles y los plazos de cada tipo de
          pedido están en la{' '}
          <Link href="/legal/contacto" className="text-ink font-medium underline">
            página de contacto
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
