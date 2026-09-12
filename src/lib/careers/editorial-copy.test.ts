/**
 * The fabrication scan for `data/editorial/careers/*.md` (PR-63,
 * `docs/pr-plan.md` PR-63 accept line 1: "40 files pass the scan").
 *
 * This is a pure text scan over checked-in markdown — no database, no
 * network — so it runs in CI on every PR without a `DATABASE_URL`
 * (`CLAUDE.md` "Commands"). It enforces the hard limits the prompt file
 * (`prompts/sonnet-3-pr63-career-copy.md`) set for this copy:
 *
 *  - no digit anywhere, and no spelled-out number either (a duration, a
 *    price, a count, a salary, a percentage, a year — CLAUDE.md rule 1);
 *  - no institution name;
 *  - no accreditation-status claim about a specific programme ("acreditada" /
 *    "no acreditada"), while still allowing "acreditación" as a concept to
 *    check — the noun does not share the "acreditad" stem the regex bans;
 *  - no ranking word ("mejor", "top", "líder");
 *  - 180–260 words.
 *
 * `INSTITUTION_NAMES` is deliberately hand-maintained, not read off a seeded
 * table: `careers`/`institutions` are populated only by the CONES/ANEAES
 * importers against a live database (`docs/data-sources.md` §1), and no
 * fixture in this repo carries a real institution name (they are all
 * `INSTITUCION DE PRUEBA <letter>`, `src/lib/ingest/__fixtures__/documents.ts`).
 * This list is a defensive net of well-known Paraguayan higher-education
 * names/acronyms, not an exhaustive source of truth — extend it if a new one
 * is ever typed into one of these files.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CAREERS_DIR = path.join(process.cwd(), 'data/editorial/careers');
const EXPECTED_CAREER_COUNT = 40;

const NUMBER_WORDS = [
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciseis',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidos',
  'veintidós',
  'veintitres',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiseis',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
  'cien',
  'ciento',
  'cientos',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
  'mil',
  'millon',
  'millón',
  'millones',
  'primero',
  'primera',
  'segundo',
  'segunda',
  'tercero',
  'tercera',
  'cuarto',
  'cuarta',
  'quinto',
  'quinta',
  'sexto',
  'sexta',
  'septimo',
  'séptimo',
  'septima',
  'séptima',
  'octavo',
  'octava',
  'noveno',
  'novena',
  'decimo',
  'décimo',
  'decima',
  'décima',
];

const RANKING_WORDS = ['mejor', 'mejores', 'top', 'lider', 'líder', 'lideres', 'líderes'];

/**
 * Real full names — see the module doc for why this is hand-maintained.
 *
 * Matched accent- and case-insensitively (`normalize()` below), because the
 * likely way one of these reaches a file is a writer typing it without the
 * accent or in lower case. Review finding: this list was originally matched
 * with a plain case-sensitive `RegExp`, so `universidad nacional de asuncion`
 * sailed straight through the scan that exists to stop it.
 */
const INSTITUTION_NAMES = [
  'Universidad Nacional de Asunción',
  'Universidad Católica',
  'Universidad Autónoma de Asunción',
  'Universidad Americana',
  'Universidad Iberoamericana',
  'Universidad del Pacífico',
  'Universidad Columbia',
  'Universidad Privada del Este',
  'Universidad San Carlos',
  'Universidad Tecnológica Intercontinental',
  'Universidad Nacional de Itapúa',
  'Universidad Nacional del Este',
  'Universidad Nacional de Caaguazú',
  'Universidad Nacional de Concepción',
  'Universidad Nacional de Pilar',
  'Instituto Superior de Educación',
];

/**
 * Acronyms are matched **case-sensitively and in upper case only**, and that
 * is deliberate rather than an oversight: `UNA`, `UNE` and `UPE` are also
 * ordinary Spanish words or fragments ("una carrera"), so folding their case
 * would fail every file in the directory. An acronym only carries
 * institutional meaning in caps.
 */
const INSTITUTION_ACRONYMS = [
  'UNA',
  'UCA',
  'UAA',
  'UNIBE',
  'UPAP',
  'UPE',
  'UTIC',
  'UNE',
  'UNCA',
  'UNP',
  'ISE',
];

/** Lower-cased and accent-stripped, so a missing tilde cannot hide a name. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function listCareerFiles(): string[] {
  return readdirSync(CAREERS_DIR)
    .filter((name) => name.endsWith('.md') && name !== '_index.md')
    .sort();
}

function read(file: string): string {
  return readFileSync(path.join(CAREERS_DIR, file), 'utf-8');
}

describe('career editorial copy — fabrication scan', () => {
  const files = listCareerFiles();

  it(`has exactly ${EXPECTED_CAREER_COUNT} career files`, () => {
    expect(files.length).toBe(EXPECTED_CAREER_COUNT);
  });

  it.each(files)('%s has no digit anywhere', (file) => {
    expect(read(file)).not.toMatch(/[0-9]/);
  });

  it.each(files)('%s has no spelled-out number word', (file) => {
    const text = read(file).toLowerCase();
    for (const word of NUMBER_WORDS) {
      const found = new RegExp(`\\b${word}\\b`, 'i').test(text);
      expect(found, `found number word "${word}" in ${file}`).toBe(false);
    }
  });

  it.each(files)('%s has no accreditation-status claim', (file) => {
    // Bans "acreditada/o(s)" (a claim); "acreditación" does not match this
    // stem, so mentioning it as something to check is unaffected.
    expect(read(file)).not.toMatch(/acreditad\w*/i);
  });

  it.each(files)('%s has no ranking word', (file) => {
    const text = read(file).toLowerCase();
    for (const word of RANKING_WORDS) {
      const found = new RegExp(`\\b${word}\\b`, 'i').test(text);
      expect(found, `found ranking word "${word}" in ${file}`).toBe(false);
    }
  });

  it.each(files)('%s names no institution, however it is accented or cased', (file) => {
    const text = normalize(read(file));
    for (const name of INSTITUTION_NAMES) {
      const found = new RegExp(`\\b${normalize(name)}\\b`).test(text);
      expect(found, `found institution name "${name}" in ${file}`).toBe(false);
    }
  });

  it.each(files)('%s names no institution by acronym', (file) => {
    const text = read(file);
    for (const acronym of INSTITUTION_ACRONYMS) {
      const found = new RegExp(`\\b${acronym}\\b`).test(text);
      expect(found, `found institution acronym "${acronym}" in ${file}`).toBe(false);
    }
  });

  it.each(files)('%s is between 180 and 260 words', (file) => {
    const words = read(file).trim().split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(180);
    expect(words.length).toBeLessThanOrEqual(260);
  });
});
