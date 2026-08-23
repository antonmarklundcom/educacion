/**
 * The catalog's guards (PR-47).
 *
 * Three claims are made about this module, and each one has a test that fails
 * without it:
 *
 * 1. **The migration was byte-identical.** `MIGRATED` is the literal Spanish
 *    that was inline in the header, footer, lead modal and browse chrome
 *    before this PR moved it. Change a character in the catalog and this goes
 *    red — which is the only thing standing between "extracted the copy" and
 *    "rewrote the copy while extracting it".
 * 2. **The R-07 disclaimer is intact.** CLAUDE.md rule 9 is one sentence that
 *    must appear on every page; now that one string feeds every footer, that
 *    one string is worth pinning on its own.
 * 3. **The voice stays Paraguayan.** CLAUDE.md rule 8. The tuteo forms below
 *    are the ones a non-Paraguayan writer reaches for by reflex.
 */

import { describe, expect, it } from 'vitest';

import { copy, messages, DEFAULT_LOCALE } from './index';
import { esPY } from './es-py';

/** Every string leaf, flattened to its dotted key path. Functions are called with markers. */
function leaves(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  if (typeof node === 'function') {
    const fn = node as (...args: unknown[]) => string;
    const args = Array.from({ length: fn.length }, (_, i) => `«arg${i}»`);
    return [[prefix, fn(...args)]];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      leaves(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

/**
 * What each key rendered as before PR-47, copied out of the JSX it came from.
 * Keys whose value is a function appear with `«arg0»`, `«arg1»` … where the
 * interpolation goes.
 */
const MIGRATED: Record<string, string> = {
  'brand.name': 'educacion',
  'brand.tld': '.com.py',
  'brand.full': 'educacion.com.py',

  'nav.primaryLabel': 'Principal',
  'nav.mobileLabel': 'Principal, móvil',
  'nav.openMenu': 'Abrir menú',
  'nav.closeMenu': 'Cerrar menú',
  'nav.searchCta': 'Buscar carreras',
  'nav.links.carreras': 'Carreras',
  'nav.links.universidades': 'Universidades',
  'nav.links.becas': 'Becas',
  'nav.links.acreditacion': 'Acreditación',
  'nav.links.paraInstituciones': 'Para instituciones',

  'footer.linksLabel': 'Enlaces',
  'footer.legalLabel': 'Legal',
  'footer.legal.privacidad': 'Privacidad',
  'footer.legal.terminos': 'Términos',
  'footer.legal.fuentes': 'Fuentes de datos',
  'footer.legal.contacto': 'Contacto',
  'footer.disclaimer':
    'educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES.',

  'browse.searchLabel': 'Encontrá tu carrera',
  'browse.searchPlaceholder': 'Ej. Medicina en Asunción',
  'browse.searchSubmit': 'Buscar carreras',
  'browse.sortPrefix': 'Ordenar:',
  'browse.viewGroupLabel': 'Cambiar vista',
  'browse.views.tarjetas': 'Tarjetas',
  'browse.views.tabla': 'Tabla',
  'browse.clearFilters': 'Limpiar filtros',
  'browse.removeFilter': 'Quitar filtro',
  'browse.freeOnly': 'Solo gratuitas',
  'browse.paidOnly': 'Solo con arancel',
  'browse.noUpperBound': 'sin límite',
  'browse.zeroAmount': 'Gs. 0',
  'browse.annualCostChip': 'Arancel anual «arg0» – «arg1»',
  'browse.filterSheet.trigger': 'Filtrar',
  'browse.filterSheet.triggerWithCount': 'Filtrar («arg0»)',
  'browse.filterSheet.dialogLabel': 'Filtrar carreras',
  'browse.filterSheet.heading': 'Filtrar',
  'browse.filterSheet.close': 'Cerrar',
  'browse.filterSheet.closeBackdrop': 'Cerrar filtros',
  'browse.empty.filteredHeading': 'No encontramos carreras con esos filtros',
  'browse.empty.filteredBody':
    'Probá quitando algún filtro o ampliando el rango de arancel. Si buscabas una carrera puntual, escribila con otras palabras.',
  'browse.empty.unloadedHeading': 'Todavía no hay carreras cargadas',
  'browse.empty.unloadedBody':
    'El índice se arma con los registros públicos del CONES y de la ANEAES. Todavía no cargamos ese relevamiento, así que preferimos mostrarte nada antes que datos inventados.',

  'lead.trigger': 'Solicitar info',
  'lead.heading': 'Solicitar información',
  'lead.sentHeading': 'Solicitud enviada',
  'lead.close': 'Cerrar',
  'lead.subtitle': '«arg0» — «arg1»',
  'lead.sentBody':
    'Enviamos tus datos a «arg0». Ellos te van a contactar por el número que dejaste. No los compartimos con nadie más.',
  'lead.fields.name': 'Nombre y apellido',
  'lead.fields.phone': 'Teléfono (WhatsApp)',
  'lead.fields.phoneHint': 'Ejemplo: 0981 123 456',
  'lead.fields.email': 'Email (opcional)',
  'lead.fields.message': 'Mensaje (opcional)',
  'lead.fields.age': 'Edad',
  'lead.fields.honeypot': 'Empresa',
  'lead.submit': 'Enviar solicitud',
  'lead.submitting': 'Enviando…',
  'lead.privacyNoteBefore':
    'Tus datos se envían únicamente a «arg0». Podés pedir que los borremos escribiéndonos — ver ',
  'lead.privacyNoteLink': 'política de privacidad',
  'lead.privacyNoteAfter': '.',
};

/**
 * Keys added after PR-47, pinned the same way. A catalog key with no line here
 * fails the equality test above — which is the point: every string on the site
 * is either migrated verbatim or deliberately written.
 */
const ADDED: Record<string, string> = {
  'totalCost.heading': 'Costo total de la carrera',
  'totalCost.scopeNote':
    'Suma de la matrícula y las cuotas de cada año, más el derecho de examen. No incluye materiales ni traslados, y algunas instituciones cobran aranceles diferenciados.',
  'totalCost.incompleteSuffix': 'total incompleto',
  'totalCost.missingPrefix': 'sin datos de',
  'totalCost.freeNote': 'La carrera es gratuita: el total es el derecho de examen.',
  'totalCost.zeroNote': 'Todos los montos cargados son cero.',
  'totalCost.scopeLabel': 'Sede «arg0»',
  'totalCost.breakdown.annual': 'Costo por año',
  'totalCost.breakdown.duration': 'Duración',
  'totalCost.breakdown.installments': 'Cuotas en total',
  'totalCost.breakdown.admissionFee': 'Derecho de examen',
  'totalCost.gaps.arancel': 'arancel',
  'totalCost.gaps.matricula': 'matrícula',
  'totalCost.gaps.cuota': 'cuota',
  'totalCost.gaps.cuotas_por_ano': 'cantidad de cuotas por año',
  'totalCost.gaps.derecho_examen': 'derecho de examen',
  'totalCost.gaps.duracion': 'duración',
  'totalCost.undetermined.duracion_parcial':
    'la carrera no dura un número entero de años, así que no sabemos cuántas matrículas se pagan',
  'totalCost.undetermined.cuotas_invalidas':
    'la cantidad de cuotas por año que figura no es un número posible, así que no podemos multiplicar las cuotas',
  'totalCost.undetermined.montos_invalidos':
    'alguno de los montos cargados no es un importe posible',
  'totalCost.undetermined.incoherente':
    'el arancel figura como gratuito y a la vez tiene montos cargados',
  'totalCost.compareLabel': 'Costo total',
  'totalCost.cheapest': 'el más barato',

  'panel.leadSla.badge': 'Sin responder',
  'panel.leadSla.waitingDays': 'hace «arg0» días',
  'panel.leadSla.bannerHeading': 'Solicitudes esperando hace más de 48 horas',
  'panel.leadSla.bannerOne': 'Hay 1 solicitud sin responder desde hace más de 48 horas.',
  'panel.leadSla.bannerMany': 'Hay «arg0» solicitudes sin responder desde hace más de 48 horas.',
  'panel.leadSla.bannerBody':
    'Quien la mandó está eligiendo carrera ahora. Abrila, escribile y marcala como contactada.',
  'panel.leadSla.bannerAction': 'Ver las que están esperando',
  'panel.leadSla.dashboardDetail': '«arg0» esperan hace más de 48 horas.',
  'panel.leadSla.dashboardDetailOne': '1 espera hace más de 48 horas.',

  'panel.plan.heading': 'Tu plan: «arg0»',
  'panel.plan.freeName': 'Gratis',
  'panel.plan.dataAlwaysFree':
    'Cargar y corregir tus datos —aranceles, convocatorias, descripciones— es gratis y siempre lo va a ser.',
  'panel.plan.plansLink': 'Mirá los planes',
  'panel.plan.gratisHeadline': 'Estás en el plan Gratis.',
  'panel.plan.gratisDetail':
    'Lo que suma un plan pago es cómo te ve el estudiante y a qué accedés vos.',
  'panel.plan.trialHeadline': 'Estás probando «arg0».',
  'panel.plan.trialDetail': 'La prueba va hasta el «arg0».',
  'panel.plan.activeHeadline': 'Tu plan está activo.',
  'panel.plan.activeDetail': 'El período va hasta el «arg0».',
  'panel.plan.openEndedDetail': 'El período no tiene fecha de término cargada.',
  'panel.plan.endingSoonHeadline': 'Tu período termina el «arg0».',
  'panel.plan.endingSoonDetail':
    'Te vamos a escribir para renovarlo. Si querés adelantarlo, contestá ese mismo hilo.',
  'panel.plan.pastDueHeadline': 'Tenemos un pago pendiente de tu plan.',
  'panel.plan.pastDueDetail':
    'El período terminó el «arg0» y tu plan sigue activo hasta el «arg1» mientras se acredita la transferencia. Si ya la hiciste, escribinos y lo cerramos.',
};

describe('the es-PY catalog', () => {
  const rendered = leaves(esPY);

  it('renders every catalog key exactly, and holds no key nobody pinned', () => {
    // Whole-object equality, deliberately: a key added without a line in one of
    // these two maps is a string nobody read in review, and this is the only
    // place that would have caught it.
    expect(Object.fromEntries(rendered)).toEqual({ ...MIGRATED, ...ADDED });
  });

  it('carries the R-07 disclaimer verbatim — CLAUDE.md rule 9', () => {
    expect(copy.footer.disclaimer).toBe(
      'educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES.',
    );
  });

  it('has no empty or placeholder value', () => {
    for (const [key, value] of rendered) {
      expect(value.trim(), key).not.toBe('');
      // Word-bounded **and** case-sensitive for the two code markers: `todo`
      // is an ordinary Spanish word ("tu plan sigue activo", "todo el año"),
      // and a case-insensitive TODO makes writing correct copy fail CI. A real
      // placeholder is shouted; "Lorem ipsum" is not, so it keeps its `i`.
      expect(value, key).not.toMatch(/\b(TODO|FIXME)\b/);
      expect(value, key).not.toMatch(/\blorem ipsum\b/i);
    }
  });
});

describe('the voice — CLAUDE.md rule 8', () => {
  /** Tuteo forms and peninsular imperatives. Every one of these has a voseo counterpart. */
  const TUTEO =
    /\b(tú|contáctanos|escríbenos|regístrate|inscríbete|tienes|puedes|quieres|debes|necesitas|elige|compara|solicita|busca tu|escribe tu|ingresa tu)\b/i;

  it('uses no tuteo anywhere in the catalog', () => {
    for (const [key, value] of leaves(esPY)) {
      expect(TUTEO.test(value), `${key}: ${value}`).toBe(false);
    }
  });

  it('keeps the voseo forms the surfaces already shipped', () => {
    expect(copy.browse.searchLabel).toContain('Encontrá');
    expect(copy.browse.empty.filteredBody).toContain('Probá');
    expect(copy.lead.privacyNoteBefore('X')).toContain('Podés');
  });
});

describe('the locale seam', () => {
  it('resolves the default locale to the only catalog that exists', () => {
    expect(copy).toBe(messages[DEFAULT_LOCALE]);
    expect(Object.keys(messages)).toEqual([DEFAULT_LOCALE]);
  });
});
