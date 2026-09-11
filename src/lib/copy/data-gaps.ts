/**
 * The words for a fact we do not have (PR-59).
 *
 * A gap is copy like any other and it is the copy most likely to be typed
 * inline in a hurry — "Sin datos" is three keystrokes and it is already on six
 * surfaces. Keeping it here is what makes the wording one decision instead of
 * six, and what lets `no string "sin datos" in JSX` be a greppable rule.
 *
 * This slice is a **leaf**: `@/lib/search/labels` imports it directly and the
 * filter rail can reach that from a client boundary, so it must never import
 * the composed catalog barrel (`copy/client-bundle.test.ts`). Four short
 * strings is all that may ever reach a browser bundle from here.
 */
export const dataGapsCopy = {
  /**
   * `offerings.modality = 'sin_datos'`. Rendered beside a "Modalidad" term, so
   * it reads "Modalidad: sin datos" wherever the surface supplies the term.
   */
  modality: 'Sin datos',
  /** Where the sentence supplies no term of its own — meta descriptions, OG. */
  modalityInline: 'modalidad sin datos',
  /** The city intro when no offering in the city states a modality at all. */
  modalityCityIntroNone: (cityName: string) =>
    `Ninguna de esas instituciones publica la modalidad de cursado, así que no la mostramos en ${cityName}.`,
  /** The city intro when some do and some do not. */
  modalityCityIntroPartial: (modalities: string) =>
    `Parte de la oferta es de modalidad ${modalities}; el resto no publica la modalidad de cursado.`,
} as const;
