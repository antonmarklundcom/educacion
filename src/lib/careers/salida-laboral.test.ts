import { describe, expect, it } from 'vitest';

import {
  SALIDA_LABORAL_SECTIONS,
  SALIDA_LABORAL_TEMPLATE,
  hasSalidaLaboral,
} from './salida-laboral';

describe('hasSalidaLaboral', () => {
  it('is false for nothing at all', () => {
    expect(hasSalidaLaboral(null)).toBe(false);
    expect(hasSalidaLaboral('')).toBe(false);
  });

  it('is false for the empty template — headings are not content', () => {
    // The page has to be able to tell "an editor opened the form and saved"
    // from "an editor wrote something", or it renders four empty sections.
    expect(hasSalidaLaboral(SALIDA_LABORAL_TEMPLATE)).toBe(false);
  });

  it('is true once there is prose under the headings', () => {
    const written = `## ${SALIDA_LABORAL_SECTIONS[0]}\n\nTrabajan en hospitales públicos y privados, en centros de salud del interior y en laboratorios; una parte sigue en investigación o docencia.`;
    expect(hasSalidaLaboral(written)).toBe(true);
  });
});
