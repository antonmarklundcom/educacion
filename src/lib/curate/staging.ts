/**
 * Step 2½: turning a raw payload into the fields of a curated row.
 *
 * `docs/data-sources.md` §3 puts PARSE before MATCH, and the parsers
 * deliberately stop at the source's own words — `levelRaw`, `statusRaw`,
 * `modalityRaw`. Mapping those words onto our enums happens **here, once**,
 * so the vocabulary is auditable in one file instead of smeared across two
 * parsers and an apply step.
 *
 * Three rules govern every mapping below, and none of them are negotiable:
 *
 * 1. **An unrecognized word maps to `null`, never to a default.** A program
 *    whose level we cannot read is a program a human classifies; guessing
 *    `grado` because most programs are grado is fabrication (CLAUDE.md rule 1).
 * 2. **Absence is never negative.** No path here produces `no_acreditada` from
 *    a missing row, a missing column or an empty cell — that is `sin_datos`,
 *    which we represent by proposing *no accreditation row at all*.
 * 3. **CONES is a habilitación source.** `stageConesRecord` cannot emit an
 *    accreditation of any kind; the habilitación resolution lands in
 *    `programs.cones_resolution`, which is a fact about legality, not quality
 *    (`plan.md` §2, `risks.md` §R-09).
 */

import type { AneaesPayload } from '@/lib/ingest/parsers/aneaes';
import type { ConesPayload } from '@/lib/ingest/parsers/cones';
import type { AccreditationStatus } from '@/db/invariants';
import type { MODALITY, PROGRAM_LEVEL } from '@/db/schema';

import { buildCareerMatchKey, buildMatchKey, normalizeName } from './match-key';

export type ProgramLevel = (typeof PROGRAM_LEVEL)[number];
export type Modality = (typeof MODALITY)[number];

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

const LEVELS: Array<[ProgramLevel, readonly string[]]> = [
  ['doctorado', ['DOCTORADO', 'PHD', 'DOCTOR EN']],
  ['maestria', ['MAESTRIA', 'MASTER', 'MAGISTER']],
  ['especializacion', ['ESPECIALIZACION', 'ESPECIALISTA EN']],
  ['tecnicatura', ['TECNICATURA', 'TECNICO SUPERIOR', 'NIVEL TECNICO', 'TECNICATURA SUPERIOR']],
  ['grado', ['GRADO', 'LICENCIATURA', 'CARRERA DE GRADO', 'PREGRADO Y GRADO']],
];

const MODALITIES: Array<[Modality, readonly string[]]> = [
  ['semipresencial', ['SEMIPRESENCIAL', 'SEMI PRESENCIAL', 'MIXTA', 'BLENDED']],
  ['distancia', ['A DISTANCIA', 'DISTANCIA', 'VIRTUAL', 'ONLINE', 'EN LINEA']],
  ['presencial', ['PRESENCIAL']],
];

/**
 * ANEAES status wording → our enum.
 *
 * `no_acreditada` appears here only for a source that says so *in words*. It
 * is still never auto-applied (`apply-rules.ts`): asserting a negative is the
 * legally dangerous claim, so it gets a human even when cited (§R-09).
 * "POSTULANTE" and similar are absent on purpose — an institution having
 * applied is not a status we can render.
 */
const STATUSES: Array<[AccreditationStatus, readonly string[]]> = [
  ['no_acreditada', ['NO ACREDITADA', 'NO ACREDITADO', 'NO ACREDITA']],
  ['en_proceso', ['EN PROCESO', 'EN EVALUACION', 'EN TRAMITE', 'EN ACREDITACION']],
  ['vencida', ['VENCIDA', 'VENCIDO', 'NO VIGENTE', 'CADUCA', 'CADUCADA']],
  ['vigente', ['ACREDITADA', 'ACREDITADO', 'VIGENTE', 'ACREDITACION VIGENTE']],
];

/**
 * Whole-word containment, not substring.
 *
 * `"POSTGRADO".includes("GRADO")` is true, and a naive substring match would
 * therefore file every postgrado as a carrera de grado — a wrong level on
 * every card, from one missing pair of spaces.
 */
function containsPhrase(value: string, needle: string): boolean {
  return ` ${value} `.includes(` ${needle} `);
}

function lookup<T>(raw: string | null | undefined, table: Array<[T, readonly string[]]>): T | null {
  if (!raw) return null;
  const value = normalizeName(raw);
  if (!value) return null;
  for (const [mapped, needles] of table) {
    for (const needle of needles) {
      if (value === needle || containsPhrase(value, needle)) return mapped;
    }
  }
  return null;
}

/** "Grado" → `grado`. Unrecognized → null, and the row goes to a human. */
export function mapLevel(levelRaw: string | null | undefined): ProgramLevel | null {
  return lookup(levelRaw, LEVELS);
}

/** "A distancia" → `distancia`. Unrecognized or absent → null, never a default. */
export function mapModality(modalityRaw: string | null | undefined): Modality | null {
  return lookup(modalityRaw, MODALITIES);
}

/** ANEAES' own wording → our status enum. Unrecognized → null (= sin datos). */
export function mapAccreditationStatus(
  statusRaw: string | null | undefined,
): AccreditationStatus | null {
  return lookup(statusRaw, STATUSES);
}

/**
 * `YYYY-MM-DD` from what these sources actually print: ISO, `DD/MM/YYYY`, or a
 * bare year. Anything else is null — a half-parsed date is a wrong date, and
 * `valid_to` decides whether a badge still renders.
 */
export function parseSourceDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const year = /^(\d{4})$/.exec(value);
  if (year) return `${year[1]}-01-01`;

  return null;
}

/** A citation has to be fetchable by a reader. `./tmp/carreras.html` is not. */
export function httpUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

/* -------------------------------------------------------------------------- */
/* Staged shapes                                                              */
/* -------------------------------------------------------------------------- */

export interface StagedInstitution {
  rawName: string;
  matchKey: string;
  conesCode: string | null;
}

export interface StagedProgram {
  rawName: string;
  matchKey: string;
  level: ProgramLevel | null;
  conesResolution: string | null;
}

export interface StagedPlacement {
  locationRaw: string | null;
  modality: Modality | null;
}

export interface StagedAccreditation {
  status: AccreditationStatus | null;
  model: string | null;
  resolutionNumber: string | null;
  sourceUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** The parser's own verdict, carried through unchanged. */
  citable: boolean;
}

export interface StagedConesRecord {
  institution: StagedInstitution;
  program: StagedProgram | null;
  placement: StagedPlacement;
}

export interface StagedAneaesRecord {
  institution: StagedInstitution;
  program: StagedProgram | null;
  accreditation: StagedAccreditation;
}

export function stageConesRecord(payload: ConesPayload): StagedConesRecord {
  return {
    institution: {
      rawName: payload.institutionName,
      matchKey: buildMatchKey(payload.institutionName),
      conesCode: payload.conesCode,
    },
    program: payload.programName
      ? {
          rawName: payload.programName,
          matchKey: buildCareerMatchKey(payload.programName),
          level: mapLevel(payload.levelRaw),
          // Habilitación, not accreditation. This is the only thing a CONES row
          // is allowed to say about a program's standing.
          conesResolution: payload.resolutionNumber,
        }
      : null,
    placement: {
      locationRaw: payload.locationRaw,
      modality: mapModality(payload.modalityRaw),
    },
  };
}

export function stageAneaesRecord(
  payload: AneaesPayload,
  context: { sourceUrl: string | null },
): StagedAneaesRecord {
  return {
    institution: {
      rawName: payload.institutionName,
      matchKey: buildMatchKey(payload.institutionName),
      conesCode: null,
    },
    program: payload.programName
      ? {
          rawName: payload.programName,
          matchKey: buildCareerMatchKey(payload.programName),
          level: null,
          conesResolution: null,
        }
      : null,
    accreditation: {
      status: mapAccreditationStatus(payload.statusRaw),
      model: payload.modelRaw,
      resolutionNumber: payload.resolutionNumber,
      // The row's own resolution link is the citation. The document URL is a
      // fallback *only* for a row the parser already judged citable, and only
      // when it is a real http(s) address: an import run from a saved file
      // (§3.1) has a local path here, and a path on somebody's laptop is not a
      // citation a badge can link to.
      sourceUrl:
        payload.resolutionUrl ?? (payload.citable ? httpUrlOrNull(context.sourceUrl) : null),
      validFrom: parseSourceDate(payload.validFromRaw),
      validTo: parseSourceDate(payload.validToRaw),
      citable: payload.citable,
    },
  };
}
