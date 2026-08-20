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

describe('the es-PY catalog', () => {
  const rendered = leaves(esPY);

  it('renders every migrated key exactly as the JSX did before PR-47', () => {
    // Compared key by key rather than whole-object, so a later PR may add keys
    // — but a migrated one that is deleted resolves to `undefined` and fails.
    const actual = Object.fromEntries(rendered);
    const pinned = Object.fromEntries(Object.keys(MIGRATED).map((key) => [key, actual[key]]));
    expect(pinned).toEqual(MIGRATED);
  });

  it('carries the R-07 disclaimer verbatim — CLAUDE.md rule 9', () => {
    expect(copy.footer.disclaimer).toBe(
      'educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES.',
    );
  });

  it('has no empty or placeholder value', () => {
    for (const [key, value] of rendered) {
      expect(value.trim(), key).not.toBe('');
      expect(value, key).not.toMatch(/TODO|FIXME|Lorem/i);
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
