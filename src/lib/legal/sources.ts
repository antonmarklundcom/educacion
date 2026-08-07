/**
 * What `/legal/fuentes` publishes — the inventory from `data-sources.md` §1,
 * as data rather than as markup.
 *
 * It lives here, not in the page, for one reason: this list is the public face
 * of the attribution posture in `data-sources.md` §2, and PR-33 (data freshness)
 * and any later importer will add a source. A list a page owns gets edited in a
 * page; a list a module owns gets edited next to its test — and the test is
 * what stops a source being ingested without ever appearing here.
 *
 * **Nothing in this file is a claim about a source's content.** Each entry says
 * what we take from it and what we do not, which is the whole point: `caveat`
 * exists so the page can be honest about the parts that are patchy rather than
 * presenting four registers as four equally solid datasets.
 */

export interface DataSource {
  /** Slug, used as the anchor id on the page. */
  id: string;
  name: string;
  /** The organisation as it should be named on screen. */
  organisation: string;
  /** Live link. `null` only for sources that are not one website. */
  url: string | null;
  /** What we take from it. */
  provides: string;
  /** How often we go back for it — the cadence in `data-sources.md` §1. */
  refresh: string;
  /** What it is *not* good for. Shown to the reader, not hidden in a doc. */
  caveat: string;
}

export const DATA_SOURCES: readonly DataSource[] = [
  {
    id: 'cones',
    name: 'CONES',
    organisation: 'Consejo Nacional de Educación Superior',
    url: 'https://www.cones.gov.py/',
    provides:
      'El registro legal: qué universidades e institutos están habilitados y con qué resolución, y qué carreras tienen habilitación vigente.',
    refresh: 'Revisamos el registro una vez por mes.',
    caveat:
      'Una habilitación del CONES no es una acreditación. Nunca convertimos un dato del CONES en un estado de acreditación.',
  },
  {
    id: 'aneaes',
    name: 'ANEAES',
    organisation: 'Agencia Nacional de Evaluación y Acreditación de la Educación Superior',
    url: 'https://www.aneaes.gov.py/',
    provides:
      'Las carreras acreditadas, el modelo de acreditación y el período de vigencia, con su número de resolución.',
    refresh: 'Revisamos el registro una vez por mes.',
    caveat:
      'Si una carrera no aparece acá, mostramos «Sin datos de acreditación» y nunca «No acreditada»: la ausencia de un registro no prueba que la carrera no esté acreditada.',
  },
  {
    id: 'datos-gov-py',
    name: 'datos.gov.py',
    organisation: 'Portal Nacional de Datos Abiertos del Paraguay',
    url: 'https://www.datos.gov.py/',
    provides:
      'El conjunto de datos «Carreras de grado acreditadas – Modelo Nacional», en formato descargable.',
    refresh: 'Lo descargamos cada tres meses.',
    caveat:
      'Es la versión más ordenada de los datos de acreditación, pero puede ir atrás del sitio de la ANEAES. Ante una diferencia, vale la ANEAES.',
  },
  {
    id: 'mec',
    name: 'MEC',
    organisation: 'Ministerio de Educación y Ciencias',
    url: 'https://www.mec.gov.py/',
    provides:
      'Institutos de Formación Docente e institutos técnicos superiores, que no están en el registro del CONES.',
    refresh: 'Lo revisamos dos veces por año.',
    caveat:
      'La información está repartida en varias publicaciones y no siempre está actualizada. Es la fuente menos pareja de las cuatro.',
  },
  {
    id: 'instituciones-web',
    name: 'Sitios de las instituciones',
    organisation: 'Cada universidad o instituto',
    url: null,
    provides:
      'Aranceles, convocatorias, calendarios de examen de ingreso, planes de estudio y datos de contacto.',
    refresh: 'Por cada ciclo de admisión.',
    caveat:
      'Acá no hay registro público: cada dato se releva y se fecha a mano. Un arancel con más de 12 meses de verificado deja de mostrarse en todo el sitio, en vez de mostrarse desactualizado.',
  },
  {
    id: 'instituciones-directo',
    name: 'Las instituciones mismas',
    organisation: 'Cada universidad o instituto',
    url: null,
    provides:
      'Correcciones y datos verificados enviados directamente por la institución. Cuando un dato viene por esta vía, reemplaza al relevado.',
    refresh: 'Cuando la institución nos escribe.',
    caveat:
      'El panel para que cada institución edite sus propios datos todavía no está abierto. Hasta que lo esté, las correcciones llegan por correo y las aplicamos a mano.',
  },
];
