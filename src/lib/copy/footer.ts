/**
 * The footer.
 *
 * `disclaimer` is CLAUDE.md rule 9 — the one sentence that must appear on every
 * page. `copy.test.ts` pins it character for character.
 */
export const footerCopy = {
  linksLabel: 'Enlaces',
  legalLabel: 'Legal',
  legal: {
    privacidad: 'Privacidad',
    terminos: 'Términos',
    fuentes: 'Fuentes de datos',
    contacto: 'Contacto',
  },
  /**
   * CLAUDE.md rule 9. This exact sentence is on every page; `copy.test.ts`
   * pins it character for character.
   */
  disclaimer:
    'educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES.',
} as const;
